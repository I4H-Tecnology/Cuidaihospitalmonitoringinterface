-- =============================================================================
--  Módulo financeiro — 0001: fundação
--
--  Empresa, auditoria, contas, plano de contas, centros de custo, pessoas,
--  contas a pagar e a receber (título, parcela, rateio, baixa), movimentos de
--  caixa e recorrências.
--
--  TRÊS GARANTIAS que o banco dá sozinho, mesmo que a aplicação esqueça:
--
--  1. Isolamento entre empresas. Toda tabela tem organizacao_id, e toda
--     referência entre tabelas é pela dupla (organizacao_id, id). Uma parcela
--     da empresa A não consegue apontar para um título da empresa B: a chave
--     estrangeira não fecha.
--  2. Dinheiro não some. O rateio de um título soma exatamente o valor dele,
--     as parcelas também, e uma parcela não recebe mais do que vale.
--  3. Mês fechado é fechado. Com organizacao.fechado_ate preenchido, nada que
--     mexa no caixa ou no resultado daquele período entra, muda ou sai.
--
--  Tudo o que muda fica em financeiro.auditoria, com quem mudou e o motivo.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS financeiro;

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION financeiro.tocar_atualizado_em() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;

-- -----------------------------------------------------------------------------
-- ORGANIZACAO — a empresa. `chave_externa` é o id dela no sistema hospedeiro
-- (no MedSignal, o id da clínica); o módulo não conhece o cadastro de lá.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.organizacao (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_externa           text NOT NULL UNIQUE CHECK (length(chave_externa) BETWEEN 1 AND 120),
  nome                    text NOT NULL,
  documento               text,
  regime_tributario       text NOT NULL DEFAULT 'simples'
                            CHECK (regime_tributario IN ('mei', 'simples', 'presumido', 'real', 'outro')),
  -- Lançamentos com data (ou competência) até aqui são recusados pelos gatilhos.
  fechado_ate             date,
  capital_social          numeric(15,2) NOT NULL DEFAULT 0 CHECK (capital_social >= 0),
  -- Folha. Encargos em %, porque dependem do regime (ver dominio/folha.py).
  encargo_inss_patronal   numeric(6,3) NOT NULL DEFAULT 0 CHECK (encargo_inss_patronal BETWEEN 0 AND 100),
  encargo_rat             numeric(6,3) NOT NULL DEFAULT 0 CHECK (encargo_rat BETWEEN 0 AND 100),
  encargo_terceiros       numeric(6,3) NOT NULL DEFAULT 0 CHECK (encargo_terceiros BETWEEN 0 AND 100),
  fgts_aliquota           numeric(6,3) NOT NULL DEFAULT 8 CHECK (fgts_aliquota BETWEEN 0 AND 100),
  percentual_adiantamento numeric(6,3) NOT NULL DEFAULT 40 CHECK (percentual_adiantamento BETWEEN 0 AND 100),
  -- A DCTFWeb consolida INSS e IRRF num DARF só; há quem ainda pague separado.
  guia_unica_dctfweb      boolean NOT NULL DEFAULT true,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_organizacao_atualizado BEFORE UPDATE ON financeiro.organizacao
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- AUDITORIA — preenchida por gatilho, não pela aplicação. Assim não há caminho
-- de código que altere dinheiro sem deixar rastro. Quem e por quê vêm de
-- variáveis da transação (set_config), gravadas por banco.py a cada escrita.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.auditoria (
  id              bigserial PRIMARY KEY,
  -- Sem chave estrangeira de propósito: a trilha sobrevive ao que ela registra.
  organizacao_id  uuid,
  tabela          text NOT NULL,
  registro_id     uuid,
  operacao        text NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
  antes           jsonb,
  depois          jsonb,
  usuario_ref     text,
  usuario_nome    text,
  motivo          text,
  em              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_por_registro ON financeiro.auditoria (organizacao_id, tabela, registro_id, em DESC);
CREATE INDEX auditoria_recente ON financeiro.auditoria (organizacao_id, em DESC);

CREATE OR REPLACE FUNCTION financeiro.auditar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  velho  jsonb;
  novo   jsonb;
  antes  jsonb;
  depois jsonb;
  linha  jsonb;
BEGIN
  -- Mudança feita por outro gatilho (ex.: o valor pago da parcela, que a baixa
  -- atualiza) já está registrada na operação que a causou.
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN velho := to_jsonb(OLD) - 'atualizado_em'; END IF;
  IF TG_OP <> 'DELETE' THEN novo := to_jsonb(NEW) - 'atualizado_em'; END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Só os campos que mudaram, dos dois lados.
    SELECT jsonb_object_agg(key, o.value), jsonb_object_agg(key, n.value)
      INTO antes, depois
      FROM jsonb_each(novo) n JOIN jsonb_each(velho) o USING (key)
     WHERE n.value IS DISTINCT FROM o.value;
    IF antes IS NULL THEN
      RETURN NULL;
    END IF;
  ELSE
    antes := velho;
    depois := novo;
  END IF;

  linha := COALESCE(novo, velho);
  INSERT INTO financeiro.auditoria
    (organizacao_id, tabela, registro_id, operacao, antes, depois, usuario_ref, usuario_nome, motivo)
  VALUES (
    COALESCE((linha ->> 'organizacao_id')::uuid,
             CASE WHEN TG_TABLE_NAME = 'organizacao' THEN (linha ->> 'id')::uuid END),
    TG_TABLE_NAME,
    (linha ->> 'id')::uuid,
    TG_OP,
    antes,
    depois,
    NULLIF(current_setting('financeiro.usuario_ref', true), ''),
    NULLIF(current_setting('financeiro.usuario_nome', true), ''),
    NULLIF(current_setting('financeiro.motivo', true), '')
  );
  RETURN NULL;
END $$;

CREATE TRIGGER trg_organizacao_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.organizacao
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- Período fechado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION financeiro.fechado_ate(org uuid) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT fechado_ate FROM financeiro.organizacao WHERE id = org
$$;

CREATE OR REPLACE FUNCTION financeiro.recusar_periodo_fechado(limite date) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'O período até % está fechado. Reabra o período em Configurações para alterar lançamentos dele.',
    to_char(limite, 'DD/MM/YYYY')
    USING ERRCODE = 'P0001', HINT = 'periodo_fechado';
END $$;

-- -----------------------------------------------------------------------------
-- CONTA — onde o dinheiro está: caixa, conta corrente, aplicação, cartão.
-- O saldo não é coluna: é a soma dos movimentos (o saldo inicial também é um
-- movimento). Coluna de saldo precisa de alguém para mantê-la certa; soma não.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.conta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  nome            text NOT NULL CHECK (length(btrim(nome)) >= 2),
  tipo            text NOT NULL
                    CHECK (tipo IN ('caixa', 'corrente', 'poupanca', 'investimento', 'cartao_credito', 'outro')),
  banco           text,
  agencia         text,
  numero          text,
  ativa           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id)
);
CREATE UNIQUE INDEX conta_nome_unico ON financeiro.conta (organizacao_id, lower(nome));
CREATE TRIGGER trg_conta_atualizado BEFORE UPDATE ON financeiro.conta
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_conta_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.conta
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- CATEGORIA — o plano de contas gerencial. O GRUPO é fixo (dominio/
-- demonstrativos.py) e decide a linha da DRE e a atividade do fluxo de caixa;
-- a categoria é da empresa, com subcategoria opcional (pai_id).
-- `sistema` marca as categorias que o próprio módulo usa (folha, juros,
-- empréstimo...): podem ser renomeadas, não apagadas nem trocadas de grupo.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.categoria (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id    uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  pai_id            uuid,
  grupo             text NOT NULL CHECK (grupo IN (
                      'receita_operacional', 'receita_financeira', 'outras_receitas',
                      'aporte_socio', 'captacao_emprestimo', 'venda_ativo',
                      'deducao_receita', 'custo_direto', 'despesa_pessoal',
                      'despesa_administrativa', 'despesa_comercial', 'despesa_financeira',
                      'outras_despesas', 'impostos_lucro', 'compra_ativo',
                      'amortizacao_emprestimo', 'retirada_socio')),
  natureza          text NOT NULL CHECK (natureza IN ('receita', 'despesa')),
  codigo            text CHECK (codigo IS NULL OR codigo ~ '^[0-9A-Za-z.\-]{1,20}$'),
  nome              text NOT NULL CHECK (length(btrim(nome)) >= 2),
  -- Fixo ou variável: é o que permite calcular o ponto de equilíbrio.
  comportamento     text NOT NULL DEFAULT 'variavel' CHECK (comportamento IN ('fixo', 'variavel')),
  sistema           text,
  ativa             boolean NOT NULL DEFAULT true,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  UNIQUE (organizacao_id, sistema),
  FOREIGN KEY (organizacao_id, pai_id) REFERENCES financeiro.categoria (organizacao_id, id),
  CONSTRAINT categoria_natureza_do_grupo CHECK (natureza = CASE
    WHEN grupo IN ('receita_operacional', 'receita_financeira', 'outras_receitas',
                   'aporte_socio', 'captacao_emprestimo', 'venda_ativo') THEN 'receita'
    ELSE 'despesa' END),
  CONSTRAINT categoria_nao_e_pai_de_si CHECK (pai_id IS NULL OR pai_id <> id)
);
CREATE UNIQUE INDEX categoria_codigo_unico ON financeiro.categoria (organizacao_id, codigo) WHERE codigo IS NOT NULL;
CREATE UNIQUE INDEX categoria_nome_unico ON financeiro.categoria (organizacao_id, grupo, lower(nome));
CREATE TRIGGER trg_categoria_atualizado BEFORE UPDATE ON financeiro.categoria
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_categoria_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.categoria
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- CENTRO_CUSTO — "de quem é este gasto": setor, unidade, projeto.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.centro_custo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  pai_id          uuid,
  codigo          text,
  nome            text NOT NULL CHECK (length(btrim(nome)) >= 2),
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, pai_id) REFERENCES financeiro.centro_custo (organizacao_id, id),
  CONSTRAINT centro_nao_e_pai_de_si CHECK (pai_id IS NULL OR pai_id <> id)
);
CREATE UNIQUE INDEX centro_custo_nome_unico ON financeiro.centro_custo (organizacao_id, lower(nome));
CREATE TRIGGER trg_centro_custo_atualizado BEFORE UPDATE ON financeiro.centro_custo
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_centro_custo_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.centro_custo
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- PESSOA — cliente, fornecedor, colaborador, sócio, banco: a outra ponta de
-- todo lançamento. `referencia_externa` liga ao cadastro do hospedeiro (no
-- MedSignal, o paciente cuja mensalidade a família paga).
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.pessoa (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id      uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  tipo                text NOT NULL CHECK (tipo IN ('fisica', 'juridica')),
  nome                text NOT NULL CHECK (length(btrim(nome)) >= 2),
  nome_fantasia       text,
  -- Só dígitos (CPF) ou o CNPJ alfanumérico de 2026; o dígito verificador é
  -- conferido em dominio/documentos.py.
  documento           text CHECK (documento IS NULL OR documento ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$'),
  email               text CHECK (email IS NULL OR position('@' in email) > 1),
  telefone            text,
  chave_pix           text,
  banco               text,
  agencia             text,
  conta_bancaria      text,
  endereco            text,
  cliente             boolean NOT NULL DEFAULT false,
  fornecedor          boolean NOT NULL DEFAULT false,
  referencia_externa  text,
  observacao          text,
  sistema             text,
  ativa               boolean NOT NULL DEFAULT true,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  UNIQUE (organizacao_id, sistema),
  CONSTRAINT pessoa_documento_do_tipo CHECK (
    documento IS NULL
    OR (tipo = 'fisica' AND length(documento) = 11)
    OR (tipo = 'juridica' AND length(documento) = 14))
);
CREATE UNIQUE INDEX pessoa_documento_unico ON financeiro.pessoa (organizacao_id, documento) WHERE documento IS NOT NULL;
CREATE UNIQUE INDEX pessoa_referencia_unica ON financeiro.pessoa (organizacao_id, referencia_externa)
  WHERE referencia_externa IS NOT NULL;
CREATE INDEX pessoa_por_nome ON financeiro.pessoa (organizacao_id, lower(nome));
CREATE TRIGGER trg_pessoa_atualizado BEFORE UPDATE ON financeiro.pessoa
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_pessoa_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.pessoa
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- FERIADO — os estaduais e municipais da empresa; os nacionais são calculados.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.feriado (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  data            date NOT NULL,
  nome            text NOT NULL CHECK (length(btrim(nome)) >= 2),
  UNIQUE (organizacao_id, data)
);
CREATE TRIGGER trg_feriado_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.feriado
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- TITULO — uma conta a pagar ou a receber: a nota, o boleto, a mensalidade.
-- Tem competência (o mês a que o valor pertence, para a DRE) e se divide em
-- parcelas (quando vence) e em rateio (em que categoria e centro de custo).
-- Não se apaga: cancela-se, com motivo.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.titulo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id      uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  tipo                text NOT NULL CHECK (tipo IN ('pagar', 'receber')),
  pessoa_id           uuid,
  descricao           text NOT NULL CHECK (length(btrim(descricao)) >= 2),
  documento           text,
  competencia         date NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
  data_emissao        date NOT NULL DEFAULT CURRENT_DATE,
  valor_total         numeric(15,2) NOT NULL CHECK (valor_total > 0),
  origem              text NOT NULL DEFAULT 'manual' CHECK (origem IN (
                        'manual', 'recorrencia', 'folha', 'emprestimo', 'capital',
                        'patrimonio', 'investimento', 'conciliacao', 'integracao')),
  origem_id           uuid,
  -- Chave de idempotência de quem gerou o título: gerar de novo não duplica.
  origem_chave        text,
  observacao          text,
  cancelado_em        timestamptz,
  motivo_cancelamento text,
  criado_por          text,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, pessoa_id) REFERENCES financeiro.pessoa (organizacao_id, id),
  CONSTRAINT titulo_cancelamento_coerente CHECK ((cancelado_em IS NULL) = (motivo_cancelamento IS NULL))
);
CREATE UNIQUE INDEX titulo_origem_unica ON financeiro.titulo (organizacao_id, origem_chave)
  WHERE origem_chave IS NOT NULL AND cancelado_em IS NULL;
