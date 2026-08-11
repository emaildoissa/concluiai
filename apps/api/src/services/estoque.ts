import { getSupabaseAdmin } from '../lib/supabase.js';

export type MovementType = 'in' | 'out' | 'adjust' | 'count' | 'loss';
export type MovementSource = 'dashboard' | 'mobile' | 'whatsapp' | 'system';

export interface MovementInput {
  companyId: string;
  unitId?: string | null;
  productId: string;
  movementType: MovementType;
  quantity: number;
  unitCost?: number | null;
  reason?: string | null;
  source?: MovementSource;
  conversationId?: string | null;
  createdBy?: string | null;
}

export interface ListMovementsOptions {
  companyId: string;
  unitId?: string;
  productId?: string;
  limit?: number;
}

/** Aplica uma movimentação de estoque (saldo + custo médio via RPC) */
export async function applyMovement(input: MovementInput): Promise<string> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc('apply_stock_movement', {
    p_company_id: input.companyId,
    p_unit_id: input.unitId ?? null,
    p_product_id: input.productId,
    p_movement_type: input.movementType,
    p_quantity: input.quantity,
    p_unit_cost: input.unitCost ?? null,
    p_reason: input.reason ?? null,
    p_source: input.source ?? 'dashboard',
    p_conversation_id: input.conversationId ?? null,
    p_created_by: input.createdBy ?? null,
  });

  if (error) {
    console.error('[estoque applyMovement]', error);
    throw new Error(`Falha ao registrar movimentação: ${error.message}`);
  }

  return String(data);
}

/** Lista movimentações recentes (cadastros + WhatsApp) */
export async function listMovements(options: ListMovementsOptions): Promise<any[]> {
  const sb = getSupabaseAdmin();
  let query = sb
    .from('stock_movements')
    .select(
      'id, movement_type, quantity, unit_cost, reason, source, created_at, ' +
        'unit_id (id, name), products:product_id (id, name, uom_id (name, abbreviation)), ' +
        'created_by (id, full_name)'
    )
    .eq('company_id', options.companyId)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 50);

  if (options.unitId) query = query.eq('unit_id', options.unitId);
  if (options.productId) query = query.eq('product_id', options.productId);

  const { data, error } = await query;
  if (error) {
    console.error('[estoque listMovements]', error);
    throw new Error('Falha ao listar movimentações');
  }
  return data || [];
}

/** Saldo atual por produto (com join em products/UoM) */
export async function listStock(companyId: string, unitId?: string): Promise<any[]> {
  const sb = getSupabaseAdmin();

  const { data: products } = await sb
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true);
  const productIds = (products || []).map((p: any) => p.id);
  if (productIds.length === 0) return [];

  let query = sb
    .from('product_stock')
    .select(
      'product_id, unit_id, quantity, updated_at, ' +
        'products:product_id (id, name, sku, average_cost, min_stock, category_id (name), ' +
        'uom_id (name, abbreviation))'
    )
    .in('product_id', productIds)
    .order('products:product_id(name)', { ascending: true });

  if (unitId) query = query.eq('unit_id', unitId);

  const { data, error } = await query;
  if (error) {
    console.error('[estoque listStock]', error);
    throw new Error('Falha ao listar saldo de estoque');
  }
  return data || [];
}

/** Produtos de uma empresa para contexto em queries/conversa */
export async function listProductsForCompany(companyId: string): Promise<any[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('products')
    .select(
      'id, name, sku, min_stock, average_cost, ' +
        'uom_id (name, abbreviation), category_id (name), default_supplier_id (name)'
    )
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('[estoque listProducts]', error);
    throw new Error('Falha ao listar produtos');
  }
  return data || [];
}