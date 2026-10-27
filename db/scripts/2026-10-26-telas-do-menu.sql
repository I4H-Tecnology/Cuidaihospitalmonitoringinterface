-- =============================================================================
--  Migração incremental: as telas do menu (26/10/2026).
--
--  Tabelas de Monitoramento (avaliação de Morse, sensores), CRM (agenda,
--  lembretes, mensagens, respostas prontas, exames, satisfação, campanhas) e
--  Operacional (checklists, escalas, movimentação de pacientes), mais os
--  módulos `crm` e `operations` em todo perfil que ainda não os tem.
--
--  A movimentação de quem já estava internado é reconstruída a partir das
--  datas de admissão e alta, para o Fluxo do Paciente não começar vazio.
--
--  Aditiva e idempotente. Volume novo não precisa: db/init já traz tudo.
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -f /scripts/2026-10-26-telas-do-menu.sql
-- =============================================================================

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


-- Movimentação dos pacientes que já existiam (só se ainda não houver nenhuma).
INSERT INTO movimentacao_paciente (clinica_id, paciente_id, tipo, ambiente_destino_id, motivo, data_hora)
SELECT p.clinica_id, p.id, 'admissao', p.ambiente_id, 'Reconstruída da data de admissão', p.data_admissao::timestamptz + interval '9 hours'
  FROM paciente p
 WHERE NOT EXISTS (SELECT 1 FROM movimentacao_paciente m WHERE m.paciente_id = p.id);

INSERT INTO movimentacao_paciente (clinica_id, paciente_id, tipo, ambiente_origem_id, motivo, data_hora)
SELECT p.clinica_id, p.id, CASE WHEN p.status = 'transferido' THEN 'transferencia_externa' ELSE 'alta' END,
       p.ambiente_id, 'Reconstruída da data de alta', p.data_alta::timestamptz + interval '15 hours'
  FROM paciente p
 WHERE p.data_alta IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM movimentacao_paciente m WHERE m.paciente_id = p.id AND m.tipo IN ('alta', 'transferencia_externa'));


WITH padrao(perfil, modulo, ver, criar, editar, excluir) AS (
  VALUES
    ('ADMIN',   'crm',        true, true,  true,  true),
    ('ADMIN',   'operations', true, true,  true,  true),
    ('MANAGER', 'crm',        true, true,  true,  false),
    ('MANAGER', 'operations', true, true,  true,  false),
    ('NURSE',   'crm',        true, true,  true,  false),
    ('NURSE',   'operations', true, true,  false, false)
),
modulos(nome) AS (VALUES ('crm'), ('operations')),
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

SELECT p.nome AS perfil,
       COALESCE(c.slug, '(global)') AS clinica,
       (p.permissoes -> 'crm' ->> 'view')::boolean AS crm,
       (p.permissoes -> 'operations' ->> 'view')::boolean AS operacional
  FROM perfil p
  LEFT JOIN clinica c ON c.id = p.clinica_id
 ORDER BY clinica, perfil;
