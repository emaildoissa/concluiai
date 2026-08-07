-- Migração: dias de operação por unidade
-- Rodar no SQL Editor do Supabase (uma única vez).
-- NULL  = opera todos os dias (comportamento atual)
-- ex. {1,2,3,4,5} = segunda a sexta; {0,6} = fim de semana
-- Código: 0=domingo, 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado

ALTER TABLE units ADD COLUMN IF NOT EXISTS operation_days INT[];