CREATE INDEX titulo_por_competencia ON financeiro.titulo (organizacao_id, competencia) WHERE cancelado_em IS NULL;
CREATE INDEX titulo_por_pessoa ON financeiro.titulo (organizacao_id, pessoa_id);
CREATE INDEX titulo_por_origem ON financeiro.titulo (organizacao_id, origem, origem_id);
CREATE TRIGGER trg_titulo_atualizado BEFORE UPDATE ON financeiro.titulo
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_titulo_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.titulo
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- O resultado de um mês fechado não muda: nem título novo nele, nem mudança
-- de valor, competência ou cancelamento de título dele.
CREATE OR REPLACE FUNCTION financeiro.proteger_titulo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  limite date := financeiro.fechado_ate(COALESCE(NEW.organizacao_id, OLD.organizacao_id));
BEGIN
  IF limite IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' AND NEW.competencia <= limite THEN
    PERFORM financeiro.recusar_periodo_fechado(limite);
  ELSIF TG_OP = 'DELETE' AND OLD.competencia <= limite THEN
    PERFORM financeiro.recusar_periodo_fechado(limite);
  ELSIF TG_OP = 'UPDATE' AND (OLD.competencia <= limite OR NEW.competencia <= limite)
        AND (NEW.competencia, NEW.valor_total, NEW.tipo, NEW.cancelado_em)
            IS DISTINCT FROM (OLD.competencia, OLD.valor_total, OLD.tipo, OLD.cancelado_em) THEN
    PERFORM financeiro.recusar_periodo_fechado(limite);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_titulo_periodo BEFORE INSERT OR UPDATE OR DELETE ON financeiro.titulo
  FOR EACH ROW EXECUTE FUNCTION financeiro.proteger_titulo();

