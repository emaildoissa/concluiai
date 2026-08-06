import { getSupabaseAdmin } from '../lib/supabase.js';

interface ChecklistRow {
  id: string;
  shift: string;
  is_active: boolean;
  items: { id: string; due_time: string | null; title: string }[];
  units: { unit_id: string }[];
}

interface OperatorRow {
  id: string;
  unit_id: string | null;
}

/**
 * Gera as instâncias do dia a partir de chekclists ativos + unidades.
 * Otimizado: 1 query de busca de existentes + 1 insert em lote,
 * em vez de ~2 queries seriais por item/unidade.
 */
export async function generateTasksForDate(params?: {
  date?: string; // YYYY-MM-DD
  companyId?: string;
}): Promise<{ created: number }> {
  const sb = getSupabaseAdmin();
  const date = params?.date || new Date().toISOString().slice(0, 10);
  const companyId = params?.companyId;

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

  const clRows = (checklists || []) as ChecklistRow[];
  if (clRows.length === 0) return { created: 0 };

  // Builda a lista esperada (checklist_item_id, unit_id) em memória e
  // descobre quais unidades/items precisam ser consultados.
  const expected: { checklistItemId: string; unitId: string }[] = [];
  const expectedSet = new Set<string>();
  const unitIds = new Set<string>();
  const itemIds = new Set<string>();

  for (const cl of clRows) {
    for (const link of cl.units || []) {
      for (const item of cl.items || []) {
        const key = `${item.id}|${link.unit_id}`;
        expected.push({ checklistItemId: item.id, unitId: link.unit_id });
        expectedSet.add(key);
        unitIds.add(link.unit_id);
        itemIds.add(item.id);
      }
    }
  }

  // Operadores ativos por unidade (round-robin de atribuição) — 1 query.
  const activeOperatorsByUnit = new Map<string, string[]>();
  if (unitIds.size > 0) {
    const { data: operators, error: opErr } = await sb
      .from('profiles')
      .select('id, unit_id')
      .in('unit_id', [...unitIds])
      .eq('role', 'operator')
      .eq('is_active', true);
    if (opErr) throw opErr;
    for (const op of (operators || []) as OperatorRow[]) {
      if (!op.unit_id) continue;
      const list = activeOperatorsByUnit.get(op.unit_id) || [];
      list.push(op.id);
      activeOperatorsByUnit.set(op.unit_id, list);
    }
  }

  // Busca em 1 query todas as instâncias do dia que já existem.
  const existingKeys = new Set<string>();
  if (expectedSet.size > 0) {
    let existingQuery = sb
      .from('task_instances')
      .select('checklist_item_id, unit_id')
      .eq('scheduled_date', date);
    if (itemIds.size === 1) {
      existingQuery = existingQuery.eq('checklist_item_id', [...itemIds][0]);
    } else {
      existingQuery = existingQuery.in('checklist_item_id', [...itemIds]);
    }
    if (unitIds.size === 1) {
      existingQuery = existingQuery.eq('unit_id', [...unitIds][0]);
    } else {
      existingQuery = existingQuery.in('unit_id', [...unitIds]);
    }
    const { data: existing, error: findErr } = await existingQuery;
    if (findErr) throw findErr;
    for (const row of (existing || []) as { checklist_item_id: string; unit_id: string }[]) {
      existingKeys.add(`${row.checklist_item_id}|${row.unit_id}`);
    }
  }

  // Monta as linhas a inserir em memória (round-robin por unidade).
  const rrCounter = new Map<string, number>();
  const rowsToInsert: Record<string, unknown>[] = [];
  let created = 0;

  for (const cl of clRows) {
    for (const item of cl.items || []) {
      const dueTime = item.due_time || '23:59:00';
      const dueAt = new Date(`${date}T${String(dueTime).slice(0, 8)}`);
      for (const link of cl.units || []) {
        const key = `${item.id}|${link.unit_id}`;
        if (existingKeys.has(key)) continue;

        const operators = activeOperatorsByUnit.get(link.unit_id) || [];
        let assignedTo: string | null = null;
        if (operators.length > 0) {
          const i = rrCounter.get(link.unit_id) || 0;
          assignedTo = operators[i % operators.length];
          rrCounter.set(link.unit_id, i + 1);
        }

        rowsToInsert.push({
          checklist_item_id: item.id,
          unit_id: link.unit_id,
          assigned_to: assignedTo,
          scheduled_date: date,
          due_at: dueAt.toISOString(),
          status: 'pending',
        });
      }
    }
  }

  // Insert em lote — 1 query para todos.
  if (rowsToInsert.length > 0) {
    const { error: insErr } = await sb.from('task_instances').insert(rowsToInsert);
    if (insErr) throw insErr;
    created = rowsToInsert.length;
  }

  return { created };
}