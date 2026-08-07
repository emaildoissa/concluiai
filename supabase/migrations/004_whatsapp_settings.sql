-- Migração: configuração de WhatsApp editável em runtime
-- Rodar no SQL Editor do Supabase (uma única vez).
-- Armazena overrides da integração WhatsApp; o backend lê daqui com fallback no .env.

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);