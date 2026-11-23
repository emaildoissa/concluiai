import { Router } from 'express';
import { getTodayBR } from '@concluiai/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { checkCriticalOverdueTasks, dispatchNonComplianceAlert } from '../jobs/alerts.js';
import { generateTasksForDate } from '../services/tasks.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { getSignedEvidenceUrl } from '../services/evidences.js';

export const tasksRouter = Router();

/**
 * POST /api/tasks/generate-today
 * Gera instâncias do dia a partir de checklists ativos + checklist_units
 */
const DEFAULT_COMPANY_ID = '11111111-1111-1111-1111-111111111111';

tasksRouter.post(
  '/generate-today',
  requireAuth,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const date = (req.body?.date as string) || getTodayBR();
      const companyId = req.user?.company_id || DEFAULT_COMPANY_ID;
      const { created } = await generateTasksForDate({ date, companyId });
      return res.json({ created, date });
    } catch (err) {
      console.error('[generate-today]', err);
      return res.status(500).json({ error: 'Falha ao gerar tarefas' });
    }
  }
);

/** POST /api/tasks/run-alerts — dispara job de alertas manualmente */
tasksRouter.post(
  '/run-alerts',
  requireAuth,
  requireRole('admin', 'manager'),
  async (_req, res) => {
    try {
      const result = await checkCriticalOverdueTasks();
      return res.json(result);
    } catch (err) {
      console.error('[run-alerts]', err);
      return res.status(500).json({ error: 'Falha ao rodar alertas' });
    }
  }
);

const NOT_DONE_STATUSES = ['pending', 'in_progress', 'late', 'rejected'];

function extractChecklistMeta(item: unknown): {
  shift: string | null;
  sector: { id: string; name: string } | null;
} {
  const rawCl = (
    item as {
      checklist?:
        | {
            shift?: string | null;
            sector_id?: string | null;
            sector?: { id: string; name: string } | { id: string; name: string }[] | null;
          }
        | {
            shift?: string | null;
            sector_id?: string | null;
            sector?: { id: string; name: string } | { id: string; name: string }[] | null;
          }[]
        | null;
    } | null
  )?.checklist;
  const cl = Array.isArray(rawCl) ? rawCl[0] : rawCl;
  const rawSector = cl?.sector;
  const sector = Array.isArray(rawSector) ? rawSector[0] : rawSector;
  return {
    shift: cl?.shift || null,
    sector: sector?.id ? { id: sector.id, name: sector.name } : null,
  };
}

/**
 * GET /api/tasks/pendings?unitId=&status=&critical=&date=
 * Lista tarefas não concluídas ou em atraso com dados de auditoria (alerta ao gerente, tempo decorrido, etc).
 */
