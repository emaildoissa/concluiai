import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { checkCriticalOverdueTasks } from '../jobs/alerts.js';
import { generateTasksForDate } from '../services/tasks.js';

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
