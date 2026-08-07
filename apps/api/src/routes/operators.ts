import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

export const operatorsRouter = Router();

const DEFAULT_COMPANY_ID = '11111111-1111-1111-1111-111111111111';

function companyIdOf(req: { user?: { company_id?: string } }): string {
  return req.user?.company_id || DEFAULT_COMPANY_ID;
}

/** Substitui os setores de um operador (delete + insert em lote) */
async function replaceProfileSectors(
  sb: ReturnType<typeof getSupabaseAdmin>,
  profileId: string,
  sectorIds: string[] | undefined
) {
  if (sectorIds === undefined) return;
  const ids = Array.isArray(sectorIds) ? sectorIds : [];
  await sb.from('profiles_sectors').delete().eq('profile_id', profileId);
  if (ids.length > 0) {
    await sb
      .from('profiles_sectors')
      .insert(ids.map((sector_id: string) => ({ profile_id: profileId, sector_id })));
  }
}

/** Busca sector_ids de perfis e anexa ao resultado */
async function attachSectorIds(
  sb: ReturnType<typeof getSupabaseAdmin>,
  rows: { id: string }[]
): Promise<Record<string, string[]>> {
  if (rows.length === 0) return {};
  const ids = rows.map((r) => r.id);
  const { data: links, error } = await sb
    .from('profiles_sectors')
    .select('profile_id, sector_id')
    .in('profile_id', ids);
  if (error) throw error;
  const map: Record<string, string[]> = {};
  for (const l of (links || []) as { profile_id: string; sector_id: string }[]) {
    (map[l.profile_id] ||= []).push(l.sector_id);
  }
  return map;
}

/** GET /api/operators — Lista operadores/gerentes da empresa com nome da unidade */
operatorsRouter.get('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyIdOf(req);

    const { data, error } = await sb
      .from('profiles')
      .select(
        `
          id, company_id, full_name, email, phone, role, unit_id, is_active, created_at,
          unit:units ( id, name )
        `
      )
      .eq('company_id', companyId)
      .in('role', ['operator', 'manager'])
      .order('created_at', { ascending: true });

    if (error) throw error;

    const rows = (data || []) as { id: string }[];
    const sectorMap = await attachSectorIds(sb, rows);
    const operators = rows.map((row: any) => ({ ...row, sector_ids: sectorMap[row.id] || [] }));

    return res.json({ operators });
  } catch (err) {
    console.error('[operators list]', err);
    return res.status(500).json({ error: 'Falha ao listar operadores' });
  }
});

/** POST /api/operators — Cria usuário de auth + perfil de operador/gerente */
operatorsRouter.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyIdOf(req);
    const { email, password, full_name, phone, role, unit_id, is_active, sector_ids } = req.body || {};

    if (!email?.trim() || !full_name?.trim()) {
      return res.status(400).json({ error: 'Email e nome completo são obrigatórios' });
    }

    const normalizedRole = role === 'manager' ? 'manager' : 'operator';
    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: existing, error: listError } = await sb.auth.admin.listUsers();
    if (listError) throw listError;

    let userId = existing?.users.find((u) => u.email === normalizedEmail)?.id;

    if (!userId) {
      const passwordFinal = password?.trim() || Math.random().toString(36).slice(2, 10);
      const { data: created, error: createError } = await sb.auth.admin.createUser({
        email: normalizedEmail,
        password: passwordFinal,
        email_confirm: true,
      });
      if (createError) throw createError;
      userId = created.user.id;
    }

    const { data: profile, error: upsertError } = await sb
      .from('profiles')
      .upsert(
        {
          id: userId,
          company_id: companyId,
          full_name: full_name.trim(),
          email: normalizedEmail,
          phone: phone?.trim() || null,
          role: normalizedRole,
          unit_id: unit_id || null,
          is_active: is_active ?? true,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (upsertError) throw upsertError;

    await replaceProfileSectors(sb, profile!.id, sector_ids);

    return res.json({ operator: profile });
  } catch (err) {
    console.error('[operators create]', err);
    return res.status(500).json({ error: 'Falha ao criar operador' });
  }
});

/** PATCH /api/operators/:id — Atualiza unidade, papel, telefone, ativo */
operatorsRouter.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { id } = req.params;
    const { full_name, phone, role, unit_id, is_active, sector_ids } = req.body || {};

    const patch: Record<string, unknown> = {};
    if (full_name !== undefined) patch.full_name = String(full_name).trim();
    if (phone !== undefined) patch.phone = phone?.trim() || null;
    if (role !== undefined) patch.role = role === 'manager' ? 'manager' : 'operator';
    if (unit_id !== undefined) patch.unit_id = unit_id || null;
    if (is_active !== undefined) patch.is_active = Boolean(is_active);

    const { data, error } = await sb
      .from('profiles')
      .update(patch)
      .eq('id', id)
      .select(
        `
          id, company_id, full_name, email, phone, role, unit_id, is_active, created_at,
          unit:units ( id, name )
        `
      )
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Operador não encontrado' });
      }
      throw error;
    }

    await replaceProfileSectors(sb, String(id), sector_ids);

    return res.json({ operator: data, sector_ids: sector_ids });
  } catch (err) {
    console.error('[operators patch]', err);
    return res.status(500).json({ error: 'Falha ao atualizar operador' });
  }
});
