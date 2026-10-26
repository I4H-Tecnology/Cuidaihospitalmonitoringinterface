-- =============================================================================
--  Migração incremental: App Paciente, Compras e Contratos (25/10/2026).
--
--  1. `acompanhante.ultimo_acesso_em`: o portal da família registra o último
--     uso, e a tela App Paciente mostra.
--  2. Tabelas `contrato`, `pedido_compra` e `item_pedido_compra`.
--  3. Módulos `purchases` e `contracts` em TODO perfil que ainda não os tem
--     (o global e as cópias por clínica), com o mesmo padrão de
--     db/init/02_perfis.sql. Perfil que já tem o módulo fica como está.
--
--  Aditiva e idempotente. Volume novo não precisa: db/init já traz tudo.
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -f /scripts/2026-10-25-app-paciente-compras-contratos.sql
-- =============================================================================

ALTER TABLE acompanhante ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamptz;

-- -----------------------------------------------------------------------------
-- 16. CONTRATO — contrato da clínica com fornecedor ou prestador (manutenção
--     das câmeras, lavanderia, nutrição, software). Entrou em 25/10/2026 com a
--     tela Administração → Contratos. O status (vigente, vencendo, vencido)
--     não é coluna: sai das datas na consulta, para nunca ficar desatualizado.
--     Encerra-se (encerrado_em + motivo), não se apaga.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contrato (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id            uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  -- Número do contrato no papel, quando houver. Opcional e livre.
  numero                text,
  objeto                text NOT NULL CHECK (length(btrim(objeto)) >= 3),
  fornecedor            text NOT NULL CHECK (length(btrim(fornecedor)) >= 2),
  -- CNPJ ou CPF, só dígitos.
  fornecedor_documento  text CHECK (fornecedor_documento ~ '^([0-9]{11}|[0-9]{14})$'),
  categoria             text NOT NULL
                          CHECK (categoria IN ('servico', 'manutencao', 'locacao', 'fornecimento', 'software', 'outro')),
  valor_mensal          numeric(12,2) CHECK (valor_mensal >= 0),
  inicio                date NOT NULL,
  -- NULL = prazo indeterminado.
  fim                   date,
  renovacao_automatica  boolean NOT NULL DEFAULT false,
  -- Antecedência para decidir renovar ou não; a tela avisa a partir daí.
  aviso_previo_dias     integer NOT NULL DEFAULT 30 CHECK (aviso_previo_dias BETWEEN 0 AND 365),
  responsavel           text,
  observacoes           text,
  encerrado_em          timestamptz,
  motivo_encerramento   text,
  criado_por            uuid REFERENCES usuario(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contrato_periodo CHECK (fim IS NULL OR fim >= inicio),
  CONSTRAINT contrato_encerramento_coerente CHECK ((encerrado_em IS NULL) = (motivo_encerramento IS NULL))
);
DROP TRIGGER IF EXISTS trg_contrato_updated ON contrato;
CREATE TRIGGER trg_contrato_updated BEFORE UPDATE ON contrato
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS contrato_por_clinica ON contrato (clinica_id, fim);

COMMENT ON TABLE contrato IS
  'Contrato com fornecedor. Status derivado das datas; encerra-se, não se apaga.';


-- -----------------------------------------------------------------------------
-- 17. PEDIDO_COMPRA e ITEM_PEDIDO_COMPRA — pedido de compra da clínica, da
--     solicitação ao recebimento. Mesma data e motivo do contrato. Cada passo
--     guarda quem e quando: quem pediu não aprova o próprio pedido (a API
--     recusa), e a trilha mostra isso sem precisar de log à parte.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_compra (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id           uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  -- Sequencial por clínica, para a equipe falar "pedido 12".
  numero               integer NOT NULL,
  titulo               text NOT NULL CHECK (length(btrim(titulo)) >= 3),
  justificativa        text,
  urgente              boolean NOT NULL DEFAULT false,
  status               text NOT NULL DEFAULT 'solicitado'
                         CHECK (status IN ('solicitado', 'aprovado', 'recusado', 'comprado', 'recebido', 'cancelado')),
  fornecedor           text,
  contrato_id          uuid REFERENCES contrato(id) ON DELETE SET NULL,
  -- Valor efetivamente pago, informado ao registrar a compra.
  valor_final          numeric(12,2) CHECK (valor_final >= 0),
  solicitante_id       uuid NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  decidido_por         uuid REFERENCES usuario(id) ON DELETE SET NULL,
  decidido_em          timestamptz,
  motivo_recusa        text,
  comprado_por         uuid REFERENCES usuario(id) ON DELETE SET NULL,
  comprado_em          timestamptz,
  recebido_por         uuid REFERENCES usuario(id) ON DELETE SET NULL,
  recebido_em          timestamptz,
  cancelado_por        uuid REFERENCES usuario(id) ON DELETE SET NULL,
  cancelado_em         timestamptz,
  motivo_cancelamento  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, numero),
  CONSTRAINT pedido_recusa_coerente CHECK (status <> 'recusado' OR motivo_recusa IS NOT NULL),
  CONSTRAINT pedido_cancelamento_coerente CHECK (status <> 'cancelado' OR motivo_cancelamento IS NOT NULL)
);
DROP TRIGGER IF EXISTS trg_pedido_compra_updated ON pedido_compra;
CREATE TRIGGER trg_pedido_compra_updated BEFORE UPDATE ON pedido_compra
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS pedido_compra_por_clinica ON pedido_compra (clinica_id, created_at DESC);

