import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { checkCriticalOverdueTasks } from '../jobs/alerts.js';
import { generateTasksForDate } from '../services/tasks.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';

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

const NOT_DONE_STATUSES = ['pending', 'in_progress', 'late'];

/**
 * GET /api/tasks/pendings?unitId=&status=&critical=&date=
 * Lista tarefas não concluídas (todas não elogiadas: pending/late/in_progress)
 * com a unidade, item do checklist e operador responsável. Filtra por company.
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

    let list = (tasks || []).map((t) => {
      const unit = Array.isArray(t.unit) ? t.unit[0] : t.unit;
      const item = Array.isArray(t.checklist_item) ? t.checklist_item[0] : t.checklist_item;
      const operator = Array.isArray(t.operator) ? t.operator[0] : t.operator;
      return {
        id: t.id,
        status: t.status,
        dueDate: t.due_at,
        scheduledDate: t.scheduled_date,
        notes: t.notes,
        unit: unit ? { id: unit.id, name: unit.name, address: unit.address } : null,
        item: item ? { title: item.title, isCritical: item.is_critical } : null,
        operator: operator
          ? { id: operator.id, fullName: operator.full_name, phone: operator.phone }
          : null,
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
          `Prazo: ${new Date(task.due_at).toLocaleString('pt-BR')}\n` +
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
