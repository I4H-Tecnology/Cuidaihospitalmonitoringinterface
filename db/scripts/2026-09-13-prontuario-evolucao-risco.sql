-- =============================================================================
--  Migração incremental: evolução clínica e alergias/riscos do paciente.
--
--  Duas entidades novas, fora das 12 do DER da RFC, por decisão de produto de
--  13/09/2026 (o prontuário deixa de ser só visão de produto). Aditiva e
--  idempotente, para banco que já tem dado. Volume novo não precisa dela:
--  `db/init/01_schema.sql` já cria as tabelas.
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -f /scripts/2026-09-13-prontuario-evolucao-risco.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS evolucao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  texto       text NOT NULL CHECK (length(btrim(texto)) >= 3),
  data_hora   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evolucao_por_paciente ON evolucao (paciente_id, data_hora DESC);
COMMENT ON TABLE evolucao IS
  'Nota de evolução clínica. Sem UPDATE nem DELETE: registro corrigido leva nota nova, não edição da antiga.';

CREATE TABLE IF NOT EXISTS risco_paciente (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id   uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('alergia', 'risco')),
  descricao     text NOT NULL CHECK (length(btrim(descricao)) >= 3),
  gravidade     text NOT NULL DEFAULT 'moderada'
                  CHECK (gravidade IN ('leve', 'moderada', 'grave')),
  ativo         boolean NOT NULL DEFAULT true,
  usuario_id    uuid NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  inativado_em  timestamptz,
  CONSTRAINT risco_inativacao_coerente CHECK (
    (ativo = false AND inativado_em IS NOT NULL) OR (ativo = true AND inativado_em IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS risco_ativo_por_paciente ON risco_paciente (paciente_id) WHERE ativo;
COMMENT ON TABLE risco_paciente IS
  'Alergia ou risco do paciente. Inativa-se, não se edita nem se apaga (mesmo raciocínio de acompanhante).';

SELECT table_name, (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) AS colunas
  FROM information_schema.tables t
 WHERE table_name IN ('evolucao', 'risco_paciente')
 ORDER BY table_name;
