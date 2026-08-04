import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { recalculateDailyScores } from '../services/score.js';

export const scoreRouter = Router();

/** POST /api/score/recalculate — admin/manager */
scoreRouter.post(
  '/recalculate',
  requireAuth,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const unitId = typeof req.body?.unitId === 'string' ? req.body.unitId : undefined;
      const date = typeof req.body?.date === 'string' ? req.body.date : undefined;
      const result = await recalculateDailyScores({ unitId, date });
      return res.json(result);
    } catch (err) {
      console.error('[score]', err);
      return res.status(500).json({ error: 'Falha ao recalcular scores' });
    }
  }
);

/** GET /api/score/rankings?scope=units|users&from=&to= */
scoreRouter.get('/rankings', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const scope = (req.query.scope as string) || 'units';
    const from = (req.query.from as string) || daysAgo(7);
    const to = (req.query.to as string) || today();

    if (scope === 'users') {
      const { data, error } = await sb
        .from('daily_scores')
        .select('user_id, score_total, score_p, score_e, score_q, unit_id, score_date, profiles:user_id(full_name)')
        .not('user_id', 'is', null)
        .gte('score_date', from)
        .lte('score_date', to);

      if (error) throw error;

      const map = new Map<string, { name: string; total: number; n: number }>();
      for (const row of data || []) {
        if (!row.user_id) continue;
        const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const cur = map.get(row.user_id) || {
          name: (prof as { full_name?: string } | null)?.full_name || 'Operador',
          total: 0,
          n: 0,
        };
        cur.total += Number(row.score_total);
        cur.n += 1;
        map.set(row.user_id, cur);
      }
      const rankings = [...map.entries()]
        .map(([id, v]) => ({ id, name: v.name, score: Math.round((v.total / v.n) * 100) / 100 }))
        .sort((a, b) => b.score - a.score);
      return res.json({ rankings, from, to, scope });
    }

    // units
    const { data, error } = await sb
      .from('daily_scores')
      .select('unit_id, score_total, score_date, units:unit_id(name)')
      .is('user_id', null)
      .gte('score_date', from)
      .lte('score_date', to);

    if (error) throw error;

    const map = new Map<string, { name: string; total: number; n: number }>();
    for (const row of data || []) {
      const unit = Array.isArray(row.units) ? row.units[0] : row.units;
      const cur = map.get(row.unit_id) || {
        name: (unit as { name?: string } | null)?.name || 'Unidade',
        total: 0,
        n: 0,
      };
      cur.total += Number(row.score_total);
      cur.n += 1;
      map.set(row.unit_id, cur);
    }
    const rankings = [...map.entries()]
      .map(([id, v]) => ({ id, name: v.name, score: Math.round((v.total / v.n) * 100) / 100 }))
      .sort((a, b) => b.score - a.score);

    return res.json({ rankings, from, to, scope });
  } catch (err) {
    console.error('[rankings]', err);
    return res.status(500).json({ error: 'Falha ao buscar rankings' });
  }
});

/** GET /api/score/evolution?unitId=&days=14 */
scoreRouter.get('/evolution', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const days = Math.min(90, parseInt(String(req.query.days || '14'), 10) || 14);
    const unitId = req.query.unitId as string | undefined;
    const from = daysAgo(days);

    let q = sb
      .from('daily_scores')
      .select('score_date, score_p, score_e, score_q, score_total, unit_id')
      .is('user_id', null)
      .gte('score_date', from)
      .order('score_date', { ascending: true });

    if (unitId) q = q.eq('unit_id', unitId);

    const { data, error } = await q;
    if (error) throw error;
    return res.json({ series: data || [] });
  } catch (err) {
    console.error('[evolution]', err);
    return res.status(500).json({ error: 'Falha ao buscar evolução' });
  }
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