-- -----------------------------------------------------------------------------
-- PARCELA — quando e quanto vence. `valor_pago` é mantido pelo gatilho das
-- baixas; `status` é derivado, nunca escrito. "Vencida" não é status: depende
-- do dia de hoje, e é calculada na consulta.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.parcela (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  titulo_id       uuid NOT NULL,
  numero          smallint NOT NULL CHECK (numero >= 1),
  vencimento      date NOT NULL,
  valor           numeric(15,2) NOT NULL CHECK (valor > 0),
  valor_pago      numeric(15,2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0),
  cancelada       boolean NOT NULL DEFAULT false,
  status          text GENERATED ALWAYS AS (
                    CASE WHEN cancelada THEN 'cancelada'
                         WHEN valor_pago >= valor THEN 'paga'
                         WHEN valor_pago > 0 THEN 'parcial'
                         ELSE 'aberta' END) STORED,
  codigo_barras   text,
  UNIQUE (organizacao_id, id),
  UNIQUE (titulo_id, numero),
  FOREIGN KEY (organizacao_id, titulo_id) REFERENCES financeiro.titulo (organizacao_id, id) ON DELETE CASCADE,
  CONSTRAINT parcela_nao_paga_a_mais CHECK (valor_pago <= valor)
);
CREATE INDEX parcela_em_aberto ON financeiro.parcela (organizacao_id, vencimento) WHERE status IN ('aberta', 'parcial');
CREATE INDEX parcela_por_titulo ON financeiro.parcela (titulo_id);
CREATE TRIGGER trg_parcela_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.parcela
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- RATEIO — em que categoria e centro de custo o título cai. Um título de luz
-- pode ser 60% da unidade A e 40% da B; a DRE de cada uma vê só a sua parte.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.rateio (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id   uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  titulo_id        uuid NOT NULL,
  categoria_id     uuid NOT NULL,
  centro_custo_id  uuid,
  valor            numeric(15,2) NOT NULL CHECK (valor > 0),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, titulo_id) REFERENCES financeiro.titulo (organizacao_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organizacao_id, categoria_id) REFERENCES financeiro.categoria (organizacao_id, id),
  FOREIGN KEY (organizacao_id, centro_custo_id) REFERENCES financeiro.centro_custo (organizacao_id, id)
);
CREATE INDEX rateio_por_titulo ON financeiro.rateio (titulo_id);
CREATE INDEX rateio_por_categoria ON financeiro.rateio (organizacao_id, categoria_id);
CREATE TRIGGER trg_rateio_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.rateio
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

