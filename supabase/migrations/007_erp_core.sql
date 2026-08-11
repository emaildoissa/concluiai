-- =============================================================================
-- ConcluíAI — Migration 007: ERP core (cadastro base + estoque)
-- Aplique no SQL Editor do Supabase (uma única vez).
-- Base para a camada conversacional (WhatsApp do gerente).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorias de produto
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_company ON product_categories(company_id);

-- -----------------------------------------------------------------------------
-- Unidades de medida (base de conversão → gramas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unit_of_measure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'unit' CHECK (kind IN ('unit', 'weight', 'volume')),
  grams_factor NUMERIC(12,4), -- p/ peso: gramas por 1 unidade (ex.: caixa=5000g); NULL p/ unidade/volume
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_uom_company ON unit_of_measure(company_id);

-- -----------------------------------------------------------------------------
-- Fornecedores
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);

-- -----------------------------------------------------------------------------
-- Produtos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  uom_id UUID REFERENCES unit_of_measure(id) ON DELETE SET NULL,
  default_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  min_stock NUMERIC(14,3) NOT NULL DEFAULT 0, -- estoque mínimo p/ gerador de compras
  average_cost NUMERIC(14,2) NOT NULL DEFAULT 0, -- custo médio (atualizado a cada entrada)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(company_id) WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- Movimentações de estoque (auditável: quem, quando, tipo, fonte)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjust', 'count', 'loss')),
  quantity NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(14,2),
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('dashboard', 'mobile', 'whatsapp', 'system')),
  conversation_id UUID,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_unit ON stock_movements(unit_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_company ON stock_movements(company_id, created_at);

-- -----------------------------------------------------------------------------
-- Saldo atual por produto + unidade (linha upsertada a cada movimentação)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_stock (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_product_stock_unit ON product_stock(unit_id);

-- -----------------------------------------------------------------------------
-- Function: aplica movimentação e atualiza saldo + custo médio
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  p_company_id UUID,
  p_unit_id UUID,
  p_product_id UUID,
  p_movement_type TEXT,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'dashboard',
  p_conversation_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id UUID;
  v_delta NUMERIC;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero';
  END IF;

  CASE p_movement_type
    WHEN 'in', 'count'   THEN v_delta := p_quantity;
    WHEN 'out', 'loss'   THEN v_delta := -p_quantity;
    WHEN 'adjust'        THEN v_delta := p_quantity; -- qty = delta (pode ser negativo no ajuste)
    ELSE RAISE EXCEPTION 'Tipo de movimentação inválido: %', p_movement_type;
  END CASE;

  INSERT INTO stock_movements (
    company_id, unit_id, product_id, movement_type, quantity, unit_cost,
    reason, source, conversation_id, created_by
  ) VALUES (
    p_company_id, p_unit_id, p_product_id, p_movement_type, p_quantity, p_unit_cost,
    p_reason, p_source, p_conversation_id, p_created_by
  )
  RETURNING id INTO v_movement_id;

  -- Saldo
  IF p_unit_id IS NULL THEN
    INSERT INTO product_stock (product_id, unit_id, quantity)
    VALUES (p_product_id, NULL, v_delta)
    ON CONFLICT (product_id, unit_id)
    DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                  updated_at = now();
  ELSE
    INSERT INTO product_stock (product_id, unit_id, quantity)
    VALUES (p_product_id, p_unit_id, v_delta)
    ON CONFLICT (product_id, unit_id)
    DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                  updated_at = now();
  END IF;

  -- Custo médio (entradas informam novo custo)
  IF p_movement_type IN ('in', 'adjust') AND p_unit_cost IS NOT NULL AND p_unit_cost > 0 THEN
    UPDATE products
    SET average_cost = p_unit_cost
    WHERE id = p_product_id;
  END IF;

  RETURN v_movement_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_categories_select ON product_categories FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY product_categories_write ON product_categories FOR ALL
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY uom_select ON unit_of_measure FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY uom_write ON unit_of_measure FOR ALL
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY suppliers_select ON suppliers FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY suppliers_write ON suppliers FOR ALL
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY products_select ON products FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY products_write ON products FOR ALL
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY stock_movements_select ON stock_movements FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY stock_movements_insert ON stock_movements FOR INSERT
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY stock_movements_update ON stock_movements FOR UPDATE
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY stock_movements_delete ON stock_movements FOR DELETE
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY product_stock_select ON product_stock FOR SELECT
  USING (product_id IN (SELECT id FROM products WHERE company_id = public.current_company_id()));

CREATE POLICY product_stock_update ON product_stock FOR UPDATE
  USING (product_id IN (SELECT id FROM products WHERE company_id = public.current_company_id())
         AND public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY product_stock_insert ON product_stock FOR INSERT
  WITH CHECK (product_id IN (SELECT id FROM products WHERE company_id = public.current_company_id())
              AND public.current_user_role() IN ('admin', 'manager'));

-- -----------------------------------------------------------------------------
-- Seed de exemplo (comente se não quiser dados de demonstração)
-- -----------------------------------------------------------------------------
INSERT INTO product_categories (id, company_id, name, sort_order) VALUES
  ('66666666-6666-6666-6666-666666666601', '11111111-1111-1111-1111-111111111111', 'Hortifruti', 1),
  ('66666666-6666-6666-6666-666666666602', '11111111-1111-1111-1111-111111111111', 'Proteínas', 2),
  ('66666666-6666-6666-6666-666666666603', '11111111-1111-1111-1111-111111111111', 'Mercearia', 3)
ON CONFLICT (company_id, name) DO NOTHING;

INSERT INTO unit_of_measure (id, company_id, name, abbreviation, kind, grams_factor) VALUES
  ('77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111111', 'Quilograma', 'kg', 'weight', 1000),
  ('77777777-7777-7777-7777-777777777702', '11111111-1111-1111-1111-111111111111', 'Grama', 'g', 'weight', 1),
  ('77777777-7777-7777-7777-777777777703', '11111111-1111-1111-1111-111111111111', 'Unidade', 'un', 'unit', NULL),
  ('77777777-7777-7777-7777-777777777704', '11111111-1111-1111-1111-111111111111', 'Caixa', 'cx', 'unit', NULL),
  ('77777777-7777-7777-7777-777777777705', '11111111-1111-1111-1111-111111111111', 'Litro', 'L', 'volume', NULL)
ON CONFLICT (company_id, name) DO NOTHING;

INSERT INTO suppliers (id, company_id, name, contact_name, phone) VALUES
  ('88888888-8888-8888-8888-888888888801', '11111111-1111-1111-1111-111111111111', 'Atacadão Centro', 'José', '5551999990001')
ON CONFLICT (company_id, name) DO NOTHING;

INSERT INTO products (id, company_id, category_id, uom_id, default_supplier_id, name, sku, min_stock, average_cost) VALUES
  ('99999999-9999-9999-9999-999999999901', '11111111-1111-1111-1111-111111111111',
   '66666666-6666-6666-6666-666666666601', '77777777-7777-7777-7777-777777777701', '88888888-8888-8888-8888-888888888801',
   'Tomate', 'TOM', 5, 0),
  ('99999999-9999-9999-9999-999999999902', '11111111-1111-1111-1111-111111111111',
   '66666666-6666-6666-6666-666666666602', '77777777-7777-7777-7777-777777777701', NULL,
   'Frango (peito)', 'FRP', 10, 0),
  ('99999999-9999-9999-9999-999999999903', '11111111-1111-1111-1111-111111111111',
   '66666666-6666-6666-6666-666666666603', '77777777-7777-7777-7777-777777777703', NULL,
   'Óleo de soja', 'OLE', 4, 0)
ON CONFLICT (company_id, name) DO NOTHING;