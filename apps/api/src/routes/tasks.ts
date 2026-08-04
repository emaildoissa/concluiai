import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { checkCriticalOverdueTasks } from '../jobs/alerts.js';

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
      const sb = getSupabaseAdmin();
      const date = (req.body?.date as string) || new Date().toISOString().slice(0, 10);
      const companyId = req.user?.company_id;

      let checklistQuery = sb
        .from('checklists')
        .select(
          `
          id, company_id, shift, is_active,
          items:checklist_items ( id, due_time, title ),
          units:checklist_units ( unit_id )
        `
        )
        .eq('is_active', true);

      // Aplica filtro de empresa somente quando o valor existe (multi-tenant)
      if (companyId) {
        checklistQuery = checklistQuery.eq('company_id', companyId);
      }

      const { data: checklists, error } = await checklistQuery;

      if (error) throw error;

      // Operadores ativos por unidade (round-robin de atribuição)
      const unitLinksSet = new Set<string>();
      for (const cl of checklists || []) {
        for (const link of cl.units || []) unitLinksSet.add(link.unit_id);
      }
      const activeOperatorsByUnit = new Map<string, string[]>();
      if (unitLinksSet.size > 0) {
        const { data: operators, error: opErr } = await sb
          .from('profiles')
          .select('id, unit_id')
          .in('unit_id', [...unitLinksSet])
          .eq('role', 'operator')
          .eq('is_active', true);
        if (opErr) throw opErr;
        for (const op of operators || []) {
          if (!op.unit_id) continue;
          const list = activeOperatorsByUnit.get(op.unit_id) || [];
          list.push(op.id);
          activeOperatorsByUnit.set(op.unit_id, list);
        }
      }
      // Contador round-robin por unidade
      const rrCounter = new Map<string, number>();

      let created = 0;
      for (const cl of checklists || []) {
        const items = cl.items || [];
        const unitLinks = cl.units || [];
        for (const link of unitLinks) {
          const operators = activeOperatorsByUnit.get(link.unit_id) || [];
          for (const item of items) {
            const dueTime = item.due_time || '23:59:00';
            const dueAt = new Date(`${date}T${String(dueTime).slice(0, 8)}`);
            let assignedTo: string | null = null;
            if (operators.length > 0) {
              const i = rrCounter.get(link.unit_id) || 0;
              assignedTo = operators[i % operators.length];
              rrCounter.set(link.unit_id, i + 1);
            }
            // Ajuste timezone simples — produção deve usar timezone da unit
            const { data: existing, error: findErr } = await sb
              .from('task_instances')
              .select('id, assigned_to')
              .eq('checklist_item_id', item.id)
              .eq('unit_id', link.unit_id)
              .eq('scheduled_date', date)
              .maybeSingle();

            if (findErr) throw findErr;

            if (existing) {
              // Já existe: preenche assigned_to apenas se ainda estiver vazio
              if (!existing.assigned_to && assignedTo) {
                await sb
                  .from('task_instances')
                  .update({ assigned_to: assignedTo })
                  .eq('id', existing.id);
              }
              continue;
            }

            const { error: insErr } = await sb.from('task_instances').insert({
              checklist_item_id: item.id,
              unit_id: link.unit_id,
              assigned_to: assignedTo,
              scheduled_date: date,
              due_at: dueAt.toISOString(),
              status: 'pending',
            });
            if (!insErr) created += 1;
          }
        }
      }

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