CREATE OR REPLACE FUNCTION financeiro.proteger_rateio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  org uuid := COALESCE(NEW.organizacao_id, OLD.organizacao_id);
  limite date := financeiro.fechado_ate(org);
  comp date;
BEGIN
  IF limite IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT competencia INTO comp FROM financeiro.titulo WHERE id = COALESCE(NEW.titulo_id, OLD.titulo_id);
  IF comp IS NOT NULL AND comp <= limite THEN
    PERFORM financeiro.recusar_periodo_fechado(limite);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_rateio_periodo BEFORE INSERT OR UPDATE OR DELETE ON financeiro.rateio
  FOR EACH ROW EXECUTE FUNCTION financeiro.proteger_rateio();

-- Parcelas e rateio fecham com o valor do título. Conferido no COMMIT
-- (DEFERRABLE): no meio da transação a soma pode estar incompleta, enquanto
-- as linhas ainda estão sendo gravadas.
CREATE OR REPLACE FUNCTION financeiro.conferir_somas_do_titulo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  t          uuid;
  total      numeric;
  parcelas   numeric;
  rateado    numeric;
BEGIN
  -- A mesma função serve às três tabelas; só o título não tem `titulo_id`.
  IF TG_TABLE_NAME = 'titulo' THEN
    t := COALESCE(NEW.id, OLD.id);
  ELSE
    t := COALESCE(NEW.titulo_id, OLD.titulo_id);
  END IF;
  SELECT valor_total INTO total FROM financeiro.titulo WHERE id = t;
  IF total IS NULL THEN
    RETURN NULL;  -- título removido junto (cascata)
  END IF;
  SELECT COALESCE(sum(valor), 0) INTO parcelas FROM financeiro.parcela WHERE titulo_id = t;
  SELECT COALESCE(sum(valor), 0) INTO rateado FROM financeiro.rateio WHERE titulo_id = t;
  IF parcelas <> total THEN
    RAISE EXCEPTION 'As parcelas somam R$ % e o título vale R$ %.', parcelas, total
      USING ERRCODE = 'P0001', HINT = 'parcelas_nao_fecham';
  END IF;
  IF rateado <> total THEN
    RAISE EXCEPTION 'O rateio soma R$ % e o título vale R$ %.', rateado, total
      USING ERRCODE = 'P0001', HINT = 'rateio_nao_fecha';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_titulo_somas AFTER INSERT OR UPDATE OF valor_total ON financeiro.titulo
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION financeiro.conferir_somas_do_titulo();
CREATE CONSTRAINT TRIGGER trg_parcela_somas AFTER INSERT OR UPDATE OF valor OR DELETE ON financeiro.parcela
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION financeiro.conferir_somas_do_titulo();
CREATE CONSTRAINT TRIGGER trg_rateio_somas AFTER INSERT OR UPDATE OF valor OR DELETE ON financeiro.rateio
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION financeiro.conferir_somas_do_titulo();

