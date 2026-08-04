import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

export const trainingRouter = Router();

const DEFAULT_COMPANY_ID = '11111111-1111-1111-1111-111111111111';

function companyIdOf(req: { user?: { company_id?: string } }): string {
  return req.user?.company_id || DEFAULT_COMPANY_ID;
}

/**
 * GET /api/training
 * Admin/gerente: todos os materiais da empresa (incl. rascunhos).
 * Demais papéis: apenas publicados.
 */
trainingRouter.get('/', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyIdOf(req);
    const isStaff = req.user?.role === 'admin' || req.user?.role === 'manager';

    let query = sb
      .from('training_materials')
      .select('id, company_id, title, description, content_url, content_type, is_published, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (!isStaff) query = query.eq('is_published', true);

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ materials: data || [] });
  } catch (err) {
    console.error('[training list]', err);
    return res.status(500).json({ error: 'Falha ao listar materiais de treinamento' });
  }
});

/** POST /api/training — Cria material (admin/gerente) */
trainingRouter.post('/', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyIdOf(req);
    const { title, description, content_url, content_type, is_published } = req.body || {};

    if (!title?.trim()) {
      return res.status(400).json({ error: 'Título é obrigatório' });
    }

    const allowedTypes = ['guide', 'video', 'course'];
    const normalizedType = allowedTypes.includes(content_type) ? content_type : 'guide';

    const { data, error } = await sb
      .from('training_materials')
      .insert({
        company_id: companyId,
        title: title.trim(),
        description: description?.trim() || null,
        content_url: content_url?.trim() || null,
        content_type: normalizedType,
        is_published: is_published ?? true,
      })
      .select()
      .single();

    if (error) throw error;

    return res.json({ material: data });
  } catch (err) {
    console.error('[training create]', err);
    return res.status(500).json({ error: 'Falha ao criar material' });
  }
});

/** PATCH /api/training/:id — Atualiza material (admin) */
trainingRouter.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { id } = req.params;
    const { title, description, content_url, content_type, is_published } = req.body || {};

    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = String(title).trim();
    if (description !== undefined) patch.description = description?.trim() || null;
    if (content_url !== undefined) patch.content_url = content_url?.trim() || null;
    if (content_type !== undefined) {
      const allowedTypes = ['guide', 'video', 'course'];
      patch.content_type = allowedTypes.includes(content_type) ? content_type : 'guide';
    }
    if (is_published !== undefined) patch.is_published = Boolean(is_published);

    const { data, error } = await sb
      .from('training_materials')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Material não encontrado' });
      }
      throw error;
    }

    return res.json({ material: data });
  } catch (err) {
    console.error('[training patch]', err);
    return res.status(500).json({ error: 'Falha ao atualizar material' });
  }
});

/** DELETE /api/training/:id — Remove material (admin) */
trainingRouter.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { id } = req.params;

    const { error } = await sb.from('training_materials').delete().eq('id', id);
    if (error) throw error;

    return res.json({ ok: true });
  } catch (err) {
    console.error('[training delete]', err);
    return res.status(500).json({ error: 'Falha ao remover material' });
  }
});
