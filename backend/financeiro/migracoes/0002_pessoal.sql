-- =============================================================================
--  Módulo financeiro — 0002: pessoal (colaboradores e folha)
--
--  Colaborador, rubricas (eventos da folha), itens fixos por colaborador,
--  tabelas de INSS e IRRF versionadas por vigência, folhas e holerites.
--
--  Salário é dado pessoal (LGPD): no hospedeiro, a permissão de ver esta parte
--  é separada da do financeiro do dia a dia (recurso `pessoal`).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- COLABORADOR — quem trabalha para a empresa. É sempre uma PESSOA (física)
-- do cadastro: o pagamento dele é conta a pagar como qualquer outra.
-- Vínculos 'pj' e 'autonomo' não entram na folha — são pagos por conta a
-- pagar —, mas ficam aqui para o custo de pessoal enxergar todo mundo.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.colaborador (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id      uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  pessoa_id           uuid NOT NULL,
  matricula           text,
  cargo               text,
  centro_custo_id     uuid,
  vinculo             text NOT NULL CHECK (vinculo IN ('clt', 'aprendiz', 'estagio', 'prolabore', 'pj', 'autonomo')),
  data_admissao       date NOT NULL,
  data_desligamento   date,
  salario_base        numeric(15,2) NOT NULL CHECK (salario_base >= 0),
  horas_mes           numeric(6,2) NOT NULL DEFAULT 220 CHECK (horas_mes > 0),
  dependentes_irrf    smallint NOT NULL DEFAULT 0 CHECK (dependentes_irrf BETWEEN 0 AND 30),
  referencia_externa  text,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  UNIQUE (organizacao_id, pessoa_id),
  FOREIGN KEY (organizacao_id, pessoa_id) REFERENCES financeiro.pessoa (organizacao_id, id),
  FOREIGN KEY (organizacao_id, centro_custo_id) REFERENCES financeiro.centro_custo (organizacao_id, id),
  CONSTRAINT colaborador_desligamento_valido CHECK (data_desligamento IS NULL OR data_desligamento >= data_admissao)
);
CREATE UNIQUE INDEX colaborador_matricula_unica ON financeiro.colaborador (organizacao_id, matricula)
  WHERE matricula IS NOT NULL;
