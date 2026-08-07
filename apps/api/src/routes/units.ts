import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { normalizeOperationDays } from '../lib/operation-days.js';

export const unitsRouter = Router();

/** GET /api/units — Lista todas as unidades da empresa do usuário */
unitsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = req.user?.company_id || '11111111-1111-1111-1111-111111111111';

    const { data: units, error } = await sb
      .from('units')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.json({ units: units || [] });
  } catch (err) {
    console.error('[units list]', err);
    return res.status(500).json({ error: 'Falha ao listar unidades' });
  }
});

/** POST /api/units — Cria ou atualiza uma unidade no Supabase */
unitsRouter.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = req.user?.company_id || '11111111-1111-1111-1111-111111111111';
    const { id, name, address, is_active, operation_days } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Nome da unidade é obrigatório' });
    }

    const { data: unit, error } = await sb
      .from('units')
      .upsert({
        id: id || undefined,
        company_id: companyId,
        name: name.trim(),
        address: address?.trim() || null,
        operation_days: normalizeOperationDays(operation_days),
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;

    return res.json({ unit });
  } catch (err) {
    console.error('[units save]', err);
    return res.status(500).json({ error: 'Falha ao salvar unidade' });
  }
});

/** DELETE /api/units/:id — Remove uma unidade no Supabase */
unitsRouter.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { id } = req.params;

    const { error } = await sb.from('units').delete().eq('id', id);
    if (error) throw error;

    return res.json({ ok: true });
  } catch (err) {
    console.error('[units delete]', err);
    return res.status(500).json({ error: 'Falha ao deletar unidade' });
  }
});