tasksRouter.get('/pendings', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = req.user?.company_id || DEFAULT_COMPANY_ID;

    const { unitId, status, critical, date } = req.query as {
      unitId?: string;
      status?: string;
      critical?: string;
      date?: string;
    };

    const today = getTodayBR();
    const queryDate = date || today;

    // Garante que as rotinas do dia estejam sempre geradas
    if (queryDate === today) {
      try {
        await generateTasksForDate({ date: today, companyId });
      } catch (e) {
        console.warn('[tasks/pendings] Auto-geração de rotinas do dia ignorada:', e);
      }
    }

    let query = sb.from('task_instances').select(
      `
        id, status, due_at, scheduled_date, completed_at, notes, recorded_value, is_compliant, non_compliance_action,
        unit:units ( id, name, address ),
        checklist_item:checklist_items ( id, title, is_critical, item_type, unit_of_measurement, min_value, max_value, due_time, checklist_id, checklist:checklists ( id, name, shift, sector_id, sector:sectors ( id, name ) ) ),
        operator:profiles ( id, full_name, phone )
      `
    );

    // Restringe às unidades da empresa (tolerante a company_id ou null para single/multi-tenant)
    const userCompanyId = req.user?.company_id;
    let unitQuery = sb.from('units').select('id');
    if (userCompanyId) {
      unitQuery = unitQuery.eq('company_id', userCompanyId);
    } else {
      unitQuery = unitQuery.or(`company_id.eq.${DEFAULT_COMPANY_ID},company_id.is.null`);
    }
    const { data: units } = await unitQuery;
    const unitIds = (units || []).map((u) => u.id);
    if (unitIds.length === 0) return res.json({ tasks: [] });
    query = query.in('unit_id', unitIds);

    if (unitId) query = query.eq('unit_id', unitId);
    if (status && status !== 'all') query = query.eq('status', status);
    else if (!status) query = query.in('status', NOT_DONE_STATUSES);
    query = query.eq('scheduled_date', queryDate);

    query = query.order('due_at', { ascending: true });

    const { data: tasks, error } = await query;
    if (error) throw error;

    const taskIds = (tasks || []).map((t) => t.id);

    // Busca alertas já emitidos
    const alertMap = new Map<string, { alertedAt: string; status: string; recipientPhone?: string }>();
    if (taskIds.length > 0) {
      const { data: alerts } = await sb
        .from('alert_logs')
        .select('task_instance_id, status, created_at, recipient_phone')
        .in('task_instance_id', taskIds)
        .order('created_at', { ascending: false });

      for (const a of alerts || []) {
        if (a.task_instance_id && !alertMap.has(a.task_instance_id)) {
          alertMap.set(a.task_instance_id, {
            alertedAt: a.created_at,
            status: a.status,
            recipientPhone: a.recipient_phone,
          });
        }
      }
    }

    // Busca evidências fotográficas
    const evidenceMap = new Map<string, { photoUrl: string; reviewStatus: string; aiReason?: string; aiConfidence?: number; capturedAt: string }>();
    if (taskIds.length > 0) {
      const { data: evs } = await sb
        .from('evidences')
        .select('id, task_instance_id, photo_url, review_status, ai_reason, ai_confidence, captured_at')
        .in('task_instance_id', taskIds)
        .order('captured_at', { ascending: false });

      const uniqueEvs = (evs || []).filter((ev) => {
        if (!ev.task_instance_id || evidenceMap.has(ev.task_instance_id)) return false;
        evidenceMap.set(ev.task_instance_id, {
          photoUrl: ev.photo_url,
          reviewStatus: ev.review_status,
          aiReason: ev.ai_reason,
          aiConfidence: ev.ai_confidence,
          capturedAt: ev.captured_at,
        });
        return true;
      });

      await Promise.all(
        uniqueEvs.map(async (ev) => {
          if (!ev.task_instance_id || !ev.photo_url) return;
          const signed = await getSignedEvidenceUrl(sb, ev.photo_url);
          const current = evidenceMap.get(ev.task_instance_id);
          if (current && signed) {
            current.photoUrl = signed;
          }
        })
      );
    }

    const now = new Date();

    let list = (tasks || []).map((t) => {
      const unit = Array.isArray(t.unit) ? t.unit[0] : t.unit;
      const item = Array.isArray(t.checklist_item) ? t.checklist_item[0] : t.checklist_item;
      const operator = Array.isArray(t.operator) ? t.operator[0] : t.operator;
      const alert = alertMap.get(t.id) || null;
      const evidence = evidenceMap.get(t.id) || null;

      const dueDate = new Date(t.due_at);
      let delayMinutes = 0;
      let isLate = t.status === 'late';
      if (t.completed_at) {
        const completedDate = new Date(t.completed_at);
        if (completedDate > dueDate) {
          delayMinutes = Math.round((completedDate.getTime() - dueDate.getTime()) / (1000 * 60));
          isLate = true;
        }
      } else if (now > dueDate) {
        delayMinutes = Math.round((now.getTime() - dueDate.getTime()) / (1000 * 60));
        isLate = true;
      }

      const checklistMeta = extractChecklistMeta(item);

      return {
        id: t.id,
        status: t.status,
        dueDate: t.due_at,
        scheduledDate: t.scheduled_date,
        completedAt: t.completed_at,
        notes: t.notes,
        recordedValue: t.recorded_value,
        isCompliant: t.is_compliant,
        nonComplianceAction: t.non_compliance_action,
        isLate,
        delayMinutes,
        unit: unit ? { id: unit.id, name: unit.name, address: unit.address } : null,
        sector: checklistMeta.sector,
        item: item
          ? {
              id: item.id,
              title: item.title,
              isCritical: item.is_critical,
              itemType: item.item_type,
              unitOfMeasurement: item.unit_of_measurement,
              minValue: item.min_value,
              maxValue: item.max_value,
              dueTime: item.due_time,
              checklistId: item.checklist_id,
              shift: checklistMeta.shift,
            }
          : null,
        operator: operator
          ? { id: operator.id, fullName: operator.full_name, phone: operator.phone }
          : null,
        alert,
        evidence,
      };
    });

    if (critical === '1' || critical === 'true') {
      list = list.filter((t) => t.item?.isCritical);
    }

    return res.json({ tasks: list });
  } catch (err) {
    console.error('[tasks/pendings]', err);
    return res.status(500).json({ error: 'Falha ao listar pendências' });
  }
});

