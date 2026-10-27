-- =============================================================================
--  Módulo financeiro — 0003: capital
--
--  Sócios e capital social, empréstimos e financiamentos, e o patrimônio
--  (bens com depreciação). Investimento financeiro não tem tabela própria: é
--  uma conta do tipo 'investimento', com aplicação e resgate por transferência
--  e rendimento como receita financeira.
--
--  O dinheiro de tudo isto continua passando por títulos e baixas — aporte é
--  título a receber do sócio, parcela de empréstimo é título a pagar ao banco.
--  As tabelas daqui guardam o CONTRATO (quem é sócio com quanto, a taxa e o
--  prazo do empréstimo, a vida útil do bem); o caixa é um só.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SOCIO — participação e capital subscrito (o prometido no contrato social).
-- O integralizado é calculado: soma dos aportes de integralização recebidos.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.socio (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id      uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  pessoa_id           uuid NOT NULL,
  participacao        numeric(7,4) NOT NULL CHECK (participacao > 0 AND participacao <= 100),
  capital_subscrito   numeric(15,2) NOT NULL DEFAULT 0 CHECK (capital_subscrito >= 0),
  data_entrada        date NOT NULL DEFAULT CURRENT_DATE,
  data_saida          date,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  UNIQUE (organizacao_id, pessoa_id),
  FOREIGN KEY (organizacao_id, pessoa_id) REFERENCES financeiro.pessoa (organizacao_id, id),
  CONSTRAINT socio_saida_valida CHECK (data_saida IS NULL OR data_saida >= data_entrada)
);
CREATE TRIGGER trg_socio_atualizado BEFORE UPDATE ON financeiro.socio
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_socio_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.socio
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- EMPRESTIMO — o contrato. Ao registrar, o módulo cria a entrada do dinheiro
-- (título a receber do banco, já baixado na conta) e um título a pagar por
-- parcela, com juros e amortização rateados em categorias diferentes.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.emprestimo (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id        uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  pessoa_id             uuid NOT NULL,
  conta_id              uuid NOT NULL,
  centro_custo_id       uuid,
  descricao             text NOT NULL CHECK (length(btrim(descricao)) >= 2),
  sistema               text NOT NULL CHECK (sistema IN ('price', 'sac')),
  valor_principal       numeric(15,2) NOT NULL CHECK (valor_principal > 0),
  taxa_mensal           numeric(9,6) NOT NULL CHECK (taxa_mensal >= 0 AND taxa_mensal < 100),
  prazo                 smallint NOT NULL CHECK (prazo BETWEEN 1 AND 600),
  carencia              smallint NOT NULL DEFAULT 0 CHECK (carencia BETWEEN 0 AND 120),
  juros_na_carencia     text NOT NULL DEFAULT 'pagos' CHECK (juros_na_carencia IN ('pagos', 'capitalizados')),
  data_contratacao      date NOT NULL,
  primeiro_vencimento   date NOT NULL,
  -- IOF e tarifas descontados na liberação: despesa financeira no dia.
  custos_iniciais       numeric(15,2) NOT NULL DEFAULT 0 CHECK (custos_iniciais >= 0),
  cancelado_em          timestamptz,
  motivo_cancelamento   text,
  criado_por            text,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, pessoa_id) REFERENCES financeiro.pessoa (organizacao_id, id),
  FOREIGN KEY (organizacao_id, conta_id) REFERENCES financeiro.conta (organizacao_id, id),
  FOREIGN KEY (organizacao_id, centro_custo_id) REFERENCES financeiro.centro_custo (organizacao_id, id),
  CONSTRAINT emprestimo_vencimento_depois CHECK (primeiro_vencimento > data_contratacao),
  CONSTRAINT emprestimo_custos_menores CHECK (custos_iniciais < valor_principal),
  CONSTRAINT emprestimo_cancelamento_coerente CHECK ((cancelado_em IS NULL) = (motivo_cancelamento IS NULL))
);
CREATE TRIGGER trg_emprestimo_atualizado BEFORE UPDATE ON financeiro.emprestimo
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_emprestimo_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.emprestimo
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- ATIVO — bem do patrimônio. A depreciação não é gravada: é calculada do
-- valor, da vida útil e do início de uso (dominio/depreciacao.py), então
-- corrigir a vida útil corrige todos os meses sem reprocessar nada — desde
-- que não atinja período fechado, o que o serviço confere.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.ativo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id    uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  descricao         text NOT NULL CHECK (length(btrim(descricao)) >= 2),
  classe            text NOT NULL CHECK (classe IN
                      ('terreno', 'imovel', 'instalacoes', 'maquina', 'movel', 'veiculo', 'informatica', 'outro')),
  identificacao     text,
  centro_custo_id   uuid,
  data_aquisicao    date NOT NULL,
  inicio_uso        date NOT NULL,
  valor_aquisicao   numeric(15,2) NOT NULL CHECK (valor_aquisicao > 0),
  valor_residual    numeric(15,2) NOT NULL DEFAULT 0 CHECK (valor_residual >= 0),
  vida_util_meses   smallint CHECK (vida_util_meses IS NULL OR vida_util_meses BETWEEN 1 AND 1200),
  titulo_compra_id  uuid,
  baixado_em        date,
  motivo_baixa      text,
  valor_venda       numeric(15,2) CHECK (valor_venda IS NULL OR valor_venda >= 0),
  titulo_venda_id   uuid,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, centro_custo_id) REFERENCES financeiro.centro_custo (organizacao_id, id),
  FOREIGN KEY (organizacao_id, titulo_compra_id) REFERENCES financeiro.titulo (organizacao_id, id),
  FOREIGN KEY (organizacao_id, titulo_venda_id) REFERENCES financeiro.titulo (organizacao_id, id),
  CONSTRAINT ativo_residual_menor CHECK (valor_residual <= valor_aquisicao),
  CONSTRAINT ativo_uso_depois_da_compra CHECK (inicio_uso >= data_aquisicao),
  CONSTRAINT ativo_baixa_coerente CHECK ((baixado_em IS NULL) = (motivo_baixa IS NULL)),
  CONSTRAINT ativo_baixa_depois_da_compra CHECK (baixado_em IS NULL OR baixado_em >= data_aquisicao),
  CONSTRAINT ativo_terreno_nao_deprecia CHECK (classe <> 'terreno' OR vida_util_meses IS NULL)
);
CREATE TRIGGER trg_ativo_atualizado BEFORE UPDATE ON financeiro.ativo
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_ativo_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.ativo
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();
