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
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ambiente_id, identificador)
);
CREATE TRIGGER trg_camera_updated BEFORE UPDATE ON camera
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN camera.url_stream IS 'RTSP/HTTP da câmera IP. Credencial fica em cofre, não aqui.';


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


-- =============================================================================
--  Nota sobre retenção de vídeo (RN08, RN09, RNF05)
--
--  Imagens e vídeos são mantidos por no máximo 24h e depois excluídos, ficando
--  só os dados da ocorrência. Esse dado NÃO vive neste banco: fica no volume do
--  serviço de visão computacional, com rotina de expurgo própria.
--  A `ocorrencia` guarda apenas o registro do evento, que é permanente.
-- =============================================================================
