import { config } from '../config.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * Motor de Score 0–100
 * S = 100 * (wP·P + wE·E + wQ·Q)
 * Itens críticos pesam SCORE_CRITICAL_MULTIPLIER a mais no denominador/numerador.
 *
 * P (Pontualidade): 1 se completed_at <= due_at, senão decai com atraso
 * E (Esforço/Execução): 1 se completed/approved, 0 se missed, 0.5 se rejected retry
 * Q (Qualidade): score_q da evidência IA (0–1) ou 1 se não exige foto
 */
export function computeComponentScores(task: {
  status: string;
  due_at: string;
  completed_at?: string | null;
  score_q?: number | null;
  is_critical?: boolean;
  requires_photo?: boolean;
  weight?: number;
}): { p: number; e: number; q: number; weight: number } {
  const weight =
    (task.weight ?? 1) * (task.is_critical ? config.score.criticalMultiplier : 1);

  // Pontualidade
  let p = 0;
  if (task.status === 'completed' && task.completed_at) {
    const due = new Date(task.due_at).getTime();
    const done = new Date(task.completed_at).getTime();
    if (done <= due) {
      p = 1;
    } else {
      const lateMin = (done - due) / 60_000;
      // Decai linear: 0 após 120 min de atraso
      p = Math.max(0, 1 - lateMin / 120);
    }
  } else if (task.status === 'late' || task.status === 'pending') {
    p = 0;
  }

  // Execução
  let e = 0;
  if (task.status === 'completed') e = 1;
  else if (task.status === 'rejected') e = 0.25;
  else if (task.status === 'in_progress') e = 0.5;
  else e = 0;

  // Qualidade
  let q = 1;
  if (task.requires_photo !== false) {
    if (typeof task.score_q === 'number') {
      q = Math.min(1, Math.max(0, task.score_q > 1 ? task.score_q / 100 : task.score_q));
    } else if (task.status === 'completed') {
      q = 0.7; // sem score_q explícito
    } else {
      q = 0;
    }
  }

  return { p, e, q, weight };
}

