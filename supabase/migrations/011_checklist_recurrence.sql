-- Migração: Suporte a recorrência Quinzenal (biweekly / 15 dias) e Mensal (monthly)
-- + data âncora (recurrence_anchor_date) para geração exata no dia programado.
-- Seguro de re-executar (idempotente).

ALTER TYPE public.recurrence_type ADD VALUE IF NOT EXISTS 'biweekly';
ALTER TYPE public.recurrence_type ADD VALUE IF NOT EXISTS 'monthly';

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS recurrence_anchor_date DATE;