/**
 * GET /api/tasks/audit-report?unitId=&startDate=&endDate=&criticalOnly=&status=
 * Relatório consolidado de auditoria de conformidade e falhas de operadores.
 */
tasksRouter.get('/audit-report', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = req.user?.company_id || DEFAULT_COMPANY_ID;

    const { unitId, startDate, endDate, criticalOnly, status } = req.query as {
      unitId?: string;
      startDate?: string;
      endDate?: string;
      criticalOnly?: string;
      status?: string;
    };

    const start = startDate || getTodayBR();
    const end = endDate || start;

    const { data: units } = await sb.from('units').select('id').eq('company_id', companyId);
    const unitIds = (units || []).map((u) => u.id);
    if (unitIds.length === 0) return res.json({ tasks: [], summary: {} });

    let query = sb
      .from('task_instances')
      .select(
        `
        id, status, due_at, scheduled_date, completed_at, notes, score_p, score_e, score_q, recorded_value, is_compliant, non_compliance_action,
        unit:units ( id, name, address ),
        checklist_item:checklist_items ( id, title, is_critical, item_type, unit_of_measurement, min_value, max_value, checklist:checklists ( id, name, shift, sector_id, sector:sectors ( id, name ) ) ),
        operator:profiles ( id, full_name, phone )
      `
      )
      .in('unit_id', unitIds)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end);

    if (unitId) query = query.eq('unit_id', unitId);
    if (status && status !== 'all') query = query.eq('status', status);

    query = query.order('scheduled_date', { ascending: false }).order('due_at', { ascending: false });

    const { data: tasks, error } = await query;
    if (error) throw error;

    const taskIds = (tasks || []).map((t) => t.id);

    const alertMap = new Map<string, { alertedAt: string; status: string; recipientPhone?: string }>();
    if (taskIds.length > 0) {
      const { data: alerts } = await sb
        .from('alert_logs')
        .select('task_instance_id, status, created_at, recipient_phone')
        .in('task_instance_id', taskIds)
        .order('created_at', { ascending: false });

      for (const a of alerts || []) {
        if (a.task_instance_id && !alertMap.has(a.task_instance_id)) {
          alertMap.set(a.task_instance_id, {
            alertedAt: a.created_at,
            status: a.status,
            recipientPhone: a.recipient_phone,
          });
        }
      }
    }

    const evidenceMap = new Map<string, { photoUrl: string; reviewStatus: string; aiReason?: string; aiConfidence?: number; capturedAt: string }>();
    if (taskIds.length > 0) {
      const { data: evs } = await sb
        .from('evidences')
        .select('id, task_instance_id, photo_url, review_status, ai_reason, ai_confidence, captured_at')
        .in('task_instance_id', taskIds)
        .order('captured_at', { ascending: false });

      const uniqueEvs = (evs || []).filter((ev) => {
        if (!ev.task_instance_id || evidenceMap.has(ev.task_instance_id)) return false;
        evidenceMap.set(ev.task_instance_id, {
          photoUrl: ev.photo_url,
          reviewStatus: ev.review_status,
          aiReason: ev.ai_reason,
          aiConfidence: ev.ai_confidence,
          capturedAt: ev.captured_at,
        });
        return true;
      });

      await Promise.all(
        uniqueEvs.map(async (ev) => {
          if (!ev.task_instance_id || !ev.photo_url) return;
          const signed = await getSignedEvidenceUrl(sb, ev.photo_url);
          const current = evidenceMap.get(ev.task_instance_id);
          if (current && signed) {
            current.photoUrl = signed;
          }
        })
      );
    }

    const now = new Date();

    let list = (tasks || []).map((t) => {
      const unit = Array.isArray(t.unit) ? t.unit[0] : t.unit;
      const item = Array.isArray(t.checklist_item) ? t.checklist_item[0] : t.checklist_item;
      const operator = Array.isArray(t.operator) ? t.operator[0] : t.operator;
      const alert = alertMap.get(t.id) || null;
      const evidence = evidenceMap.get(t.id) || null;

      const dueDate = new Date(t.due_at);
      let delayMinutes = 0;
      let isLate = t.status === 'late';
      if (t.completed_at) {
        const completedDate = new Date(t.completed_at);
        if (completedDate > dueDate) {
          delayMinutes = Math.round((completedDate.getTime() - dueDate.getTime()) / (1000 * 60));
          isLate = true;
        }
      } else if (now > dueDate) {
        delayMinutes = Math.round((now.getTime() - dueDate.getTime()) / (1000 * 60));
        isLate = true;
      }

      const checklistMeta = extractChecklistMeta(item);

      return {
        id: t.id,
        status: t.status,
        dueDate: t.due_at,
        scheduledDate: t.scheduled_date,
        completedAt: t.completed_at,
        notes: t.notes,
        recordedValue: t.recorded_value,
        isCompliant: t.is_compliant,
        nonComplianceAction: t.non_compliance_action,
        isLate,
        delayMinutes,
        scoreP: t.score_p,
        scoreE: t.score_e,
        scoreQ: t.score_q,
        unit: unit ? { id: unit.id, name: unit.name, address: unit.address } : null,
        sector: checklistMeta.sector,
        item: item
          ? {
              title: item.title,
              isCritical: item.is_critical,
              itemType: item.item_type,
              unitOfMeasurement: item.unit_of_measurement,
              minValue: item.min_value,
              maxValue: item.max_value,
            }
          : null,
        operator: operator
          ? { id: operator.id, fullName: operator.full_name, phone: operator.phone }
          : null,
        alert,
        evidence,
      };
    });

    if (criticalOnly === '1' || criticalOnly === 'true') {
      list = list.filter((t) => t.item?.isCritical);
    }

    const totalTasks = list.length;
    const totalLate = list.filter((t) => t.isLate).length;
    const totalCriticalLate = list.filter((t) => t.isLate && t.item?.isCritical).length;
    const totalAlerted = list.filter((t) => t.alert !== null).length;
    const totalResolvedLate = list.filter((t) => t.status === 'completed' && t.isLate).length;
    const totalPending = list.filter((t) => t.status === 'pending' || t.status === 'in_progress' || t.status === 'late').length;

    return res.json({
      tasks: list,
      summary: {
        totalTasks,
        totalLate,
        totalCriticalLate,
        totalAlerted,
        totalResolvedLate,
        totalPending,
      },
    });
  } catch (err) {
    console.error('[tasks/audit-report]', err);
    return res.status(500).json({ error: 'Falha ao gerar relatório de auditoria' });
  }
});

