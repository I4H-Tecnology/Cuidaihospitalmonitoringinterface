-- =============================================================================
--  MedSignal — esquema relacional
--
--  Implementa as 12 entidades do DER da RFC (seção 5.2) e codifica as regras de
--  negócio da seção 2.5 como constraints, para que o banco recuse dado inválido
--  mesmo que a aplicação esqueça de validar.
--
--  Referência de cada regra fica no comentário como RNxx.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- Toda tabela com updated_at usa este gatilho.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- 1. CLINICA — o tenant. Tudo abaixo é escopado por ela.
-- -----------------------------------------------------------------------------
CREATE TABLE clinica (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificador que o frontend já usa na URL e no seletor de clínica.
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  nome        text NOT NULL,
  cnpj        char(14) UNIQUE CHECK (cnpj ~ '^[0-9]{14}$'),
  endereco    text,
  -- Contato da clínica, editável em Configurações. Em banco já existente,
  -- aplicar db/scripts/2026-09-13-clinica-contato.sql em vez de recriar.
  telefone    text,
  email       text CONSTRAINT clinica_email_valido CHECK (email IS NULL OR position('@' in email) > 1),
  ativa       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_clinica_updated BEFORE UPDATE ON clinica
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN clinica.slug IS 'Tenant usado pelo frontend (ex.: clinicasaojose)';


-- -----------------------------------------------------------------------------
-- 2. PERFIL — RBAC. Permissões em JSONB: módulo -> ações liberadas.
-- -----------------------------------------------------------------------------
CREATE TABLE perfil (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id  uuid REFERENCES clinica(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  descricao   text,
  -- NULL em clinica_id = perfil global do sistema, disponível para toda clínica.
  permissoes  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- Índice único que trata NULL como valor: evita dois perfis globais com o mesmo nome.
CREATE UNIQUE INDEX perfil_nome_por_clinica
  ON perfil (COALESCE(clinica_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));
CREATE TRIGGER trg_perfil_updated BEFORE UPDATE ON perfil
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- 3. USUARIO — profissional do sistema. RN01: só autenticado acessa.
-- -----------------------------------------------------------------------------
CREATE TABLE usuario (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id          uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  perfil_id           uuid NOT NULL REFERENCES perfil(id) ON DELETE RESTRICT,
  nome                text NOT NULL,
  email               text NOT NULL CHECK (position('@' in email) > 1),
  login               text NOT NULL,
  -- Hash real (bcrypt/argon2) gerado pelo backend. NUNCA guardar senha reversível.
  senha_hash          text NOT NULL,
  status              text NOT NULL DEFAULT 'ativo'
                        CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
  tentativas_falhas   smallint NOT NULL DEFAULT 0 CHECK (tentativas_falhas >= 0),
  bloqueado_ate       timestamptz,
  senha_alterada_em   timestamptz,
  ultimo_acesso       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_usuario_updated BEFORE UPDATE ON usuario
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- E-mail e login são únicos DENTRO da clínica, não globalmente: duas clínicas
-- podem ter um "admin" cada uma. Case-insensitive, senão "Ana@" e "ana@" coexistem.
CREATE UNIQUE INDEX usuario_email_por_clinica ON usuario (clinica_id, lower(email));
CREATE UNIQUE INDEX usuario_login_por_clinica ON usuario (clinica_id, lower(login));


-- -----------------------------------------------------------------------------
-- 4. AMBIENTE — local monitorado (quarto, corredor, sala de convivência).
-- -----------------------------------------------------------------------------
CREATE TABLE ambiente (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id  uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  tipo        text NOT NULL DEFAULT 'quarto'
                CHECK (tipo IN ('quarto', 'corredor', 'sala_convivencia', 'refeitorio', 'banheiro', 'outro')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, nome)
);
CREATE TRIGGER trg_ambiente_updated BEFORE UPDATE ON ambiente
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- 5. CAMERA — dispositivo de captura. RN15: câmera offline é sinalizada.
-- -----------------------------------------------------------------------------
CREATE TABLE camera (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambiente_id    uuid NOT NULL REFERENCES ambiente(id) ON DELETE CASCADE,
  identificador  text NOT NULL,
  url_stream     text NOT NULL,
  status         text NOT NULL DEFAULT 'offline'
                   CHECK (status IN ('online', 'offline', 'manutencao')),
  ultimo_ping    timestamptz,
  visao_url      text CONSTRAINT camera_visao_url_http
                   CHECK (visao_url IS NULL OR visao_url ~ '^https?://'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ambiente_id, identificador)
);
CREATE TRIGGER trg_camera_updated BEFORE UPDATE ON camera
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN camera.url_stream IS 'RTSP/HTTP da câmera IP. Credencial fica em cofre, não aqui.';
COMMENT ON COLUMN camera.visao_url IS 'Processo do serviço de visão que analisa esta câmera (/stream, /estado). Nulo = serviço padrão do painel.';


-- -----------------------------------------------------------------------------
-- 6. PACIENTE — idoso monitorado.
-- -----------------------------------------------------------------------------
CREATE TABLE paciente (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id      uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  ambiente_id     uuid REFERENCES ambiente(id) ON DELETE SET NULL,
  nome            text NOT NULL,
  data_nascimento date,
  status          text NOT NULL DEFAULT 'internado'
                    CHECK (status IN ('internado', 'alta', 'transferido')),
  data_admissao   date NOT NULL DEFAULT CURRENT_DATE,
  data_alta       date,
  -- Quadro clínico da admissão (13/09/2026, além do MVP da RFC; errata pendente).
  -- Em banco existente: db/scripts/2026-09-13-prontuario-admissao.sql.
  historico_medico    text,
  medico_responsavel  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Alta sem data, ou data de alta anterior à admissão, é dado inconsistente.
  CONSTRAINT paciente_alta_coerente CHECK (
    (status <> 'internado' AND data_alta IS NOT NULL AND data_alta >= data_admissao)
    OR (status = 'internado' AND data_alta IS NULL)
  )
);
CREATE TRIGGER trg_paciente_updated BEFORE UPDATE ON paciente
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- 7. OCORRENCIA — evento detectado pela IA. RN10, RN11, RN14.
-- -----------------------------------------------------------------------------
CREATE TABLE ocorrencia (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  paciente_id   uuid REFERENCES paciente(id) ON DELETE SET NULL,
  ambiente_id   uuid NOT NULL REFERENCES ambiente(id) ON DELETE RESTRICT,
  camera_id     uuid REFERENCES camera(id) ON DELETE SET NULL,
  tipo_evento   text NOT NULL DEFAULT 'queda'
                  CHECK (tipo_evento IN ('queda', 'perda_verticalidade', 'permanencia_solo', 'ausencia_prolongada')),
  -- RN11: os cinco estados possíveis, nada além disso.
  status        text NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'em_atendimento', 'encerrada', 'falso_positivo', 'queda_confirmada')),
  -- Índice de confiança do modelo (0 a 1). A RFC mira precisão >= 0,80.
  confianca     numeric(4,3) CHECK (confianca >= 0 AND confianca <= 1),
  data_hora     timestamptz NOT NULL DEFAULT now(),
  encerrada_em  timestamptz,
  observacao    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocorrencia_encerramento_coerente CHECK (
    (status IN ('encerrada', 'falso_positivo', 'queda_confirmada') AND encerrada_em IS NOT NULL)
    OR (status IN ('pendente', 'em_atendimento') AND encerrada_em IS NULL)
  )
);
CREATE TRIGGER trg_ocorrencia_updated BEFORE UPDATE ON ocorrencia
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- O dashboard consulta "pendentes desta clínica, mais recentes primeiro" o tempo todo.
CREATE INDEX ocorrencia_painel ON ocorrencia (clinica_id, status, data_hora DESC);
CREATE INDEX ocorrencia_por_paciente ON ocorrencia (paciente_id, data_hora DESC);


-- -----------------------------------------------------------------------------
-- 8. ALERTA — notificação da ocorrência. Relação 1:1 (DER da RFC).
-- -----------------------------------------------------------------------------
CREATE TABLE alerta (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE é o que faz o 1:1 valer no banco, não só no diagrama.
  ocorrencia_id     uuid NOT NULL UNIQUE REFERENCES ocorrencia(id) ON DELETE CASCADE,
  nivel             text NOT NULL DEFAULT 'critico'
                      CHECK (nivel IN ('critico', 'atencao', 'informativo')),
  status            text NOT NULL DEFAULT 'enviado'
                      CHECK (status IN ('enviado', 'ciente', 'expirado', 'falha_envio')),
  enviado_em        timestamptz NOT NULL DEFAULT now(),
  ciencia_em        timestamptz,
  ciencia_usuario_id uuid REFERENCES usuario(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alerta_ciencia_coerente CHECK (
    (status = 'ciente' AND ciencia_em IS NOT NULL) OR (status <> 'ciente')
  )
);

COMMENT ON TABLE alerta IS 'RN12: permanece visível até um profissional dar ciência.';


-- -----------------------------------------------------------------------------
-- 9. ATENDIMENTO — resposta do profissional. RN13, RN17.
-- -----------------------------------------------------------------------------
CREATE TABLE atendimento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id  uuid NOT NULL REFERENCES ocorrencia(id) ON DELETE CASCADE,
  usuario_id     uuid NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  iniciado_em    timestamptz NOT NULL DEFAULT now(),
  finalizado_em  timestamptz,
  observacao     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atendimento_intervalo_valido CHECK (
    finalizado_em IS NULL OR finalizado_em >= iniciado_em
  )
);
CREATE INDEX atendimento_por_ocorrencia ON atendimento (ocorrencia_id);


-- -----------------------------------------------------------------------------
-- 10. ACOMPANHANTE — familiar autorizado. RN03 a RN07.
-- -----------------------------------------------------------------------------
CREATE TABLE acompanhante (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RN05: vinculado a EXATAMENTE um paciente. RN07: some junto com ele.
  paciente_id   uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  documento     text NOT NULL,
  -- RN05: individual. Guarde o HASH do token, não o token em claro.
  token_qrcode  text NOT NULL UNIQUE,
  ativo         boolean NOT NULL DEFAULT true,
  -- RN07: temporário por definição, por isso NOT NULL.
  expira_em     timestamptz NOT NULL,
  revogado_em   timestamptz,
  -- Último uso do app do acompanhante. Auditoria, e a tela da equipe mostra.
  ultimo_acesso_em timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acompanhante_revogacao_coerente CHECK (
    (ativo = false AND revogado_em IS NOT NULL) OR ativo = true
  )
);
CREATE TRIGGER trg_acompanhante_updated BEFORE UPDATE ON acompanhante
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Consulta de validação do QR Code: "este token está ativo e dentro do prazo?"
CREATE INDEX acompanhante_token_valido ON acompanhante (token_qrcode) WHERE ativo;

COMMENT ON COLUMN acompanhante.token_qrcode IS
  'RN06: dá acesso a UMA câmera, a do paciente vinculado. Armazenar como hash.';


-- -----------------------------------------------------------------------------
-- 11. TERMO_CONFIDENCIALIDADE — RN04: sem aceite não há liberação.
-- -----------------------------------------------------------------------------
CREATE TABLE termo_confidencialidade (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acompanhante_id   uuid NOT NULL REFERENCES acompanhante(id) ON DELETE CASCADE,
  versao            text NOT NULL,
  aceito_em         timestamptz NOT NULL DEFAULT now(),
  ip_aceite         inet NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX termo_por_acompanhante ON termo_confidencialidade (acompanhante_id, aceito_em DESC);


-- -----------------------------------------------------------------------------
-- 12. LOG_ACESSO — trilha de auditoria. RNF06, RF29.
-- -----------------------------------------------------------------------------
CREATE TABLE log_acesso (
  id               bigserial PRIMARY KEY,
  clinica_id       uuid REFERENCES clinica(id) ON DELETE SET NULL,
  usuario_id       uuid REFERENCES usuario(id) ON DELETE SET NULL,
  acompanhante_id  uuid REFERENCES acompanhante(id) ON DELETE SET NULL,
  acao             text NOT NULL,
  resultado        text NOT NULL DEFAULT 'sucesso'
                     CHECK (resultado IN ('sucesso', 'falha', 'bloqueado')),
  ip               inet,
  user_agent       text,
  data_hora        timestamptz NOT NULL DEFAULT now(),
  -- Um log é de um profissional OU de um acompanhante, nunca dos dois nem de
  -- nenhum. Sem isso a auditoria aceita registro órfão e perde o valor legal.
  CONSTRAINT log_acesso_um_ator CHECK (
    (usuario_id IS NOT NULL AND acompanhante_id IS NULL)
    OR (usuario_id IS NULL AND acompanhante_id IS NOT NULL)
  )
);
CREATE INDEX log_acesso_consulta ON log_acesso (clinica_id, data_hora DESC);


-- -----------------------------------------------------------------------------
-- 13. EVOLUCAO — nota de evolução clínica. FORA das 12 entidades do DER da
--     RFC: entrou em 13/09/2026 por decisão de produto, depois da entrega
--     avaliada (a RFC 2.6 ainda a lista como fora do MVP; errata pendente).
--     Sem UPDATE nem DELETE: nota errada leva nota nova.
-- -----------------------------------------------------------------------------
CREATE TABLE evolucao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  -- RESTRICT: apagar o autor não pode apagar o que ele escreveu no prontuário.
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  texto       text NOT NULL CHECK (length(btrim(texto)) >= 3),
  data_hora   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evolucao_por_paciente ON evolucao (paciente_id, data_hora DESC);

COMMENT ON TABLE evolucao IS
  'Nota de evolução clínica. Sem UPDATE nem DELETE: registro corrigido leva nota nova, não edição da antiga.';


-- -----------------------------------------------------------------------------
-- 14. RISCO_PACIENTE — alergia ou risco. Também fora do DER original, mesma
--     decisão de 13/09/2026. Inativa-se (ativo/inativado_em, como o
--     acompanhante), não se edita nem se apaga.
-- -----------------------------------------------------------------------------
CREATE TABLE risco_paciente (
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
CREATE INDEX risco_ativo_por_paciente ON risco_paciente (paciente_id) WHERE ativo;

COMMENT ON TABLE risco_paciente IS
  'Alergia ou risco do paciente. Inativa-se, não se edita nem se apaga.';


-- -----------------------------------------------------------------------------
-- 15. PRESCRICAO — medicamento receitado ao paciente, e por quem. Fora do
--     DER original, mesma decisão de 13/09/2026. Suspende-se (ativo /
--     inativado_em), não se edita nem se apaga.
-- -----------------------------------------------------------------------------
CREATE TABLE prescricao (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id       uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  medicamento       text NOT NULL CHECK (length(btrim(medicamento)) >= 2),
  posologia         text,
  -- Texto: o prescritor pode ser médico de fora da clínica, sem usuário aqui.
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
CREATE INDEX prescricao_ativa_por_paciente ON prescricao (paciente_id) WHERE ativo;

COMMENT ON TABLE prescricao IS
  'Medicamento prescrito ao paciente e por quem. Inativa-se (suspensa), não se edita nem se apaga.';


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


-- -----------------------------------------------------------------------------
-- 18. MOVIMENTACAO_PACIENTE — admissão, troca de ambiente e saída, com quem e
--     quando (Operacional → Fluxo do Paciente, Alta e Transferência). Antes a
--     troca de quarto sobrescrevia paciente.ambiente_id sem deixar rastro.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimentacao_paciente (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id           uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  paciente_id          uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  tipo                 text NOT NULL CHECK (tipo IN ('admissao', 'transferencia', 'alta', 'transferencia_externa')),
  ambiente_origem_id   uuid REFERENCES ambiente(id) ON DELETE SET NULL,
  ambiente_destino_id  uuid REFERENCES ambiente(id) ON DELETE SET NULL,
  motivo               text,
  usuario_id           uuid REFERENCES usuario(id) ON DELETE SET NULL,
  data_hora            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movimentacao_por_clinica ON movimentacao_paciente (clinica_id, data_hora DESC);
CREATE INDEX IF NOT EXISTS movimentacao_por_paciente ON movimentacao_paciente (paciente_id, data_hora DESC);


-- -----------------------------------------------------------------------------
-- 19. AVALIACAO_RISCO_QUEDA — Escala de Morse (Morse, 1989), a avaliação de
--     risco de queda mais usada no Brasil (Monitoramento → Score de Risco).
--     Cada item guarda os pontos da opção escolhida; o total é calculado pelo
--     banco, para nunca divergir dos itens. Não se edita: reavalia-se.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avaliacao_risco_queda (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id              uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  historico_queda          smallint NOT NULL CHECK (historico_queda IN (0, 25)),
  diagnostico_secundario   smallint NOT NULL CHECK (diagnostico_secundario IN (0, 15)),
  auxilio_deambulacao      smallint NOT NULL CHECK (auxilio_deambulacao IN (0, 15, 30)),
  terapia_endovenosa       smallint NOT NULL CHECK (terapia_endovenosa IN (0, 20)),
  marcha                   smallint NOT NULL CHECK (marcha IN (0, 10, 20)),
  estado_mental            smallint NOT NULL CHECK (estado_mental IN (0, 15)),
  total                    smallint GENERATED ALWAYS AS (
                             historico_queda + diagnostico_secundario + auxilio_deambulacao
                             + terapia_endovenosa + marcha + estado_mental) STORED,
  observacao               text,
  usuario_id               uuid NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS avaliacao_morse_por_paciente ON avaliacao_risco_queda (paciente_id, created_at DESC);


-- -----------------------------------------------------------------------------
-- 20. SENSOR e SENSOR_LEITURA — dispositivos além da câmera (tapete de cama,
--     porta, botão de chamada). O sensor manda leitura por HTTP com o próprio
--     token (hash bcrypt, como o do acompanhante); a tela mostra o último sinal.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensor (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id      uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  ambiente_id     uuid REFERENCES ambiente(id) ON DELETE SET NULL,
  nome            text NOT NULL CHECK (length(btrim(nome)) >= 2),
  tipo            text NOT NULL CHECK (tipo IN ('cama', 'porta', 'presenca', 'botao_chamada', 'ambiente', 'outro')),
  token_hash      text NOT NULL,
  ativo           boolean NOT NULL DEFAULT true,
  ultimo_sinal    timestamptz,
  ultima_leitura  jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, nome)
);
CREATE TABLE IF NOT EXISTS sensor_leitura (
  id           bigserial PRIMARY KEY,
  sensor_id    uuid NOT NULL REFERENCES sensor(id) ON DELETE CASCADE,
  valor        jsonb NOT NULL,
  alerta       boolean NOT NULL DEFAULT false,
  recebida_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leitura_por_sensor ON sensor_leitura (sensor_id, recebida_em DESC);


-- -----------------------------------------------------------------------------
-- 21. CHECKLIST_MODELO e CHECKLIST_EXECUCAO — rotinas da equipe (passagem de
--     plantão, ronda noturna, conferência das câmeras). O modelo tem os itens;
--     a execução guarda o que foi marcado, por quem e em qual turno.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklist_modelo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id  uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  titulo      text NOT NULL CHECK (length(btrim(titulo)) >= 3),
  descricao   text,
  itens       jsonb NOT NULL CHECK (jsonb_typeof(itens) = 'array' AND jsonb_array_length(itens) BETWEEN 1 AND 60),
  frequencia  text NOT NULL DEFAULT 'turno' CHECK (frequencia IN ('turno', 'diaria', 'semanal', 'sob_demanda')),
  ativo       boolean NOT NULL DEFAULT true,
  criado_por  uuid REFERENCES usuario(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_checklist_modelo_updated ON checklist_modelo;
CREATE TRIGGER trg_checklist_modelo_updated BEFORE UPDATE ON checklist_modelo
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS checklist_execucao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id     uuid NOT NULL REFERENCES checklist_modelo(id) ON DELETE CASCADE,
  clinica_id    uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  usuario_id    uuid NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  turno         text NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite')),
  -- [{"item": "...", "feito": true, "observacao": "..."}], na ordem do modelo.
  respostas     jsonb NOT NULL CHECK (jsonb_typeof(respostas) = 'array'),
  itens_total   smallint NOT NULL,
  itens_feitos  smallint NOT NULL,
  observacao    text,
  concluido_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS execucao_por_clinica ON checklist_execucao (clinica_id, concluido_em DESC);


-- -----------------------------------------------------------------------------
-- 22. ESCALA_TURNO — quem trabalha em que turno de que dia.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escala_turno (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id  uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  data        date NOT NULL,
  turno       text NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite')),
  funcao      text,
  criado_por  uuid REFERENCES usuario(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, data, turno)
);
CREATE INDEX IF NOT EXISTS escala_por_dia ON escala_turno (clinica_id, data);


-- -----------------------------------------------------------------------------
-- 23. AGENDAMENTO — agenda do paciente: consulta, exame, terapia, visita.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agendamento (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id    uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  paciente_id   uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('consulta', 'exame', 'terapia', 'procedimento', 'visita', 'outro')),
  titulo        text NOT NULL CHECK (length(btrim(titulo)) >= 3),
  inicio        timestamptz NOT NULL,
  fim           timestamptz,
  local         text,
  profissional  text,
  status        text NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'realizado', 'cancelado', 'faltou')),
  observacao    text,
  criado_por    uuid REFERENCES usuario(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agendamento_intervalo CHECK (fim IS NULL OR fim > inicio)
);
DROP TRIGGER IF EXISTS trg_agendamento_updated ON agendamento;
CREATE TRIGGER trg_agendamento_updated BEFORE UPDATE ON agendamento
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS agendamento_por_dia ON agendamento (clinica_id, inicio);


-- -----------------------------------------------------------------------------
-- 24. LEMBRETE e LEMBRETE_CONCLUSAO — tarefas com data, que se repetem
--     sozinhas (diária, semanal, mensal) ao serem concluídas.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lembrete (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id   uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  paciente_id  uuid REFERENCES paciente(id) ON DELETE CASCADE,
  titulo       text NOT NULL CHECK (length(btrim(titulo)) >= 3),
  descricao    text,
  proxima_em   timestamptz NOT NULL,
  recorrencia  text NOT NULL DEFAULT 'nenhuma' CHECK (recorrencia IN ('nenhuma', 'diaria', 'semanal', 'mensal')),
  ativo        boolean NOT NULL DEFAULT true,
  criado_por   uuid REFERENCES usuario(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_lembrete_updated ON lembrete;
CREATE TRIGGER trg_lembrete_updated BEFORE UPDATE ON lembrete
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS lembrete_pendente ON lembrete (clinica_id, proxima_em) WHERE ativo;

CREATE TABLE IF NOT EXISTS lembrete_conclusao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lembrete_id   uuid NOT NULL REFERENCES lembrete(id) ON DELETE CASCADE,
  usuario_id    uuid NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  previsto_para timestamptz NOT NULL,
  observacao    text,
  concluido_em  timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 25. MENSAGEM — conversa entre a equipe e a família de um paciente, pelo
--     portal da família. Um autor por mensagem: profissional OU acompanhante.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mensagem (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id       uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  paciente_id      uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  autor            text NOT NULL CHECK (autor IN ('equipe', 'familia')),
  usuario_id       uuid REFERENCES usuario(id) ON DELETE SET NULL,
  acompanhante_id  uuid REFERENCES acompanhante(id) ON DELETE SET NULL,
  texto            text NOT NULL CHECK (length(btrim(texto)) BETWEEN 1 AND 2000),
  lida_em          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mensagem_autor_coerente CHECK (
    (autor = 'equipe' AND acompanhante_id IS NULL) OR (autor = 'familia' AND usuario_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS mensagem_por_paciente ON mensagem (paciente_id, created_at);


-- -----------------------------------------------------------------------------
-- 26. CHATBOT_RESPOSTA e CHATBOT_PERGUNTA — respostas prontas que a clínica
--     escreve (horário de visita, o que levar) e o portal da família usa para
--     responder dúvidas por palavra-chave. Não é IA, e a tela diz isso. A
--     pergunta sem resposta fica registrada para a clínica criar a resposta.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chatbot_resposta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id      uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  pergunta        text NOT NULL CHECK (length(btrim(pergunta)) >= 3),
  palavras_chave  text[] NOT NULL CHECK (cardinality(palavras_chave) >= 1),
  resposta        text NOT NULL CHECK (length(btrim(resposta)) >= 3),
  ativa           boolean NOT NULL DEFAULT true,
  usos            integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_chatbot_resposta_updated ON chatbot_resposta;
CREATE TRIGGER trg_chatbot_resposta_updated BEFORE UPDATE ON chatbot_resposta
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS chatbot_pergunta (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id       uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  acompanhante_id  uuid REFERENCES acompanhante(id) ON DELETE SET NULL,
  texto            text NOT NULL,
  resposta_id      uuid REFERENCES chatbot_resposta(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pergunta_por_clinica ON chatbot_pergunta (clinica_id, created_at DESC);


-- -----------------------------------------------------------------------------
-- 27. COMUNICACAO_EXAME — resultado de exame comunicado à família: o quê, a
--     quem, por qual canal e quando. Pelo portal, a família confirma a ciência.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comunicacao_exame (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id     uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  paciente_id    uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  exame          text NOT NULL CHECK (length(btrim(exame)) >= 2),
  data_exame     date NOT NULL,
  resultado      text NOT NULL CHECK (length(btrim(resultado)) >= 3),
  destinatario   text NOT NULL,
  canal          text NOT NULL CHECK (canal IN ('presencial', 'telefone', 'portal', 'email', 'outro')),
  usuario_id     uuid NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  comunicado_em  timestamptz NOT NULL DEFAULT now(),
  ciencia_em     timestamptz,
  observacao     text
);
CREATE INDEX IF NOT EXISTS exame_por_clinica ON comunicacao_exame (clinica_id, comunicado_em DESC);


-- -----------------------------------------------------------------------------
-- 28. RESPOSTA_SATISFACAO — pesquisa de satisfação (NPS, nota 0 a 10). Vem do
--     portal da família ou é registrada pela equipe (ligação, formulário).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resposta_satisfacao (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id       uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  paciente_id      uuid REFERENCES paciente(id) ON DELETE SET NULL,
  acompanhante_id  uuid REFERENCES acompanhante(id) ON DELETE SET NULL,
  nota             smallint NOT NULL CHECK (nota BETWEEN 0 AND 10),
  comentario       text,
  canal            text NOT NULL CHECK (canal IN ('portal', 'telefone', 'presencial', 'formulario')),
  registrado_por   uuid REFERENCES usuario(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS satisfacao_por_clinica ON resposta_satisfacao (clinica_id, created_at DESC);


-- -----------------------------------------------------------------------------
-- 29. CAMPANHA e CAMPANHA_PARTICIPANTE — campanhas de saúde (vacinação,
--     prevenção de quedas) e quais pacientes participaram.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campanha (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id          uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
  titulo              text NOT NULL CHECK (length(btrim(titulo)) >= 3),
  descricao           text,
  tipo                text NOT NULL CHECK (tipo IN ('vacinacao', 'prevencao', 'educacao', 'rastreamento', 'outro')),
  inicio              date NOT NULL,
  fim                 date NOT NULL,
  meta_participantes  integer CHECK (meta_participantes > 0),
  encerrada_em        timestamptz,
  criado_por          uuid REFERENCES usuario(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campanha_periodo CHECK (fim >= inicio)
);
CREATE TABLE IF NOT EXISTS campanha_participante (
  campanha_id     uuid NOT NULL REFERENCES campanha(id) ON DELETE CASCADE,
  paciente_id     uuid NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
  registrado_por  uuid REFERENCES usuario(id) ON DELETE SET NULL,
  registrado_em   timestamptz NOT NULL DEFAULT now(),
  observacao      text,
  PRIMARY KEY (campanha_id, paciente_id)
);


-- =============================================================================
--  Nota sobre retenção de vídeo (RN08, RN09, RNF05)
--
--  Imagens e vídeos são mantidos por no máximo 24h e depois excluídos, ficando
--  só os dados da ocorrência. Esse dado NÃO vive neste banco: fica no volume do
--  serviço de visão computacional, com rotina de expurgo própria.
--  A `ocorrencia` guarda apenas o registro do evento, que é permanente.
-- =============================================================================