CREATE TRIGGER trg_colaborador_atualizado BEFORE UPDATE ON financeiro.colaborador
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_colaborador_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.colaborador
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- RUBRICA — evento da folha e em que ele incide (ver dominio/folha.py).
-- `calculo` diz como o valor sai da referência: valor informado, % do
-- salário, horas × valor da hora × %, ou dias × salário/30.
-- `credor_id`: a quem o desconto é repassado (banco do consignado, sindicato).
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.rubrica (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  codigo          text NOT NULL CHECK (codigo ~ '^[0-9A-Za-z._-]{1,12}$'),
  nome            text NOT NULL CHECK (length(btrim(nome)) >= 2),
  tipo            text NOT NULL CHECK (tipo IN ('provento', 'desconto', 'informativo')),
  calculo         text NOT NULL DEFAULT 'valor'
                    CHECK (calculo IN ('valor', 'percentual_salario', 'horas', 'dias', 'sistema')),
  percentual      numeric(8,4) CHECK (percentual IS NULL OR percentual >= 0),
  incide_inss     boolean NOT NULL DEFAULT false,
  incide_irrf     boolean NOT NULL DEFAULT false,
  incide_fgts     boolean NOT NULL DEFAULT false,
  deduz_irrf      boolean NOT NULL DEFAULT false,
  entra_dsr       boolean NOT NULL DEFAULT false,
  credor_id       uuid,
  sistema         text,
  ativa           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  UNIQUE (organizacao_id, codigo),
  UNIQUE (organizacao_id, sistema),
  FOREIGN KEY (organizacao_id, credor_id) REFERENCES financeiro.pessoa (organizacao_id, id),
  CONSTRAINT rubrica_sistema_calcula_sozinha CHECK ((calculo = 'sistema') = (sistema IS NOT NULL)),
  CONSTRAINT rubrica_deducao_e_desconto CHECK (NOT deduz_irrf OR tipo = 'desconto')
);
CREATE TRIGGER trg_rubrica_atualizado BEFORE UPDATE ON financeiro.rubrica
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_rubrica_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.rubrica
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- COLABORADOR_RUBRICA — o que entra todo mês para aquele colaborador:
-- vale-transporte (com o custo do vale como limite), plano de saúde,
-- pensão (com o beneficiário como credor), consignado.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.colaborador_rubrica (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  colaborador_id  uuid NOT NULL,
  rubrica_id      uuid NOT NULL,
  referencia      numeric(12,4),
  valor           numeric(15,2) CHECK (valor IS NULL OR valor >= 0),
  limite          numeric(15,2) CHECK (limite IS NULL OR limite >= 0),
  credor_id       uuid,
  inicio          date NOT NULL DEFAULT CURRENT_DATE,
  fim             date,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, colaborador_id) REFERENCES financeiro.colaborador (organizacao_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organizacao_id, rubrica_id) REFERENCES financeiro.rubrica (organizacao_id, id),
  FOREIGN KEY (organizacao_id, credor_id) REFERENCES financeiro.pessoa (organizacao_id, id),
  CONSTRAINT colaborador_rubrica_periodo CHECK (fim IS NULL OR fim >= inicio)
);
CREATE INDEX colaborador_rubrica_por_colaborador ON financeiro.colaborador_rubrica (colaborador_id);
CREATE TRIGGER trg_colaborador_rubrica_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.colaborador_rubrica
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- TABELA_FISCAL — INSS e IRRF por vigência. Imposto é dado, não código.
-- organizacao_id NULL: tabela oficial, vale para todas as empresas. Uma
-- empresa pode gravar a sua (mesmo tipo e vigência) e ela prevalece.
-- `fonte` é obrigatória: número de tabela sem a norma que o publicou é
-- número que ninguém consegue conferir.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.tabela_fiscal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('inss', 'irrf')),
  vigencia        date NOT NULL,
  dados           jsonb NOT NULL,
  fonte           text NOT NULL CHECK (length(btrim(fonte)) >= 5),
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tabela_fiscal_unica ON financeiro.tabela_fiscal
  (COALESCE(organizacao_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo, vigencia);
CREATE TRIGGER trg_tabela_fiscal_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.tabela_fiscal
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- Conferidas em 26/09/2026 nas fontes oficiais citadas.
INSERT INTO financeiro.tabela_fiscal (organizacao_id, tipo, vigencia, fonte, dados) VALUES
(NULL, 'inss', DATE '2026-01-01',
 'Portaria Interministerial MPS/MF nº 13, de 9 de janeiro de 2026',
 '{"faixas": [
     {"ate": "1621.00", "aliquota": "7.5"},
     {"ate": "2902.84", "aliquota": "9"},
     {"ate": "4354.27", "aliquota": "12"},
     {"ate": "8475.55", "aliquota": "14"}],
   "aliquota_contribuinte_individual": "11"}'::jsonb),
(NULL, 'irrf', DATE '2026-01-01',
 'Lei nº 15.191/2025 (tabela progressiva) e Lei nº 15.270/2025 (redução); Receita Federal, Tributação de 2026',
 '{"faixas": [
     {"ate": "2428.80", "aliquota": "0", "deducao": "0"},
     {"ate": "2826.65", "aliquota": "7.5", "deducao": "182.16"},
     {"ate": "3751.05", "aliquota": "15", "deducao": "394.16"},
     {"ate": "4664.68", "aliquota": "22.5", "deducao": "675.49"},
     {"ate": null, "aliquota": "27.5", "deducao": "908.73"}],
   "deducao_dependente": "189.59",
   "desconto_simplificado": "607.20",
   "reducoes": [
     {"ate": "5000.00", "tipo": "fixa", "valor": "312.89"},
     {"ate": "7350.00", "tipo": "linear", "a": "978.62", "b": "0.133145"}],
   "dispensa_retencao_ate": "10.00"}'::jsonb);

