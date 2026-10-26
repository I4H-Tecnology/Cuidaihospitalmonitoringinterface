-- =============================================================================
--  Módulo financeiro — 0004: orçamento e conciliação bancária
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ORCAMENTO — quanto se planejou por mês, categoria e (opcionalmente) centro
-- de custo. O realizado não é gravado aqui: vem dos títulos, pela competência.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.orcamento (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id   uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  competencia      date NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
  categoria_id     uuid NOT NULL,
  centro_custo_id  uuid,
  valor            numeric(15,2) NOT NULL CHECK (valor >= 0),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, categoria_id) REFERENCES financeiro.categoria (organizacao_id, id),
  FOREIGN KEY (organizacao_id, centro_custo_id) REFERENCES financeiro.centro_custo (organizacao_id, id)
);
CREATE UNIQUE INDEX orcamento_unico ON financeiro.orcamento
  (organizacao_id, competencia, categoria_id, COALESCE(centro_custo_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE TRIGGER trg_orcamento_atualizado BEFORE UPDATE ON financeiro.orcamento
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_orcamento_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.orcamento
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- EXTRATO — o que o banco diz que aconteceu, importado de OFX ou CSV.
-- `identificador` (FITID ou hash da linha) é único por conta: importar o
-- mesmo arquivo de novo não duplica nada.
-- Conciliar = apontar a linha do banco para o movimento do caixa. Um
-- movimento casa com no máximo uma linha.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.extrato_importacao (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id    uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  conta_id          uuid NOT NULL,
  arquivo           text NOT NULL,
  formato           text NOT NULL CHECK (formato IN ('ofx', 'csv')),
  inicio            date,
  fim               date,
  saldo_final       numeric(15,2),
  linhas_novas      integer NOT NULL DEFAULT 0,
  linhas_repetidas  integer NOT NULL DEFAULT 0,
  importado_por     text,
  importado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, conta_id) REFERENCES financeiro.conta (organizacao_id, id)
);

CREATE TABLE financeiro.extrato_linha (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  importacao_id   uuid NOT NULL,
  conta_id        uuid NOT NULL,
  data            date NOT NULL,
  valor           numeric(15,2) NOT NULL CHECK (valor <> 0),
  descricao       text NOT NULL,
  documento       text,
  identificador   text NOT NULL,
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'conciliada', 'ignorada')),
  movimento_id    uuid,
  resolvida_em    timestamptz,
  resolvida_por   text,
  UNIQUE (organizacao_id, id),
  UNIQUE (conta_id, identificador),
  FOREIGN KEY (organizacao_id, importacao_id) REFERENCES financeiro.extrato_importacao (organizacao_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organizacao_id, conta_id) REFERENCES financeiro.conta (organizacao_id, id),
  FOREIGN KEY (organizacao_id, movimento_id) REFERENCES financeiro.movimento (organizacao_id, id),
  CONSTRAINT extrato_conciliacao_coerente CHECK ((status = 'conciliada') = (movimento_id IS NOT NULL)),
  CONSTRAINT extrato_resolucao_coerente CHECK ((status = 'pendente') = (resolvida_em IS NULL))
);
CREATE UNIQUE INDEX extrato_movimento_unico ON financeiro.extrato_linha (movimento_id) WHERE movimento_id IS NOT NULL;
CREATE INDEX extrato_pendente ON financeiro.extrato_linha (organizacao_id, conta_id, data) WHERE status = 'pendente';
CREATE TRIGGER trg_extrato_linha_auditoria AFTER UPDATE ON financeiro.extrato_linha
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();