/**
 * GET /api/tasks/:id/notify-recipients
 * Lista destinatários elegíveis para cobrança rápida via WhatsApp (gerentes da unidade + operadores do setor).
 */
tasksRouter.get(
  '/:id/notify-recipients',
  requireAuth,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const sb = getSupabaseAdmin();
      const { id } = req.params as { id: string };

      const { data: task, error } = await sb
        .from('task_instances')
        .select(
          `
          id, unit_id, assigned_to,
          unit:units ( id, name, company_id ),
          checklist_item:checklist_items (
            id, title,
            checklist:checklists ( id, name, sector_id, sector:sectors ( id, name ) )
          )
        `
        )
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });

      const item = Array.isArray(task.checklist_item) ? task.checklist_item[0] : task.checklist_item;
      const unit = Array.isArray(task.unit) ? task.unit[0] : task.unit;
      const { sector } = extractChecklistMeta(item);

      const { data: profiles, error: profErr } = await sb
        .from('profiles')
        .select('id, full_name, phone, role, unit_id, is_active')
        .eq('is_active', true)
        .eq('unit_id', task.unit_id)
        .in('role', ['manager', 'operator'])
        .order('full_name', { ascending: true });

      if (profErr) throw profErr;

      const list = (profiles || []) as {
        id: string;
        full_name: string | null;
        phone: string | null;
        role: string;
        unit_id: string | null;
      }[];

      const profileIds = list.map((p) => p.id);
      const sectorMap = new Map<string, string[]>();
      if (profileIds.length > 0) {
        const { data: links, error: linkErr } = await sb
          .from('profiles_sectors')
          .select('profile_id, sector_id')
          .in('profile_id', profileIds);
        if (linkErr) throw linkErr;
        for (const l of (links || []) as { profile_id: string; sector_id: string }[]) {
          const arr = sectorMap.get(l.profile_id) || [];
          arr.push(l.sector_id);
          sectorMap.set(l.profile_id, arr);
        }
      }

      const mapRecipient = (p: (typeof list)[number]) => {
        const pSectors = sectorMap.get(p.id) || [];
        return {
          id: p.id,
          fullName: p.full_name || 'Colaborador',
          phone: p.phone || null,
          role: p.role,
          inSector: sector ? pSectors.includes(sector.id) : true,
        };
      };

      const managers = list.filter((p) => p.role === 'manager').map(mapRecipient);
      const operators = list.filter((p) => p.role === 'operator').map(mapRecipient);

      const sectorOperators = sector
        ? operators.filter((op) => op.inSector)
        : operators;
      const otherOperators = sector
        ? operators.filter((op) => !op.inSector)
        : [];

      return res.json({
        taskId: id,
        unit: unit ? { id: unit.id, name: unit.name } : null,
        sector,
        managers,
        sectorOperators,
        otherOperators,
      });
    } catch (err) {
      console.error('[tasks/notify-recipients]', err);
      return res.status(500).json({ error: 'Falha ao buscar destinatários da tarefa' });
    }
  }
);