export function aggregateScore(
  items: Array<{ p: number; e: number; q: number; weight: number }>
): { scoreP: number; scoreE: number; scoreQ: number; scoreTotal: number } {
  if (items.length === 0) {
    return { scoreP: 0, scoreE: 0, scoreQ: 0, scoreTotal: 0 };
  }
  const totalW = items.reduce((s, i) => s + i.weight, 0) || 1;
  const scoreP = (items.reduce((s, i) => s + i.p * i.weight, 0) / totalW) * 100;
  const scoreE = (items.reduce((s, i) => s + i.e * i.weight, 0) / totalW) * 100;
  const scoreQ = (items.reduce((s, i) => s + i.q * i.weight, 0) / totalW) * 100;
  const { weightP, weightE, weightQ } = config.score;
  const scoreTotal = weightP * scoreP + weightE * scoreE + weightQ * scoreQ;
  return {
    scoreP: round2(scoreP),
    scoreE: round2(scoreE),
    scoreQ: round2(scoreQ),
    scoreTotal: round2(scoreTotal),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Recalcula scores diários de uma unidade (ou todas) */
export async function recalculateDailyScores(params?: {
  unitId?: string;
  date?: string; // YYYY-MM-DD
}): Promise<{ unitsProcessed: number }> {
  const sb = getSupabaseAdmin();
  const date = params?.date || new Date().toISOString().slice(0, 10);

  let unitsQuery = sb.from('units').select('id').eq('is_active', true);
  if (params?.unitId) unitsQuery = unitsQuery.eq('id', params.unitId);
  const { data: units, error: unitsErr } = await unitsQuery;
  if (unitsErr) throw unitsErr;

  let processed = 0;
  for (const unit of units || []) {
    const { data: tasks, error } = await sb
      .from('task_instances')
      .select(
        `
        id, status, due_at, completed_at, score_q, assigned_to,
        checklist_item:checklist_items ( is_critical, requires_photo, weight )
      `
      )
      .eq('unit_id', unit.id)
      .eq('scheduled_date', date);

    if (error) {
      console.error('[score] tasks fetch', error);
      continue;
    }

    type TaskRow = {
      id: string;
      status: string;
      due_at: string;
      completed_at: string | null;
      score_q: number | null;
      assigned_to: string | null;
      checklist_item:
        | { is_critical: boolean; requires_photo: boolean; weight: number }
        | { is_critical: boolean; requires_photo: boolean; weight: number }[]
        | null;
    };

    const rows = (tasks || []) as TaskRow[];
    const components = rows.map((t) => {
      const item = Array.isArray(t.checklist_item) ? t.checklist_item[0] : t.checklist_item;
      return computeComponentScores({
        status: t.status,
        due_at: t.due_at,
        completed_at: t.completed_at,
        score_q: t.score_q,
        is_critical: item?.is_critical,
        requires_photo: item?.requires_photo,
        weight: item?.weight,
      });
    });

    const agg = aggregateScore(components);
    const tasksCompleted = rows.filter((t) => t.status === 'completed').length;
    const tasksLate = rows.filter((t) => t.status === 'late').length;
    const criticalMissed = rows.filter((t) => {
      const item = Array.isArray(t.checklist_item) ? t.checklist_item[0] : t.checklist_item;
      return item?.is_critical && !['completed'].includes(t.status);
    }).length;

    // Score da unidade (user_id null)
    // onConflict não resolve NULLs (Postgres trata NULL como distinto em unique index),
    // então removemos a linha existente do dia antes de inserir para não acumular duplicatas.
    await sb
      .from('daily_scores')
      .delete()
      .eq('unit_id', unit.id)
      .is('user_id', null)
      .eq('score_date', date);
    await sb.from('daily_scores').insert({
      unit_id: unit.id,
      user_id: null,
      score_date: date,
      score_p: agg.scoreP,
      score_e: agg.scoreE,
      score_q: agg.scoreQ,
      score_total: agg.scoreTotal,
      tasks_total: rows.length,
      tasks_completed: tasksCompleted,
      tasks_late: tasksLate,
      critical_missed: criticalMissed,
    });

    // Scores por operador
    const byUser = new Map<string, TaskRow[]>();
    for (const t of rows) {
      if (!t.assigned_to) continue;
      const list = byUser.get(t.assigned_to) || [];
      list.push(t);
      byUser.set(t.assigned_to, list);
    }
    for (const [userId, userTasks] of byUser) {
      const comps = userTasks.map((t) => {
        const item = Array.isArray(t.checklist_item) ? t.checklist_item[0] : t.checklist_item;
        return computeComponentScores({
          status: t.status,
          due_at: t.due_at,
          completed_at: t.completed_at,
          score_q: t.score_q,
          is_critical: item?.is_critical,
          requires_photo: item?.requires_photo,
          weight: item?.weight,
        });
      });
      const uAgg = aggregateScore(comps);
      await sb.from('daily_scores').upsert(
        {
          unit_id: unit.id,
          user_id: userId,
          score_date: date,
          score_p: uAgg.scoreP,
          score_e: uAgg.scoreE,
          score_q: uAgg.scoreQ,
          score_total: uAgg.scoreTotal,
          tasks_total: userTasks.length,
          tasks_completed: userTasks.filter((t) => t.status === 'completed').length,
          tasks_late: userTasks.filter((t) => t.status === 'late').length,
          critical_missed: 0,
        },
        { onConflict: 'unit_id,user_id,score_date' }
      );
    }

    processed += 1;
  }

  return { unitsProcessed: processed };
}

/** Atualiza score_p/e/q em uma task instance após conclusão */
export function scoreTaskOnComplete(params: {
  dueAt: string;
  completedAt: string;
  aiApproved: boolean;
  aiConfidence?: number;
  isCritical?: boolean;
  requiresPhoto?: boolean;
  weight?: number;
}): { score_p: number; score_e: number; score_q: number } {
  const comps = computeComponentScores({
    status: 'completed',
    due_at: params.dueAt,
    completed_at: params.completedAt,
    score_q: params.aiApproved ? params.aiConfidence ?? 1 : 0.2,
    is_critical: params.isCritical,
    requires_photo: params.requiresPhoto,
    weight: params.weight,
  });
  return {
    score_p: round2(comps.p * 100),
    score_e: round2(comps.e * 100),
    score_q: round2(comps.q * 100),
  };
}
