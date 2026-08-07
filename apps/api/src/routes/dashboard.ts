import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

export const dashboardRouter = Router();

/** GET /api/dashboard/multistore — visão consolidada multiloja */
dashboardRouter.get('/multistore', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = req.user?.company_id;
    if (!companyId) return res.status(400).json({ error: 'Perfil sem company_id' });

    const today = new Date().toISOString().slice(0, 10);
    const todayDate = today;

    // Tenta o RPC agregado (1 query). Se ainda não existir no banco, cai no fallback JS.
    try {
      const { data, error } = await sb.rpc('get_multistore_dashboard', {
        p_company_id: companyId,
        p_date: todayDate,
      });

      if (!error && Array.isArray(data)) {
        return res.json({ units: data, date: today });
      }
    } catch {
      // RPC indisponível — segue para o fallback.
    }

    const { data: units, error } = await sb
      .from('units')
      .select('id, name, address, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);

    if (error) throw error;

    const rows = [];
    for (const unit of units || []) {
      const { data: score } = await sb
        .from('daily_scores')
        .select('*')
        .eq('unit_id', unit.id)
        .is('user_id', null)
        .eq('score_date', today)
        .maybeSingle();

      const [{ count: pending }, { count: late }, { count: completed }] = await Promise.all([
        sb.from('task_instances').select('*', { count: 'exact', head: true }).eq('unit_id', unit.id).eq('scheduled_date', today).eq('status', 'pending'),
        sb.from('task_instances').select('*', { count: 'exact', head: true }).eq('unit_id', unit.id).eq('scheduled_date', today).eq('status', 'late'),
        sb.from('task_instances').select('*', { count: 'exact', head: true }).eq('unit_id', unit.id).eq('scheduled_date', today).eq('status', 'completed'),
      ]);

      let scoreTotal = score?.score_total ?? null;

      // Se a tabela daily_scores ainda não foi gerada para hoje, calcula dinamicamente a partir das tarefas existentes
      if (scoreTotal == null) {
        const { data: unitTasks } = await sb
          .from('task_instances')
          .select('status, due_at, completed_at, score_q, checklist_item:checklist_items(is_critical, requires_photo, weight)')
          .eq('unit_id', unit.id)
          .eq('scheduled_date', today);

        if (unitTasks && unitTasks.length > 0) {
          const comps = unitTasks.map((t) => {
            const item = Array.isArray(t.checklist_item) ? t.checklist_item[0] : t.checklist_item;
            let p = 0;
            if (t.status === 'completed' && t.completed_at) {
              p = new Date(t.completed_at) <= new Date(t.due_at) ? 1 : 0.5;
            }
            let e = t.status === 'completed' ? 1 : 0;
            let q = typeof t.score_q === 'number' ? (t.score_q > 1 ? t.score_q / 100 : t.score_q) : 0.7;
            const w = (item?.weight ?? 1) * (item?.is_critical ? 1.5 : 1);
            return { p, e, q, weight: w };
          });
          const totalW = comps.reduce((s, c) => s + c.weight, 0) || 1;
          const scoreP = (comps.reduce((s, c) => s + c.p * c.weight, 0) / totalW) * 100;
          const scoreE = (comps.reduce((s, c) => s + c.e * c.weight, 0) / totalW) * 100;
          const scoreQ = (comps.reduce((s, c) => s + c.q * c.weight, 0) / totalW) * 100;
          scoreTotal = Math.round((0.3 * scoreP + 0.4 * scoreE + 0.3 * scoreQ) * 10) / 10;
        }
      }

      rows.push({
        unit_id: unit.id,
        unit_name: unit.name,
        address: unit.address,
        score_total: scoreTotal,
        tasks_pending: pending ?? 0,
        tasks_late: late ?? 0,
        tasks_completed: completed ?? 0,
        critical_missed: score?.critical_missed ?? 0,
      });
    }

    return res.json({ units: rows, date: today });
  } catch (err) {
    console.error('[dashboard]', err);
    return res.status(500).json({ error: 'Falha no dashboard multiloja' });
  }
});
