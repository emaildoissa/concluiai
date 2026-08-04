-- =============================================================================
-- AvisaAI — Schema inicial (Multi-tenant food service ops)
-- Aplique no SQL Editor do Supabase ou via: supabase db push
-- =============================================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'operator');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'late', 'rejected', 'skipped');
CREATE TYPE evidence_review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE shift_type AS ENUM ('morning', 'afternoon', 'night', 'all_day');
CREATE TYPE recurrence_type AS ENUM ('daily', 'weekly', 'once');
CREATE TYPE training_content_type AS ENUM ('guide', 'video', 'course');

-- -----------------------------------------------------------------------------
-- Empresas (tenant)
-- -----------------------------------------------------------------------------
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Unidades (lojas)
-- -----------------------------------------------------------------------------
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_units_company ON units(company_id);

-- -----------------------------------------------------------------------------
-- Setores (cozinha, salão, estoque…)
-- -----------------------------------------------------------------------------
CREATE TABLE sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_sectors_unit ON sectors(unit_id);

-- -----------------------------------------------------------------------------
-- Perfis (liga auth.users ao tenant e papéis)
-- -----------------------------------------------------------------------------
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'operator',
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_company ON profiles(company_id);
CREATE INDEX idx_profiles_unit ON profiles(unit_id);
CREATE INDEX idx_profiles_role ON profiles(role);

-- -----------------------------------------------------------------------------
-- Checklists (templates)
-- -----------------------------------------------------------------------------
CREATE TABLE checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  shift shift_type NOT NULL DEFAULT 'all_day',
  recurrence recurrence_type NOT NULL DEFAULT 'daily',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklists_company ON checklists(company_id);

-- -----------------------------------------------------------------------------
-- Itens do checklist
-- -----------------------------------------------------------------------------
CREATE TABLE checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  requires_photo BOOLEAN NOT NULL DEFAULT true,
  requires_gps BOOLEAN NOT NULL DEFAULT true,
  due_time TIME,
  sort_order INT NOT NULL DEFAULT 0,
  weight NUMERIC(4,2) NOT NULL DEFAULT 1.0
);

CREATE INDEX idx_checklist_items_checklist ON checklist_items(checklist_id);
CREATE INDEX idx_checklist_items_critical ON checklist_items(is_critical) WHERE is_critical = true;

-- Unidades vinculadas a um checklist (multiloja)
CREATE TABLE checklist_units (
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  PRIMARY KEY (checklist_id, unit_id)
);

-- -----------------------------------------------------------------------------
-- Instâncias de tarefa (geradas por dia/turno)
-- -----------------------------------------------------------------------------
CREATE TABLE task_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id UUID NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status task_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  score_p NUMERIC(5,2),
  score_e NUMERIC(5,2),
  score_q NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (checklist_item_id, unit_id, scheduled_date)
);

CREATE INDEX idx_tasks_unit_date ON task_instances(unit_id, scheduled_date);
CREATE INDEX idx_tasks_status ON task_instances(status);
CREATE INDEX idx_tasks_due ON task_instances(due_at) WHERE status IN ('pending', 'in_progress', 'late');
CREATE INDEX idx_tasks_assigned ON task_instances(assigned_to);

-- -----------------------------------------------------------------------------
-- Evidências fotográficas + GPS
-- -----------------------------------------------------------------------------
CREATE TABLE evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_instance_id UUID NOT NULL REFERENCES task_instances(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_status evidence_review_status NOT NULL DEFAULT 'pending',
  ai_reason TEXT,
  ai_confidence NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_evidences_task ON evidences(task_instance_id);
CREATE INDEX idx_evidences_review ON evidences(review_status);

-- -----------------------------------------------------------------------------
-- Scores diários (BI)
-- -----------------------------------------------------------------------------
CREATE TABLE daily_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  score_p NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_e NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_q NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_total NUMERIC(5,2) NOT NULL DEFAULT 0,
  tasks_total INT NOT NULL DEFAULT 0,
  tasks_completed INT NOT NULL DEFAULT 0,
  tasks_late INT NOT NULL DEFAULT 0,
  critical_missed INT NOT NULL DEFAULT 0,
  UNIQUE (unit_id, user_id, score_date)
);

