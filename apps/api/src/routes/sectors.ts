import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

export const sectorsRouter = Router();

const DEFAULT_COMPANY_ID = '11111111-1111-1111-1111-111111111111';

function companyIdOf(req: { user?: { company_id?: string } }): string {
  return req.user?.company_id || DEFAULT_COMPANY_ID;
}

/** GET /api/sectors?unit_id= — Lista setores (por unidade quando informado) */
sectorsRouter.get('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyIdOf(req);
    const unitId = req.query.unit_id ? String(req.query.unit_id) : undefined;

    const { data: unitIds } = await sb
      .from('units')
      .select('id')
      .eq('company_id', companyId);
    const ownedUnitIds = (unitIds || []).map((u: { id: string }) => u.id);

    let query = sb
      .from('sectors')
      .select('id, unit_id, name, sort_order')
      .in('unit_id', ownedUnitIds)
      .order('sort_order', { ascending: true });

    if (unitId) query = query.eq('unit_id', unitId);

    const { data: sectors, error } = await query;
    if (error) throw error;

    return res.json({ sectors: sectors || [] });
  } catch (err) {
    console.error('[sectors list]', err);
    return res.status(500).json({ error: 'Falha ao listar setores' });
  }
});

/** POST /api/sectors — Cria ou atualiza um setor */
sectorsRouter.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyIdOf(req);
    const { id, unit_id, name, sort_order } = req.body || {};

    if (!name?.trim() || !unit_id) {
      return res.status(400).json({ error: 'Nome e unidade são obrigatórios' });
    }

    const { data: unit } = await sb
      .from('units')
      .select('id')
      .eq('id', unit_id)
      .eq('company_id', companyId)
      .single();

    if (!unit) {
      return res.status(403).json({ error: 'Unidade não pertence à empresa' });
    }

    const { data: sector, error } = await sb
      .from('sectors')
      .upsert({
        id: id || undefined,
        unit_id,
        name: name.trim(),
        sort_order: Number(sort_order ?? 0),
      })
      .select()
      .single();

    if (error) throw error;

    return res.json({ sector });
  } catch (err) {
    console.error('[sectors save]', err);
    return res.status(500).json({ error: 'Falha ao salvar setor' });
  }
});

/** DELETE /api/sectors/:id — Remove um setor (vínculos em cascata) */
sectorsRouter.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { id } = req.params;

    const { error } = await sb.from('sectors').delete().eq('id', id);
    if (error) throw error;

    return res.json({ ok: true });
  } catch (err) {
    console.error('[sectors delete]', err);
    return res.status(500).json({ error: 'Falha ao deletar setor' });
  }
});