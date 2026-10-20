-- =============================================================================
-- Migração: Checklists Quantitativos & Auditoria em Tempo Real
-- Suporte a medições numéricas (temperatura, pH, saturação de óleo, pressão etc.)
-- =============================================================================

-- 1. Novos campos em checklist_items para definição de parâmetros de aceitação
ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'boolean',
  ADD COLUMN IF NOT EXISTS unit_of_measurement TEXT,
  ADD COLUMN IF NOT EXISTS min_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS max_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS alert_on_non_compliant BOOLEAN NOT NULL DEFAULT true;

-- 2. Registro do valor aferido e status de conformidade em task_instances
ALTER TABLE task_instances
  ADD COLUMN IF NOT EXISTS recorded_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS is_compliant BOOLEAN,
  ADD COLUMN IF NOT EXISTS non_compliance_action TEXT;

-- 3. Índices para consultas ágeis de auditoria e não-conformidades
CREATE INDEX IF NOT EXISTS idx_tasks_non_compliant
  ON task_instances(unit_id, scheduled_date)
  WHERE is_compliant = false;

CREATE INDEX IF NOT EXISTS idx_checklist_items_type
  ON checklist_items(checklist_id, item_type);