-- -----------------------------------------------------------------------------
-- BAIXA — o pagamento (ou recebimento) de uma parcela, total ou parcial.
-- `valor` é quanto da parcela esta baixa quita; o que sai do caixa é
-- valor + juros + multa − desconto. Não se edita nem se apaga: estorna-se.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.baixa (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  parcela_id      uuid NOT NULL,
  conta_id        uuid NOT NULL,
  data            date NOT NULL,
  valor           numeric(15,2) NOT NULL CHECK (valor > 0),
  juros           numeric(15,2) NOT NULL DEFAULT 0 CHECK (juros >= 0),
  multa           numeric(15,2) NOT NULL DEFAULT 0 CHECK (multa >= 0),
  desconto        numeric(15,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  forma           text NOT NULL DEFAULT 'pix' CHECK (forma IN (
                    'pix', 'boleto', 'dinheiro', 'cartao_credito', 'cartao_debito',
                    'transferencia', 'debito_automatico', 'cheque', 'outro')),
  observacao      text,
  estornada_em    timestamptz,
  motivo_estorno  text,
  criado_por      text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, parcela_id) REFERENCES financeiro.parcela (organizacao_id, id),
  FOREIGN KEY (organizacao_id, conta_id) REFERENCES financeiro.conta (organizacao_id, id),
  CONSTRAINT baixa_efetiva_positiva CHECK (valor + juros + multa - desconto > 0),
  CONSTRAINT baixa_estorno_coerente CHECK ((estornada_em IS NULL) = (motivo_estorno IS NULL))
);
CREATE INDEX baixa_por_parcela ON financeiro.baixa (parcela_id);
CREATE INDEX baixa_por_data ON financeiro.baixa (organizacao_id, data);
CREATE TRIGGER trg_baixa_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.baixa
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