CREATE INDEX idx_daily_scores_date ON daily_scores(score_date);
CREATE INDEX idx_daily_scores_unit ON daily_scores(unit_id, score_date);

-- -----------------------------------------------------------------------------
-- Alertas enviados (auditoria WhatsApp)
-- -----------------------------------------------------------------------------
CREATE TABLE alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_instance_id UUID REFERENCES task_instances(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  recipient_phone TEXT,
  recipient_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent', -- sent | failed | mock
  provider_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Treinamento
-- -----------------------------------------------------------------------------
CREATE TABLE training_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content_url TEXT,
  content_type training_content_type NOT NULL DEFAULT 'guide',
  sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Helper: company do usuário autenticado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_unit_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unit_id FROM profiles WHERE id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;

-- Companies: membros veem a própria
CREATE POLICY companies_select ON companies FOR SELECT
  USING (id = public.current_company_id());

CREATE POLICY companies_update ON companies FOR UPDATE
  USING (id = public.current_company_id() AND public.current_user_role() = 'admin');

-- Units
CREATE POLICY units_select ON units FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY units_write ON units FOR ALL
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (company_id = public.current_company_id());

-- Sectors
CREATE POLICY sectors_select ON sectors FOR SELECT
  USING (unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id()));

CREATE POLICY sectors_write ON sectors FOR ALL
  USING (unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id())
         AND public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id()));

-- Profiles
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = auth.uid() OR (company_id = public.current_company_id() AND public.current_user_role() = 'admin'));

CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (company_id = public.current_company_id() AND public.current_user_role() = 'admin');

-- Checklists
CREATE POLICY checklists_select ON checklists FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY checklists_write ON checklists FOR ALL
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY checklist_items_select ON checklist_items FOR SELECT
  USING (checklist_id IN (SELECT id FROM checklists WHERE company_id = public.current_company_id()));

CREATE POLICY checklist_items_write ON checklist_items FOR ALL
  USING (checklist_id IN (SELECT id FROM checklists WHERE company_id = public.current_company_id())
         AND public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (checklist_id IN (SELECT id FROM checklists WHERE company_id = public.current_company_id()));

CREATE POLICY checklist_units_select ON checklist_units FOR SELECT
  USING (unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id()));

CREATE POLICY checklist_units_write ON checklist_units FOR ALL
  USING (unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id())
         AND public.current_user_role() IN ('admin', 'manager'));

-- Tasks
CREATE POLICY tasks_select ON task_instances FOR SELECT
  USING (
    unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id())
    AND (
      public.current_user_role() IN ('admin', 'manager')
      OR assigned_to = auth.uid()
      OR unit_id = public.current_unit_id()
    )
  );

CREATE POLICY tasks_update ON task_instances FOR UPDATE
  USING (
    unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id())
    AND (
      public.current_user_role() IN ('admin', 'manager')
      OR assigned_to = auth.uid()
      OR unit_id = public.current_unit_id()
    )
  );

CREATE POLICY tasks_insert ON task_instances FOR INSERT
  WITH CHECK (unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id()));

-- Evidences
CREATE POLICY evidences_select ON evidences FOR SELECT
  USING (
    task_instance_id IN (
      SELECT id FROM task_instances
      WHERE unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id())
    )
  );

CREATE POLICY evidences_insert ON evidences FOR INSERT
  WITH CHECK (operator_id = auth.uid());

CREATE POLICY evidences_update ON evidences FOR UPDATE
  USING (
    public.current_user_role() IN ('admin', 'manager')
    OR operator_id = auth.uid()
  );

