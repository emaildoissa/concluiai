-- Migração: vínculo N:N entre operadores e setores
-- Rodar no SQL Editor do Supabase (uma única vez).
-- Permite que um operador seja responsável por vários setores (ex.: cozinha, freezers),
-- de modo que a geração de tarefas atribua itens só a operadores do setor do checklist.

CREATE TABLE IF NOT EXISTS profiles_sectors (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, sector_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_sectors_sector ON profiles_sectors(sector_id);

-- RLS
ALTER TABLE profiles_sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_sectors_select ON profiles_sectors FOR SELECT
  USING (
    sector_id IN (
      SELECT s.id FROM sectors s
      JOIN units u ON u.id = s.unit_id
      WHERE u.company_id = public.current_company_id()
    )
  );

CREATE POLICY profiles_sectors_write ON profiles_sectors FOR ALL
  USING (
    sector_id IN (
      SELECT s.id FROM sectors s
      JOIN units u ON u.id = s.unit_id
      WHERE u.company_id = public.current_company_id()
    )
    AND public.current_user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    sector_id IN (
      SELECT s.id FROM sectors s
      JOIN units u ON u.id = s.unit_id
      WHERE u.company_id = public.current_company_id()
    )
  );

-- Conferir que a UPSERT de profiles_sectors é liberada ao service_role:
GRANT ALL ON TABLE public.profiles_sectors TO service_role;