CREATE OR REPLACE FUNCTION financeiro.atualizar_valor_pago() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE financeiro.parcela p
     SET valor_pago = COALESCE((SELECT sum(b.valor) FROM financeiro.baixa b
                                 WHERE b.parcela_id = p.id AND b.estornada_em IS NULL), 0)
   WHERE p.id = COALESCE(NEW.parcela_id, OLD.parcela_id);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_baixa_valor_pago AFTER INSERT OR UPDATE OR DELETE ON financeiro.baixa
  FOR EACH ROW EXECUTE FUNCTION financeiro.atualizar_valor_pago();

-- Baixa com data em período fechado não entra nem muda de valor. O estorno
-- continua possível: ele não reescreve o passado, lança um movimento de volta
-- na data de hoje (ver movimento).
CREATE OR REPLACE FUNCTION financeiro.proteger_baixa() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  limite date := financeiro.fechado_ate(COALESCE(NEW.organizacao_id, OLD.organizacao_id));
BEGIN
  IF limite IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' AND NEW.data <= limite THEN
    PERFORM financeiro.recusar_periodo_fechado(limite);
  ELSIF TG_OP = 'DELETE' AND OLD.data <= limite THEN
    PERFORM financeiro.recusar_periodo_fechado(limite);
  ELSIF TG_OP = 'UPDATE' AND (OLD.data <= limite OR NEW.data <= limite)
        AND (NEW.data, NEW.valor, NEW.juros, NEW.multa, NEW.desconto, NEW.conta_id, NEW.parcela_id)
            IS DISTINCT FROM (OLD.data, OLD.valor, OLD.juros, OLD.multa, OLD.desconto, OLD.conta_id, OLD.parcela_id) THEN
    PERFORM financeiro.recusar_periodo_fechado(limite);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_baixa_periodo BEFORE INSERT OR UPDATE OR DELETE ON financeiro.baixa
  FOR EACH ROW EXECUTE FUNCTION financeiro.proteger_baixa();

