/**
 * Seed de desenvolvimento (idempotente):
 *  - cria (ou reutiliza) um usuário de autenticação + perfil de operador demo;
 *  - resolve empresa/unidade/checklist dinamicamente (ou via override por env);
 *  - gera as task_instances de HOJE para os itens do checklist da unidade.
 *
 * Overrides opcionais:
 *   COMPANY_SLUG, COMPANY_ID, UNIT_ID, CHECKLIST_ID, OPERATOR_EMAIL,
 *   OPERATOR_PASSWORD, OPERATOR_NAME
 *
 * Uso:
 *   node scripts/seed-user.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env da raiz.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRole);

const EMAIL = process.env.OPERATOR_EMAIL ?? 'operador@demo.com';
const PASSWORD = process.env.OPERATOR_PASSWORD ?? 'operador123';
const FULL_NAME = process.env.OPERATOR_NAME ?? 'Operador Demo';

function dueAt(dateStr, timeStr) {
  const raw = (timeStr ?? '12:00').trim();
  const hhmm = raw.length >= 5 ? raw.slice(0, 5) : raw; // 'HH:MM:SS' -> 'HH:MM'
  return new Date(`${dateStr}T${hhmm}:00-03:00`).toISOString();
}

function requireRow(data, label) {
  if (!data) throw new Error(`Nenhum registro encontrado para ${label}.`);
  return data;
}

async function main() {
  // 1) Empresa
  let company;
  if (process.env.COMPANY_ID) {
    const { data, error } = await supabase.from('companies').select('id, name, slug').eq('id', process.env.COMPANY_ID).single();
    if (error) throw new Error(`Empresa por COMPANY_ID: ${error.message}`);
    company = data;
  } else if (process.env.COMPANY_SLUG) {
    const { data, error } = await supabase.from('companies').select('id, name, slug').eq('slug', process.env.COMPANY_SLUG).maybeSingle();
    if (error) throw new Error(`Empresa por COMPANY_SLUG: ${error.message}`);
    company = data;
  } else {
    const { data, error } = await supabase.from('companies').select('id, name, slug').limit(1).single();
    if (error) throw new Error(`Listar empresas: ${error.message}`);
    company = data;
  }
  company = requireRow(company, 'empresa');
  console.log(`[seed] empresa: ${company.name} (${company.id})`);

  // 2) Unidade
  let unit;
  if (process.env.UNIT_ID) {
    const { data, error } = await supabase.from('units').select('id, name').eq('id', process.env.UNIT_ID).single();
    if (error) throw new Error(`Unidade por UNIT_ID: ${error.message}`);
    unit = data;
  } else {
    const { data, error } = await supabase
      .from('units')
      .select('id, name')
      .eq('company_id', company.id)
      .limit(1)
      .single();
    if (error) throw new Error(`Listar unidades da empresa: ${error.message}`);
    unit = data;
  }
  unit = requireRow(unit, 'unidade');
  console.log(`[seed] unidade: ${unit.name} (${unit.id})`);

  // 3) Checklist (preferir o vinculado à unidade via checklist_units)
  let checklistId = process.env.CHECKLIST_ID;
  if (!checklistId) {
    const { data: linked, error: linkErr } = await supabase
      .from('checklist_units')
      .select('checklist_id')
      .eq('unit_id', unit.id)
      .limit(1);
    if (linkErr) throw new Error(`checklist_units da unidade: ${linkErr.message}`);

    if (linked?.length) {
      checklistId = linked[0].checklist_id;
    } else {
      const { data: firstCl, error: clErr } = await supabase
        .from('checklists')
        .select('id')
        .eq('company_id', company.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (clErr) throw new Error(`Listar checklists da empresa: ${clErr.message}`);
      checklistId = firstCl?.id;
    }
  }
  if (!checklistId) throw new Error('Nenhum checklist encontrado para a empresa/unidade.');
  console.log(`[seed] checklist: ${checklistId}`);

  // 4) Usuário de auth
  const { data: existing, error: searchError } = await supabase.auth.admin.listUsers();
  if (searchError) throw searchError;

  let userId = existing.users.find((u) => u.email === EMAIL)?.id;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`[seed] usuário criado: ${EMAIL}`);
  } else {
    console.log(`[seed] usuário já existia: ${EMAIL}`);
  }

  // 5) Perfil (upsert)
  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      company_id: company.id,
      full_name: FULL_NAME,
      email: EMAIL,
      role: 'operator',
      unit_id: unit.id,
      is_active: true,
    },
    { onConflict: 'id' },
  );
  if (profileError) throw profileError;
  console.log(`[seed] perfil do operador pronto (unit ${unit.id})`);

  // 6) Task instances de hoje
  const today = new Date().toISOString().slice(0, 10);

  const { data: items, error: itemsError } = await supabase
    .from('checklist_items')
    .select('id, due_time, title, sort_order')
    .eq('checklist_id', checklistId)
    .order('sort_order', { ascending: true });

  if (itemsError) throw itemsError;
  if (!items?.length) {
    console.warn('[seed] nenhum item encontrado no checklist. Nenhuma tarefa criada.');
    return;
  }

  const rows = items.map((item) => ({
    checklist_item_id: item.id,
    unit_id: unit.id,
    assigned_to: userId,
    scheduled_date: today,
    due_at: dueAt(today, item.due_time),
    status: 'pending',
  }));

  const { error: insertError } = await supabase
    .from('task_instances')
    .upsert(rows, { onConflict: 'checklist_item_id,unit_id,scheduled_date', ignoreDuplicates: true });

  if (insertError) throw insertError;
  console.log(`[seed] ${rows.length} tarefa(s) de hoje criada(s) para a unidade (${items.map((i) => i.title).join(', ')}).`);

  console.log('\nLogin no app mobile:');
  console.log(`  email: ${EMAIL}`);
  console.log(`  senha: ${PASSWORD}`);
}

main().catch((err) => {
  console.error('[seed] erro:', err.message);
  process.exit(1);
});
