-- Migração: Limpeza de pré-atribuições nominais em tarefas pendentes/atrasadas
-- A partir de agora, tarefas nascem vinculadas apenas ao setor do checklist (assigned_to = NULL)
-- e o campo assigned_to passa a registrar exclusivamente quem efetivamente executou a tarefa.
-- Seguro de re-executar (idempotente).

UPDATE public.task_instances
SET assigned_to = NULL
WHERE status IN ('pending', 'late')
  AND scheduled_date >= CURRENT_DATE;