-- -----------------------------------------------------------------------------
-- MOVIMENTO — o livro-caixa: toda entrada e saída de cada conta, com sinal.
-- O saldo de uma conta numa data é a soma dos movimentos até ela.
--   saldo_inicial  o saldo no dia em que a conta passou a ser controlada aqui
--   baixa/estorno  o dinheiro de um pagamento, e a devolução dele
--   transferencia  duas pernas (sai de uma conta, entra na outra), mesmo id
--   ajuste         correção de saldo sem categoria (fora da DRE)
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.movimento (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id    uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  conta_id          uuid NOT NULL,
  data              date NOT NULL,
  valor             numeric(15,2) NOT NULL CHECK (valor <> 0),
  tipo              text NOT NULL CHECK (tipo IN ('saldo_inicial', 'baixa', 'estorno', 'transferencia', 'ajuste')),
  descricao         text NOT NULL,
  baixa_id          uuid,
  transferencia_id  uuid,
  -- Nas pernas de um estorno de transferência: qual transferência ele desfaz.
  estorno_de        uuid,
  criado_por        text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, conta_id) REFERENCES financeiro.conta (organizacao_id, id),
  FOREIGN KEY (organizacao_id, baixa_id) REFERENCES financeiro.baixa (organizacao_id, id),
  CONSTRAINT movimento_estorno_e_transferencia CHECK (estorno_de IS NULL OR tipo = 'transferencia'),
  CONSTRAINT movimento_origem_coerente CHECK (
    (tipo IN ('baixa', 'estorno') AND baixa_id IS NOT NULL AND transferencia_id IS NULL)
    OR (tipo = 'transferencia' AND transferencia_id IS NOT NULL AND baixa_id IS NULL)
    OR (tipo IN ('saldo_inicial', 'ajuste') AND baixa_id IS NULL AND transferencia_id IS NULL))
);
CREATE INDEX movimento_extrato ON financeiro.movimento (organizacao_id, conta_id, data);
CREATE INDEX movimento_por_baixa ON financeiro.movimento (baixa_id) WHERE baixa_id IS NOT NULL;
CREATE INDEX movimento_por_transferencia ON financeiro.movimento (transferencia_id) WHERE transferencia_id IS NOT NULL;
CREATE UNIQUE INDEX movimento_um_saldo_inicial ON financeiro.movimento (conta_id) WHERE tipo = 'saldo_inicial';
CREATE UNIQUE INDEX movimento_uma_perna_por_baixa ON financeiro.movimento (baixa_id, tipo) WHERE baixa_id IS NOT NULL;
-- Uma transferência se estorna uma vez só (uma perna por conta).
CREATE UNIQUE INDEX movimento_estorno_unico ON financeiro.movimento (estorno_de, conta_id) WHERE estorno_de IS NOT NULL;
CREATE TRIGGER trg_movimento_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.movimento
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

