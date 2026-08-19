import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { checkCriticalOverdueTasks } from '../jobs/alerts.js';
import { generateTasksForDate } from '../services/tasks.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { getSignedEvidenceUrl } from '../services/evidences.js';

export const tasksRouter = Router();

/**
 * POST /api/tasks/generate-today
 * Gera instâncias do dia a partir de checklists ativos + checklist_units
 */
tasksRouter.post(
  '/generate-today',
  requireAuth,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const date = (req.body?.date as string) || new Date().toISOString().slice(0, 10);
      const companyId = req.user?.company_id;
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

/**
 * GET /api/tasks/pendings?unitId=&status=&critical=&date=
 * Lista tarefas não concluídas ou em atraso com dados de auditoria (alerta ao gerente, tempo decorrido, etc).
 */
tasksRouter.get('/pendings', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = req.user?.company_id;
    if (!companyId) return res.status(400).json({ error: 'Perfil sem company_id' });

    const { unitId, status, critical, date } = req.query as {
      unitId?: string;
      status?: string;
      critical?: string;
      date?: string;
    };

    let query = sb.from('task_instances').select(
      `
        id, status, due_at, scheduled_date, completed_at, notes,
        unit:units ( id, name, address ),
        checklist_item:checklist_items ( id, title, is_critical ),
        operator:profiles ( id, full_name, phone )
      `
    );

    // Restringe às unidades da empresa (via unit_id in units da company)
    const { data: units } = await sb.from('units').select('id').eq('company_id', companyId);
    const unitIds = (units || []).map((u) => u.id);
    if (unitIds.length === 0) return res.json({ tasks: [] });
    query = query.in('unit_id', unitIds);

    if (unitId) query = query.eq('unit_id', unitId);
    if (status) query = query.eq('status', status);
    else query = query.in('status', NOT_DONE_STATUSES);
    if (date) query = query.eq('scheduled_date', date);
    else query = query.eq('scheduled_date', new Date().toISOString().slice(0, 10));

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

      return {
        id: t.id,
        status: t.status,
        dueDate: t.due_at,
        scheduledDate: t.scheduled_date,
        completedAt: t.completed_at,
        notes: t.notes,
        isLate,
        delayMinutes,
        unit: unit ? { id: unit.id, name: unit.name, address: unit.address } : null,
        item: item ? { title: item.title, isCritical: item.is_critical } : null,
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
    const companyId = req.user?.company_id;
    if (!companyId) return res.status(400).json({ error: 'Perfil sem company_id' });

    const { unitId, startDate, endDate, criticalOnly, status } = req.query as {
      unitId?: string;
      startDate?: string;
      endDate?: string;
      criticalOnly?: string;
      status?: string;
    };

    const start = startDate || new Date().toISOString().slice(0, 10);
    const end = endDate || start;

    const { data: units } = await sb.from('units').select('id').eq('company_id', companyId);
    const unitIds = (units || []).map((u) => u.id);
    if (unitIds.length === 0) return res.json({ tasks: [], summary: {} });

    let query = sb
      .from('task_instances')
      .select(
        `
        id, status, due_at, scheduled_date, completed_at, notes, score_p, score_e, score_q,
        unit:units ( id, name, address ),
        checklist_item:checklist_items ( id, title, is_critical ),
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

      return {
        id: t.id,
        status: t.status,
        dueDate: t.due_at,
        scheduledDate: t.scheduled_date,
        completedAt: t.completed_at,
        notes: t.notes,
        isLate,
        delayMinutes,
        scoreP: t.score_p,
        scoreE: t.score_e,
        scoreQ: t.score_q,
        unit: unit ? { id: unit.id, name: unit.name, address: unit.address } : null,
        item: item ? { title: item.title, isCritical: item.is_critical } : null,
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
 * POST /api/tasks/:id/notify
 * Envia lembrete WhatsApp ao operador responsável por uma tarefa não concluída.
 */
tasksRouter.post('/:id/notify', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { id } = req.params as { id: string };

    const { data: tasks, error } = await sb
      .from('task_instances')
      .select(
        `
        id, due_at, status, unit_id, assigned_to,
        unit:units ( id, name ),
        checklist_item:checklist_items ( id, title )
      `
      )
      .eq('id', id)
      .limit(1);

    if (error) throw error;
    const task = tasks?.[0];
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });

    const item = Array.isArray(task.checklist_item) ? task.checklist_item[0] : task.checklist_item;
    const unit = Array.isArray(task.unit) ? task.unit[0] : task.unit;
    const operatorId = task.assigned_to;

    let notified = null;
    if (operatorId) {
      const { data: op } = await sb
        .from('profiles')
        .select('id, full_name, phone')
        .eq('id', operatorId)
        .maybeSingle();

      if (op?.phone) {
        const message =
          `⏰ ConcluíAI — Lembrete de pendência\n` +
          `Unidade: ${unit?.name || '—'}\n` +
          `Tarefa: ${item?.title || 'Tarefa'}\n` +
          `Prazo: ${new Date(task.due_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
          `Por favor, execute o quanto antes.`;

        const result = await sendWhatsAppMessage({
          toPhone: op.phone,
          message,
          taskInstanceId: id,
          unitId: task.unit_id || null,
          recipientProfileId: op.id,
        });
        notified = result.status;
        if (result.status === 'blocked' || result.status === 'failed') {
          return res.status(400).json({ error: result.error || 'Falha ao notificar operador' });
        }
      } else {
        return res.status(400).json({ error: 'Operador responsável sem telefone cadastrado' });
      }
    } else {
      return res.status(400).json({ error: 'Tarefa sem operador responsável' });
    }

    return res.json({ ok: true, taskId: id, notified });
  } catch (err) {
    console.error('[tasks/notify]', err);
    return res.status(500).json({ error: 'Falha ao enviar lembrete' });
  }
});