-- Daily scores
CREATE POLICY daily_scores_select ON daily_scores FOR SELECT
  USING (unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id()));

CREATE POLICY daily_scores_write ON daily_scores FOR ALL
  USING (unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id()));

-- Alert logs (admin/manager)
CREATE POLICY alert_logs_select ON alert_logs FOR SELECT
  USING (
    unit_id IN (SELECT id FROM units WHERE company_id = public.current_company_id())
    AND public.current_user_role() IN ('admin', 'manager')
  );

-- Training
CREATE POLICY training_select ON training_materials FOR SELECT
  USING (company_id = public.current_company_id() AND (is_published OR public.current_user_role() IN ('admin', 'manager')));

CREATE POLICY training_write ON training_materials FOR ALL
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (company_id = public.current_company_id());

-- -----------------------------------------------------------------------------
-- Trigger: criar profile ao signup (opcional — preencha company via app)
-- Em produção, o onboarding cria company + profile explicitamente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Profile é criado pelo fluxo de onboarding da API/app.
  -- Mantemos o hook vazio/seguro para não falhar o signup.
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- Storage bucket para evidências
-- Execute também no Dashboard → Storage ou via API:
--   insert into storage.buckets (id, name, public) values ('evidences', 'evidences', false);
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidences',
  'evidences',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage (path: company_id/unit_id/task_id/filename)
CREATE POLICY evidences_storage_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'evidences'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );

CREATE POLICY evidences_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'evidences'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );

CREATE POLICY evidences_storage_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'evidences'
    AND (storage.foldername(name))[1] = public.current_company_id()::text
  );

-- -----------------------------------------------------------------------------
-- Seed de demonstração (opcional — comente se não quiser dados de exemplo)
-- Nota: profiles dependem de auth.users; seed de users deve ser feito via app.
-- -----------------------------------------------------------------------------
INSERT INTO companies (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Demo Restaurantes LTDA', 'demo-restaurantes');

INSERT INTO units (id, company_id, name, address) VALUES
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Unidade Centro', 'Rua Principal, 100'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Unidade Shopping', 'Av. Mall, 500');

INSERT INTO sectors (id, unit_id, name, sort_order) VALUES
  ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222221', 'Cozinha', 1),
  ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222221', 'Salão', 2),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Cozinha', 1);

INSERT INTO checklists (id, company_id, name, description, shift, recurrence) VALUES
  ('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111',
   'Abertura de Cozinha', 'Checklist diário de abertura', 'morning', 'daily');

INSERT INTO checklist_items (id, checklist_id, title, description, is_critical, due_time, sort_order, weight) VALUES
  ('55555555-5555-5555-5555-555555555551', '44444444-4444-4444-4444-444444444441',
   'Conferência de gás', 'Verificar válvulas e vazamentos', true, '08:00', 1, 2.0),
  ('55555555-5555-5555-5555-555555555552', '44444444-4444-4444-4444-444444444441',
   'Temperatura das câmaras', 'Registrar temperatura frigorífica', true, '08:15', 2, 2.0),
  ('55555555-5555-5555-5555-555555555553', '44444444-4444-4444-4444-444444444441',
   'Limpeza de bancadas', 'Bancadas higienizadas e secas', false, '08:30', 3, 1.0),
  ('55555555-5555-5555-5555-555555555554', '44444444-4444-4444-4444-444444444441',
   'Organização de estoque seco', 'FIFO e etiquetas ok', false, '09:00', 4, 1.0);

INSERT INTO checklist_units (checklist_id, unit_id) VALUES
  ('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222221'),
  ('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222222');

INSERT INTO training_materials (company_id, title, description, content_type, is_published) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'Padrão de evidência fotográfica',
   'Como tirar fotos aceitas pela IA: boa iluminação, enquadramento do objeto, sem blur.',
   'guide', true),
  ('11111111-1111-1111-1111-111111111111',
   'Checklist de segurança de gás',
   'Passo a passo da conferência crítica de gás.',
   'guide', true);
