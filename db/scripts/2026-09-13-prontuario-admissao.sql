-- =============================================================================
--  Migração incremental: admissão completa no prontuário.
--
--  - paciente.historico_medico e paciente.medico_responsavel (texto livre)
--  - tabela prescricao (medicamento e o que o médico receitou)
--
--  Aditiva e idempotente, para banco que já tem dado. Volume novo não precisa
--  dela: `db/init/01_schema.sql` já traz tudo. Decisão de produto de
--  13/09/2026, além do MVP avaliado (RFC 2.6; errata pendente).
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -f /scripts/2026-09-13-prontuario-admissao.sql
-- =============================================================================

ALTER TABLE paciente ADD COLUMN IF NOT EXISTS historico_medico text;
ALTER TABLE paciente ADD COLUMN IF NOT EXISTS medico_responsavel text;

CREATE TABLE IF NOT EXISTS prescricao (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id       uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  medicamento       text NOT NULL CHECK (length(btrim(medicamento)) >= 2),
  posologia         text,
  medico_prescritor text,
  observacao        text,
  ativo             boolean NOT NULL DEFAULT true,
  usuario_id        uuid NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  inativado_em      timestamptz,
  CONSTRAINT prescricao_inativacao_coerente CHECK (
    (ativo = false AND inativado_em IS NOT NULL) OR (ativo = true AND inativado_em IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS prescricao_ativa_por_paciente ON prescricao (paciente_id) WHERE ativo;
COMMENT ON TABLE prescricao IS
  'Medicamento prescrito ao paciente e por quem. Inativa-se (suspensa), não se edita nem se apaga.';

SELECT column_name FROM information_schema.columns
 WHERE table_name = 'paciente' AND column_name IN ('historico_medico', 'medico_responsavel')
UNION ALL
SELECT 'tabela prescricao' FROM information_schema.tables WHERE table_name = 'prescricao';
