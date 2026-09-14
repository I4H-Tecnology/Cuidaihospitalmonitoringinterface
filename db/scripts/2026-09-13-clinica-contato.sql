-- =============================================================================
--  Migração incremental: telefone e e-mail da clínica.
--
--  Aditiva e idempotente: duas colunas nulas em `clinica`, sem tocar em linha
--  nenhuma. Existe para bancos que já têm dado e não podem ser recriados
--  (`docker compose down -v` apagaria tudo). Volume novo não precisa dela:
--  `db/init/01_schema.sql` já cria as colunas.
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -f /scripts/2026-09-13-clinica-contato.sql
-- =============================================================================

ALTER TABLE clinica ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE clinica ADD COLUMN IF NOT EXISTS email text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinica_email_valido'
  ) THEN
    ALTER TABLE clinica
      ADD CONSTRAINT clinica_email_valido
      CHECK (email IS NULL OR position('@' in email) > 1);
  END IF;
END $$;

SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'clinica' AND column_name IN ('telefone', 'email')
 ORDER BY column_name;