CREATE TABLE IF NOT EXISTS item_pedido_compra (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       uuid NOT NULL REFERENCES pedido_compra(id) ON DELETE CASCADE,
  descricao       text NOT NULL CHECK (length(btrim(descricao)) >= 2),
  quantidade      numeric(12,3) NOT NULL CHECK (quantidade > 0),
  unidade         text NOT NULL DEFAULT 'un',
  -- Estimado na solicitação; opcional (quem pede nem sempre sabe o preço).
  valor_unitario  numeric(12,2) CHECK (valor_unitario >= 0),
  ordem           smallint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS item_por_pedido ON item_pedido_compra (pedido_id, ordem);

COMMENT ON TABLE pedido_compra IS
  'Pedido de compra: solicitado → aprovado/recusado → comprado → recebido (ou cancelado).';


WITH padrao(perfil, modulo, ver, criar, editar, excluir) AS (
  VALUES
    ('ADMIN',   'purchases', true,  true,  true,  true),
    ('ADMIN',   'contracts', true,  true,  true,  true),
    ('MANAGER', 'purchases', true,  true,  true,  false),
    ('MANAGER', 'contracts', true,  false, false, false),
    ('NURSE',   'purchases', true,  true,  false, false)
),
modulos(nome) AS (VALUES ('purchases'), ('contracts')),
acrescimos AS (
  SELECT p.id,
         jsonb_object_agg(
           m.nome,
           jsonb_build_object(
             'view',   COALESCE(d.ver, false),
             'create', COALESCE(d.criar, false),
             'edit',   COALESCE(d.editar, false),
             'delete', COALESCE(d.excluir, false),
             'web',    COALESCE(d.ver, false),
             'app',    COALESCE(d.ver, false) AND upper(p.nome) = 'NURSE'
           )
         ) AS novos
    FROM perfil p
    CROSS JOIN modulos m
    LEFT JOIN padrao d ON upper(d.perfil) = upper(p.nome) AND d.modulo = m.nome
   WHERE NOT (p.permissoes ? m.nome)
   GROUP BY p.id
)
UPDATE perfil p
   SET permissoes = a.novos || p.permissoes
  FROM acrescimos a
 WHERE a.id = p.id;

-- Confere: quem vê compras e contratos.
SELECT p.nome AS perfil,
       COALESCE(c.slug, '(global)') AS clinica,
       (p.permissoes -> 'purchases' ->> 'view')::boolean AS compras,
       (p.permissoes -> 'purchases' ->> 'edit')::boolean AS aprova_compra,
       (p.permissoes -> 'contracts' ->> 'view')::boolean AS contratos
  FROM perfil p
  LEFT JOIN clinica c ON c.id = p.clinica_id
 ORDER BY clinica, perfil;
