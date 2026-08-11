import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { applyMovement, listMovements, listStock, type MovementInput } from '../services/estoque.js';

export const estoqueRouter = Router();

function companyOf(req: any): string {
  return req.user?.company_id || '11111111-1111-1111-1111-111111111111';
}

function userOf(req: any): string | null {
  return req.user?.id ?? null;
}

/** GET /api/estoque/categories */
estoqueRouter.get('/categories', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('product_categories')
      .select('*')
      .eq('company_id', companyOf(req))
      .order('sort_order');
    if (error) throw error;
    return res.json({ categories: data || [] });
  } catch (err) {
    console.error('[estoque categories list]', err);
    return res.status(500).json({ error: 'Falha ao listar categorias' });
  }
});

/** POST /api/estoque/categories */
estoqueRouter.post('/categories', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyOf(req);
    const { name, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });

    const { data, error } = await sb
      .from('product_categories')
      .upsert({ company_id: companyId, name: name.trim(), sort_order: sort_order ?? 0 })
      .select()
      .single();
    if (error) throw error;
    return res.json({ category: data });
  } catch (err) {
    console.error('[estoque categories save]', err);
    return res.status(500).json({ error: 'Falha ao salvar categoria' });
  }
});

/** GET /api/estoque/uom */
estoqueRouter.get('/uom', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('unit_of_measure')
      .select('*')
      .eq('company_id', companyOf(req))
      .order('name');
    if (error) throw error;
    return res.json({ uom: data || [] });
  } catch (err) {
    console.error('[estoque uom list]', err);
    return res.status(500).json({ error: 'Falha ao listar unidades de medida' });
  }
});

/** POST /api/estoque/uom */
estoqueRouter.post('/uom', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyOf(req);
    const { name, abbreviation, kind, grams_factor } = req.body;
    if (!name?.trim() || !abbreviation?.trim()) {
      return res.status(400).json({ error: 'Nome e abreviatura obrigatórios' });
    }

    const { data, error } = await sb
      .from('unit_of_measure')
      .upsert({
        company_id: companyId,
        name: name.trim(),
        abbreviation: abbreviation.trim(),
        kind: kind || 'unit',
        grams_factor: grams_factor ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return res.json({ uom: data });
  } catch (err) {
    console.error('[estoque uom save]', err);
    return res.status(500).json({ error: 'Falha ao salvar unidade de medida' });
  }
});

/** GET /api/estoque/suppliers */
estoqueRouter.get('/suppliers', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('suppliers')
      .select('*')
      .eq('company_id', companyOf(req))
      .order('name');
    if (error) throw error;
    return res.json({ suppliers: data || [] });
  } catch (err) {
    console.error('[estoque suppliers list]', err);
    return res.status(500).json({ error: 'Falha ao listar fornecedores' });
  }
});

/** POST /api/estoque/suppliers */
estoqueRouter.post('/suppliers', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyOf(req);
    const { name, contact_name, phone, email } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });

    const { data, error } = await sb
      .from('suppliers')
      .upsert({
        company_id: companyId,
        name: name.trim(),
        contact_name: contact_name?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;
    return res.json({ supplier: data });
  } catch (err) {
    console.error('[estoque suppliers save]', err);
    return res.status(500).json({ error: 'Falha ao salvar fornecedor' });
  }
});

/** GET /api/estoque/products — lista produtos com saldo opcional por unidade */
estoqueRouter.get('/products', requireAuth, async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyOf(req);
    const { unit_id } = req.query;

    const { data, error } = await sb
      .from('products')
      .select(
        'id, name, sku, min_stock, average_cost, is_active, created_at, ' +
          'category_id (id, name), uom_id (id, name, abbreviation), default_supplier_id (id, name)'
      )
      .eq('company_id', companyId)
      .order('name');

    if (error) throw error;

    let rows = data || [];

    if (unit_id) {
      const { data: stock } = await sb
        .from('product_stock')
        .select('product_id, quantity')
        .eq('unit_id', unit_id);
      const map = new Map((stock || []).map((s: any) => [s.product_id, s.quantity]));
      rows = rows.map((p: any) => ({ ...p, quantity: map.get(p.id) ?? 0 }));
    }

    return res.json({ products: rows });
  } catch (err) {
    console.error('[estoque products list]', err);
    return res.status(500).json({ error: 'Falha ao listar produtos' });
  }
});

/** POST /api/estoque/products — cria/atualiza produto */
estoqueRouter.post('/products', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const companyId = companyOf(req);
    const {
      id, name, sku, category_id, uom_id, default_supplier_id, min_stock, average_cost, is_active,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });

    const { data, error } = await sb
      .from('products')
      .upsert({
        id: id || undefined,
        company_id: companyId,
        name: name.trim(),
        sku: sku?.trim() || null,
        category_id,
        uom_id,
        default_supplier_id,
        min_stock: min_stock ?? 0,
        average_cost: average_cost ?? 0,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return res.json({ product: data });
  } catch (err) {
    console.error('[estoque products save]', err);
    return res.status(500).json({ error: 'Falha ao salvar produto' });
  }
});

/** GET /api/estoque/movements */
estoqueRouter.get('/movements', requireAuth, async (req, res) => {
  try {
    const companyId = companyOf(req);
    const { unit_id, product_id, limit } = req.query;
    const movements = await listMovements({
      companyId,
      unitId: typeof unit_id === 'string' ? unit_id : undefined,
      productId: typeof product_id === 'string' ? product_id : undefined,
      limit: limit ? Number(limit) : 50,
    });
    return res.json({ movements });
  } catch (err) {
    console.error('[estoque movements list]', err);
    return res.status(500).json({ error: 'Falha ao listar movimentações' });
  }
});

/** POST /api/estoque/movements — registra entrada/saída/ajuste/contagem/perda */
estoqueRouter.post('/movements', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const body: MovementInput = {
      ...req.body,
      companyId: companyOf(req),
      createdBy: userOf(req),
    };

    if (!body.productId) return res.status(400).json({ error: 'Produto obrigatório' });
    if (!body.movementType) return res.status(400).json({ error: 'Tipo obrigatório' });
    if (!body.quantity || body.quantity <= 0) {
      return res.status(400).json({ error: 'Quantidade deve ser maior que zero' });
    }

    const movementId = await applyMovement(body);
    return res.json({ id: movementId, ok: true });
  } catch (err) {
    console.error('[estoque movements create]', err);
    const message = err instanceof Error ? err.message : 'Falha ao registrar movimentação';
    return res.status(400).json({ error: message });
  }
});

/** GET /api/estoque/stock — saldo (por unidade opcional) */
estoqueRouter.get('/stock', requireAuth, async (req, res) => {
  try {
    const companyId = companyOf(req);
    const { unit_id } = req.query;
    const stock = await listStock(companyId, typeof unit_id === 'string' ? unit_id : undefined);
    return res.json({ stock });
  } catch (err) {
    console.error('[estoque stock list]', err);
    return res.status(500).json({ error: 'Falha ao listar saldo' });
  }
});