-- -----------------------------------------------------------------------------
-- FOLHA — uma folha por competência e tipo. Fluxo: rascunho -> calculada ->
-- fechada. Fechar gera as contas a pagar; reabrir as cancela (só se nenhuma
-- foi paga). Folha fechada não recalcula.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.folha (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  competencia     date NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),
  tipo            text NOT NULL CHECK (tipo IN ('mensal', 'adiantamento')),
  status          text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'calculada', 'fechada')),
  data_pagamento  date NOT NULL,
  calculada_em    timestamptz,
  fechada_em      timestamptz,
  fechada_por     text,
  observacao      text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  UNIQUE (organizacao_id, competencia, tipo),
  CONSTRAINT folha_fechamento_coerente CHECK ((status = 'fechada') = (fechada_em IS NOT NULL))
);
CREATE TRIGGER trg_folha_atualizado BEFORE UPDATE ON financeiro.folha
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();
CREATE TRIGGER trg_folha_auditoria AFTER INSERT OR UPDATE OR DELETE ON financeiro.folha
  FOR EACH ROW EXECUTE FUNCTION financeiro.auditar();

-- -----------------------------------------------------------------------------
-- HOLERITE — o resultado de um colaborador numa folha. Vínculo, salário e
-- centro de custo são copiados no cálculo: o holerite de março continua
-- dizendo o que foi pago em março mesmo depois de um aumento em abril.
-- `ajuste`: os valores que a contabilidade informou e que prevalecem sobre
-- o cálculo; `calculado`: o que o módulo tinha calculado, para a diferença.
-- -----------------------------------------------------------------------------
CREATE TABLE financeiro.holerite (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id      uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  folha_id            uuid NOT NULL,
  colaborador_id      uuid NOT NULL,
  vinculo             text NOT NULL,
  salario_base        numeric(15,2) NOT NULL DEFAULT 0,
  centro_custo_id     uuid,
  dias_trabalhados    smallint NOT NULL DEFAULT 30,
  total_proventos     numeric(15,2) NOT NULL DEFAULT 0,
  total_descontos     numeric(15,2) NOT NULL DEFAULT 0,
  liquido             numeric(15,2) NOT NULL DEFAULT 0,
  base_inss           numeric(15,2) NOT NULL DEFAULT 0,
  inss                numeric(15,2) NOT NULL DEFAULT 0,
  base_irrf           numeric(15,2) NOT NULL DEFAULT 0,
  irrf                numeric(15,2) NOT NULL DEFAULT 0,
  base_fgts           numeric(15,2) NOT NULL DEFAULT 0,
  fgts                numeric(15,2) NOT NULL DEFAULT 0,
  encargos_patronais  numeric(15,2) NOT NULL DEFAULT 0,
  beneficios          numeric(15,2) NOT NULL DEFAULT 0,
  custo_total         numeric(15,2) NOT NULL DEFAULT 0,
  detalhe_irrf        jsonb,
  avisos              text[] NOT NULL DEFAULT '{}',
  ajuste              jsonb,
  calculado           jsonb,
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  UNIQUE (folha_id, colaborador_id),
  FOREIGN KEY (organizacao_id, folha_id) REFERENCES financeiro.folha (organizacao_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organizacao_id, colaborador_id) REFERENCES financeiro.colaborador (organizacao_id, id),
  FOREIGN KEY (organizacao_id, centro_custo_id) REFERENCES financeiro.centro_custo (organizacao_id, id)
);
CREATE TRIGGER trg_holerite_atualizado BEFORE UPDATE ON financeiro.holerite
  FOR EACH ROW EXECUTE FUNCTION financeiro.tocar_atualizado_em();

-- Itens do holerite. Os 'lancado' (hora extra do mês, falta...) são digitados
-- e sobrevivem ao recálculo; os demais o cálculo apaga e refaz.
CREATE TABLE financeiro.holerite_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id  uuid NOT NULL REFERENCES financeiro.organizacao(id) ON DELETE CASCADE,
  holerite_id     uuid NOT NULL,
  rubrica_id      uuid NOT NULL,
  referencia      numeric(12,4),
  valor           numeric(15,2) NOT NULL CHECK (valor >= 0),
  origem          text NOT NULL CHECK (origem IN ('calculado', 'fixo', 'lancado', 'adiantamento', 'ajuste')),
  credor_id       uuid,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organizacao_id, id),
  FOREIGN KEY (organizacao_id, holerite_id) REFERENCES financeiro.holerite (organizacao_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organizacao_id, rubrica_id) REFERENCES financeiro.rubrica (organizacao_id, id),
  FOREIGN KEY (organizacao_id, credor_id) REFERENCES financeiro.pessoa (organizacao_id, id)
);
CREATE INDEX holerite_item_por_holerite ON financeiro.holerite_item (holerite_id);
