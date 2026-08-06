-- Migração: modos de execução de item + check/observação em tarefas
-- Rodar no SQL Editor do Supabase (uma única vez).
-- Aditivo e seguro de re-executar (IF NOT EXISTS).

-- Modo de execução por item:
--   'photo' = foto obrigatória (comportamento atual)
--   'check' = só marcação/observação, sem foto
--   'both'  = marcação/observação + foto OPCIONAL
ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'photo';

-- task_instances: marcação "concluí"/checked e observação livre
ALTER TABLE task_instances
  ADD COLUMN IF NOT EXISTS checked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes TEXT;