/**
 * POST /api/tasks/:id/notify
 * Envia lembrete WhatsApp para um colaborador escolhido, para todos os operadores do setor,
 * para o executor atribuído ou, como fallback, para os gerentes da unidade.
 */
tasksRouter.post('/:id/notify', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { id } = req.params as { id: string };
    const { recipientProfileId, notifyAllSector } = (req.body || {}) as {
      recipientProfileId?: string;
      notifyAllSector?: boolean;
    };

    const { data: tasks, error } = await sb
      .from('task_instances')
      .select(
        `
        id, due_at, status, unit_id, assigned_to,
        unit:units ( id, name ),
        checklist_item:checklist_items (
          id, title,
          checklist:checklists ( id, name, sector_id, sector:sectors ( id, name ) )
        )
      `
      )
      .eq('id', id)
      .limit(1);

    if (error) throw error;
    const task = tasks?.[0];
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });

    const item = Array.isArray(task.checklist_item) ? task.checklist_item[0] : task.checklist_item;
    const unit = Array.isArray(task.unit) ? task.unit[0] : task.unit;
    const { sector } = extractChecklistMeta(item);

    type TargetRecipient = { id: string; full_name: string | null; phone: string | null };
    let targets: TargetRecipient[] = [];

    if (recipientProfileId) {
      const { data: chosen } = await sb
        .from('profiles')
        .select('id, full_name, phone')
        .eq('id', recipientProfileId)
        .maybeSingle();
      if (!chosen) return res.status(404).json({ error: 'Destinatário não encontrado' });
      if (!chosen.phone) {
        return res.status(400).json({ error: `${chosen.full_name || 'Colaborador'} não possui telefone cadastrado` });
      }
      targets = [chosen];
    } else if (notifyAllSector) {
      const { data: unitOps } = await sb
        .from('profiles')
        .select('id, full_name, phone')
        .eq('unit_id', task.unit_id)
        .eq('role', 'operator')
        .eq('is_active', true);

      let candidates = (unitOps || []) as TargetRecipient[];
      if (sector && candidates.length > 0) {
        const { data: links } = await sb
          .from('profiles_sectors')
          .select('profile_id')
          .eq('sector_id', sector.id)
          .in('profile_id', candidates.map((c) => c.id));
        const allowed = new Set((links || []).map((l: { profile_id: string }) => l.profile_id));
        candidates = candidates.filter((c) => allowed.has(c.id));
      }

      targets = candidates.filter((c) => Boolean(c.phone));
      if (targets.length === 0) {
        return res.status(400).json({
          error: sector
            ? `Nenhum operador ativo do setor ${sector.name} possui telefone cadastrado`
            : 'Nenhum operador ativo da unidade possui telefone cadastrado',
        });
      }
    } else if (task.assigned_to) {
      const { data: op } = await sb
        .from('profiles')
        .select('id, full_name, phone')
        .eq('id', task.assigned_to)
        .maybeSingle();
      if (!op?.phone) {
        return res.status(400).json({ error: 'Colaborador sem telefone cadastrado' });
      }
      targets = [op];
    } else {
      // Fallback: gerentes ativos da unidade
      const { data: managers } = await sb
        .from('profiles')
        .select('id, full_name, phone')
        .eq('unit_id', task.unit_id)
        .eq('role', 'manager')
        .eq('is_active', true);
      targets = ((managers || []) as TargetRecipient[]).filter((m) => Boolean(m.phone));
      if (targets.length === 0) {
        return res.status(400).json({ error: 'Selecione um destinatário ou cadastre o WhatsApp do gerente da unidade' });
      }
    }

    const sectorLine = sector ? `Setor: ${sector.name}\n` : '';
    const message =
      `⏰ ConcluíAI — Lembrete de pendência\n` +
      `Unidade: ${unit?.name || '—'}\n` +
      sectorLine +
      `Tarefa: ${item?.title || 'Tarefa'}\n` +
      `Prazo: ${new Date(task.due_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
      `Por favor, execute o quanto antes.`;

    let sentCount = 0;
    let mockCount = 0;
    let lastStatus: string | null = null;
    const sentNames: string[] = [];

    for (const recipient of targets) {
      if (!recipient.phone) continue;
      const result = await sendWhatsAppMessage({
        toPhone: recipient.phone,
        message,
        taskInstanceId: id,
        unitId: task.unit_id || null,
        recipientProfileId: recipient.id,
      });
      lastStatus = result.status;
      if (result.status === 'sent') {
        sentCount += 1;
        sentNames.push(recipient.full_name || recipient.phone);
      } else if (result.status === 'mock') {
        mockCount += 1;
        sentNames.push(recipient.full_name || recipient.phone);
      } else if (targets.length === 1 && (result.status === 'blocked' || result.status === 'failed')) {
        return res.status(400).json({ error: result.error || 'Falha ao notificar colaborador' });
      }
    }

    if (sentCount === 0 && mockCount === 0) {
      return res.status(400).json({ error: 'Nenhum lembrete pôde ser disparado pelo gateway WhatsApp' });
    }

    return res.json({
      ok: true,
      taskId: id,
      notified: sentCount > 0 ? 'sent' : lastStatus,
      sentCount,
      mockCount,
      recipients: sentNames,
    });
  } catch (err) {
    console.error('[tasks/notify]', err);
    return res.status(500).json({ error: 'Falha ao enviar lembrete' });
  }
});

/**
 * POST /api/tasks/:id/complete
 * Conclui uma tarefa com suporte a medições quantitativas (temperatura, pH, etc)
 * e disparo de alerta imediato via WhatsApp aos gerentes se houver não-conformidade.
 */
tasksRouter.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { id } = req.params as { id: string };
    const { checked, notes, recorded_value, non_compliance_action } = req.body;

    // Busca tarefa com item e unidade
    const { data: task, error: findErr } = await sb
      .from('task_instances')
      .select(`
        id, unit_id, assigned_to, status, due_at,
        unit:units ( id, name, company_id ),
        checklist_item:checklist_items (
          id, title, is_critical, item_type, unit_of_measurement,
          min_value, max_value, alert_on_non_compliant
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (findErr || !task) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }

    const item = Array.isArray(task.checklist_item) ? task.checklist_item[0] : task.checklist_item;
    const unit = Array.isArray(task.unit) ? task.unit[0] : task.unit;

    let is_compliant: boolean | null = null;
    let numVal: number | null = null;

    if (recorded_value !== undefined && recorded_value !== null && recorded_value !== '') {
      numVal = typeof recorded_value === 'number' ? recorded_value : Number(String(recorded_value).replace(',', '.'));
      if (!isNaN(numVal)) {
        const minVal = item?.min_value != null ? Number(item.min_value) : null;
        const maxVal = item?.max_value != null ? Number(item.max_value) : null;

        const meetsMin = minVal == null || numVal >= minVal;
        const meetsMax = maxVal == null || numVal <= maxVal;
        is_compliant = meetsMin && meetsMax;
      }
    }

    const now = new Date().toISOString();

    const updatePayload: Record<string, any> = {
      status: 'completed',
      completed_at: now,
      checked: Boolean(checked ?? true),
      notes: notes?.trim() || null,
      recorded_value: numVal,
      is_compliant,
      non_compliance_action: non_compliance_action?.trim() || null,
    };

    if (req.user?.id) {
      updatePayload.assigned_to = req.user.id;
    }

    const { error: updErr } = await sb
      .from('task_instances')
      .update(updatePayload)
      .eq('id', id);

    if (updErr) {
      console.error('[tasks/complete update error]', updErr);
      throw updErr;
    }

    // Se houve não-conformidade e o item requer alerta:
    let alertDispatched = false;
    if (
      is_compliant === false &&
      item?.alert_on_non_compliant !== false &&
      numVal !== null
    ) {
      // Dispara alerta imediato aos gerentes da loja
      dispatchNonComplianceAlert({
        taskId: id,
        unitId: task.unit_id,
        itemTitle: item?.title || 'Item Quantitativo',
        recordedValue: numVal,
        unitOfMeasurement: item?.unit_of_measurement || '',
        minValue: item?.min_value,
        maxValue: item?.max_value,
        operatorName: req.user?.full_name || 'Operador',
        actionTaken: non_compliance_action,
      }).catch((err) => {
        console.error('[tasks/complete alert failure]', err);
      });
      alertDispatched = true;
    }

    return res.json({
      success: true,
      taskId: id,
      is_compliant,
      recorded_value: numVal,
      alert_dispatched: alertDispatched,
      completed_at: now,
    });
  } catch (err: any) {
    console.error('[tasks/:id/complete]', err);
    return res.status(500).json({ error: err.message || 'Falha ao registrar conclusão de tarefa' });
  }
});

