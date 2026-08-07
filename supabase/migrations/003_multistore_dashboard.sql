-- Migração: RPC de Dashboard Multiloja
-- Rodar no SQL Editor do Supabase (uma única vez).
-- Substitui o loop N+1 (1 + N×5 queries) por 1 única query.
-- Seguro de re-executar (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_multistore_dashboard(
  p_company_id uuid,
  p_date date
)
RETURNS TABLE (
  unit_id uuid,
  unit_name text,
  address text,
  score_total numeric,
  critical_missed integer,
  tasks_pending bigint,
  tasks_late bigint,
  tasks_completed bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    u.id                                AS unit_id,
    u.name                              AS unit_name,
    u.address                           AS address,
    ds.score_total                      AS score_total,
    ds.critical_missed                  AS critical_missed,
    COUNT(t.id) FILTER (WHERE t.status = 'pending')    AS tasks_pending,
    COUNT(t.id) FILTER (WHERE t.status = 'late')       AS tasks_late,
    COUNT(t.id) FILTER (WHERE t.status = 'completed')  AS tasks_completed
  FROM units u
  LEFT JOIN task_instances t
    ON t.unit_id = u.id
   AND t.scheduled_date = p_date
  LEFT JOIN LATERAL (
    SELECT score_total, critical_missed
    FROM daily_scores
    WHERE unit_id = u.id
      AND user_id IS NULL
      AND score_date = p_date
    LIMIT 1
  ) ds ON true
  WHERE u.company_id = p_company_id
    AND u.is_active
  GROUP BY u.id, u.name, u.address, ds.score_total, ds.critical_missed
  ORDER BY u.name
$$;

GRANT EXECUTE ON FUNCTION public.get_multistore_dashboard(uuid, date) TO anon;
GRANT EXECUTE ON FUNCTION public.get_multistore_dashboard(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_multistore_dashboard(uuid, date) TO service_role;
