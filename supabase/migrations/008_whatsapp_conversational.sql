-- =============================================================================
-- ConcluíAI — Migration 008: Camada conversacional WhatsApp
-- Aplique no SQL Editor do Supabase (uma única vez).
-- Porta do padrão do assistente-financeiro (Evolution API + conversas/confirmação).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Instâncias WhatsApp (Evolution API)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL UNIQUE,
  evolution_id TEXT,
  api_url TEXT,
  api_key TEXT,
  owner_phone TEXT, -- número com permissão para comandar (normalizado, E.164)
  manager_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_company ON whatsapp_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_active ON whatsapp_instances(instance_name) WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- Conversas (resolução por telefone do usuário na instância)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  user_phone TEXT NOT NULL,
  user_name TEXT,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc_company_phone ON whatsapp_conversations(company_id, user_phone);
CREATE INDEX IF NOT EXISTS idx_wc_instance ON whatsapp_conversations(instance_id);

-- -----------------------------------------------------------------------------
-- Mensagens da conversa (logs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT,
  type TEXT NOT NULL DEFAULT 'text', -- text | audio | image | button
  intent TEXT,
  entities JSONB,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wm_conversation ON whatsapp_messages(conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- Confirmações pendentes (motor de confirmação: aguarda Sim/Não)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_pending_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  user_phone TEXT NOT NULL,
  intent TEXT NOT NULL,
  payload JSONB NOT NULL, -- dados que serão executados após confirmação
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpc_phone_pending ON whatsapp_pending_confirmations(user_phone, status)
  WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_pending_confirmations ENABLE ROW LEVEL SECURITY;

-- Instâncias: leitura por admin/manager da empresa (o backend usa service role)
CREATE POLICY wi_select ON whatsapp_instances FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY wi_write ON whatsapp_instances FOR ALL
  USING (company_id = public.current_company_id() AND public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (company_id = public.current_company_id());

-- Conversas e mensagens: consulta pelos gestores (backend opera via service role)
CREATE POLICY wc_select ON whatsapp_conversations FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY wm_select ON whatsapp_messages FOR SELECT
  USING (company_id = public.current_company_id());

CREATE POLICY wpc_select ON whatsapp_pending_confirmations FOR SELECT
  USING (company_id = public.current_company_id());