CREATE OR REPLACE FUNCTION financeiro.proteger_movimento() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  limite date := financeiro.fechado_ate(COALESCE(NEW.organizacao_id, OLD.organizacao_id));
BEGIN
  IF limite IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' AND NEW.data <= limite THEN
    PERFORM financeiro.recusar_periodo_fechado(limite);
  ELSIF TG_OP = 'DELETE' AND OLD.data <= limite THEN
    PERFORM financeiro.recusar_periodo_fechado(limite);
  ELSIF TG_OP = 'UPDATE' AND (OLD.data <= limite OR NEW.data <= limite)
        AND (NEW.data, NEW.valor, NEW.conta_id, NEW.tipo)
            IS DISTINCT FROM (OLD.data, OLD.valor, OLD.conta_id, OLD.tipo) THEN
    PERFORM financeiro.recusar_periodo_fechado(limite);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_movimento_periodo BEFORE INSERT OR UPDATE OR DELETE ON financeiro.movimento
  FOR EACH ROW EXECUTE FUNCTION financeiro.proteger_movimento();

-- -----------------------------------------------------------------------------
-- RECORRENCIA — o molde de uma conta que se repete. As ocorrências viram
-- títulos (origem 'recorrencia', chave 'rec:<id>:<vencimento>') conforme o
-- tempo passa; `gerado_ate` diz até onde já foi gerado.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.recorrencia (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id   uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('pagar', 'receber')),
  pessoa_id        uuid,
  descricao        text NOT NULL CHECK (length(btrim(descricao)) >= 2),
  valor            numeric(15,2) NOT NULL CHECK (valor > 0),
  categoria_id     uuid NOT NULL,
  centro_custo_id  uuid,
  frequencia       text NOT NULL CHECK (frequencia IN
                     ('semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual')),
  dia_vencimento   smallint CHECK (dia_vencimento BETWEEN 1 AND 31),
  inicio           date NOT NULL,
  fim              date,
  gerado_ate       date,
  ativa            boolean NOT NULL DEFAULT true,
  criado_por       text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, pessoa_id) REFERENCES financeiro.pessoa (organizacao_id, id),
  FOREIGN KEY (organizacao_id, categoria_id) REFERENCES financeiro.categoria (organizacao_id, id),
  FOREIGN KEY (organizacao_id, centro_custo_id) REFERENCES financeiro.centro_custo (organizacao_id, id),
  CONSTRAINT recorrencia_periodo_valido CHECK (fim IS NULL OR fim >= inicio)
);
CREATE TRIGGER trg_recorrencia_atualizado BEFORE UPDATE ON financeiro.recorrencia
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_recorrencia_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.recorrencia
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();
