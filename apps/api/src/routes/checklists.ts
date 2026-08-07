import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

export const checklistsRouter = Router();

/** GET /api/checklists — Lista checklists da empresa do usuário */
checklistsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = req.user?.company_id;

    const { data: checklists, error } = await sb
      .from('checklists')
      .select(`
        *,
        items:checklist_items (*),
        units:checklist_units ( unit_id )
      `)
      .eq(companyId ? 'company_id' : 'is_active', companyId || true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (checklists || []).map((cl) => ({
      ...cl,
      unit_ids: (cl.units || []).map((u: { unit_id: string }) => u.unit_id),
      items: (cl.items || []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
    }));

    return res.json({ checklists: formatted });
  } catch (err) {
    console.error('[checklists/list]', err);
    return res.status(500).json({ error: 'Falha ao listar checklists' });
  }
});

/** POST /api/checklists — Cria ou atualiza um checklist + itens + unidades */
checklistsRouter.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = req.user?.company_id || '11111111-1111-1111-1111-111111111111';
    const { id, name, description, shift, recurrence, is_active, unit_ids, items, sector_id } = req.body;

    const validModes = ['photo', 'check', 'both'];

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    // 1. Upsert no Checklist
    const { data: cl, error: clErr } = await sb
      .from('checklists')
      .upsert({
        id: id || undefined,
        company_id: companyId,
        name: name.trim(),
        description: description || null,
        shift: shift || 'all_day',
        recurrence: recurrence || 'daily',
        sector_id: sector_id || null,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (clErr || !cl) throw clErr;

    // 2. Atualiza vínculos de unidades em checklist_units
    await sb.from('checklist_units').delete().eq('checklist_id', cl.id);
    let targetUnitIds: string[] = Array.isArray(unit_ids) ? unit_ids : [];
    if (targetUnitIds.length === 0) {
      const { data: companyUnits } = await sb
        .from('units')
        .select('id')
        .eq('company_id', companyId);
      targetUnitIds = (companyUnits || []).map((u) => u.id);
    }
    if (targetUnitIds.length > 0) {
      const links = targetUnitIds.map((unit_id: string) => ({
        checklist_id: cl.id,
        unit_id,
      }));
      await sb.from('checklist_units').insert(links);
    }

    // 3. Atualiza itens em checklist_items
    await sb.from('checklist_items').delete().eq('checklist_id', cl.id);
    if (Array.isArray(items) && items.length > 0) {
      const itemRows = items.map((it: any, idx: number) => {
        const execution_mode = validModes.includes(it.execution_mode) ? it.execution_mode : 'photo';
        const requires_photo = execution_mode === 'photo' || execution_mode === 'both';
        return {
          checklist_id: cl.id,
          title: it.title,
          description: it.description || null,
          is_critical: Boolean(it.is_critical),
          requires_photo,
          requires_gps: it.requires_gps ?? true,
          due_time: it.due_time || '23:59:00',
          sort_order: idx + 1,
          weight: it.weight || 1,
          execution_mode,
        };
      });
      await sb.from('checklist_items').insert(itemRows);
    }

    return res.json({ success: true, checklist: cl });
  } catch (err) {
    console.error('[checklists/save]', err);
    return res.status(500).json({ error: 'Falha ao salvar checklist no Supabase' });
  }
});

/** DELETE /api/checklists/:id — Deleta um checklist */
checklistsRouter.delete('/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from('checklists').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error('[checklists/delete]', err);
    return res.status(500).json({ error: 'Falha ao remover checklist' });
  }
});
