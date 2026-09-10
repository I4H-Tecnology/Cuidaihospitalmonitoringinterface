-- =============================================================================
--  Cria (ou atualiza) o usuário de serviço que o pipeline de visão usa para
--  registrar ocorrências na API.
--
--  Uso:
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -v tenant="'clinica-demo'" -v login="'servico-visao'" \
--      -v senha="'UmaSenhaLongaEAleatoria'" \
--      -f /scripts/criar-servico-visao.sql
--
--  Gere a senha com:
--    python -c "import secrets; print(secrets.token_urlsafe(32))"
--
--  Ela vai para VISAO_API_SENHA no .env. É credencial de máquina: longa,
--  aleatória e sem ninguém para memorizá-la — não há motivo para ser curta.
--
--  Idempotente: rodar de novo com o mesmo login só troca a senha.
-- =============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Perfil SYSTEM — mínimo necessário, e nada além.
--
--    O nome é SYSTEM, e não SERVICO, porque o tipo Role do frontend
--    (authStore.ts) só aceita SYSTEM, ADMIN, MANAGER, DOCTOR, NURSE,
--    ADMINISTRATIVE, PATIENT e VISITOR. Nome fora dessa lista quebraria a
--    busca de permissões se um dia esta conta passasse pela interface.
--
--    Só monitoring, e só view + create: este usuário registra ocorrência e lê
--    o cadastro da própria câmera. Não edita, não apaga, não enxerga usuário,
--    paciente nem configuração. Se a credencial vazar, o estrago é criar
--    alerta falso — ruim, mas muito longe de acesso administrativo.
-- ---------------------------------------------------------------------------
INSERT INTO perfil (clinica_id, nome, descricao, permissoes)
VALUES (
  NULL,
  'SYSTEM',
  'Conta de máquina do serviço de visão: registra ocorrências detectadas.',
  '{"monitoring": {"view": true, "create": true,
                   "edit": false, "delete": false,
                   "web": false, "app": false}}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Se já existia com outra coisa, recoloca exatamente o mínimo.
UPDATE perfil
   SET permissoes = '{"monitoring": {"view": true, "create": true,
                                     "edit": false, "delete": false,
                                     "web": false, "app": false}}'::jsonb,
       descricao  = 'Conta de máquina do serviço de visão: registra ocorrências detectadas.'
 WHERE nome = 'SYSTEM' AND clinica_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Garante que a clínica existe.
-- ---------------------------------------------------------------------------
INSERT INTO clinica (slug, nome)
VALUES (:tenant, 'Clínica ' || :tenant)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Cria ou atualiza a conta de serviço.
--    Mesmo hash bcrypt do resto (pgcrypto, gen_salt('bf', 12)).
-- ---------------------------------------------------------------------------
WITH alvo AS (
  SELECT
    (SELECT id FROM clinica WHERE slug = :tenant)                        AS clinica_id,
    (SELECT id FROM perfil WHERE nome = 'SYSTEM' AND clinica_id IS NULL) AS perfil_id
)
INSERT INTO usuario (
  clinica_id, perfil_id, nome, email, login, senha_hash,
  status, senha_alterada_em
)
SELECT
  alvo.clinica_id,
  alvo.perfil_id,
  'Serviço de Visão Computacional',
  lower(:login) || '@servico.medsignal.local',
  lower(:login),
  crypt(:senha, gen_salt('bf', 12)),
  'ativo',
  now()
FROM alvo
ON CONFLICT (clinica_id, lower(login)) DO UPDATE
SET senha_hash        = crypt(:senha, gen_salt('bf', 12)),
    perfil_id         = EXCLUDED.perfil_id,
    status            = 'ativo',
    tentativas_falhas = 0,
    bloqueado_ate     = NULL,
    senha_alterada_em = now();

-- ---------------------------------------------------------------------------
-- 4. Mostra o id da câmera que deve ir para VISAO_CAMERA_ID.
--    É a informação que falta no .env, e procurá-la à mão no banco é o tipo
--    de passo que se erra em silêncio.
-- ---------------------------------------------------------------------------
SELECT
  u.login                    AS servico,
  p.nome                     AS perfil,
  c.slug                     AS tenant,
  (u.senha_hash LIKE '$2%')  AS senha_com_bcrypt
FROM usuario u
JOIN clinica c ON c.id = u.clinica_id
JOIN perfil  p ON p.id = u.perfil_id
WHERE u.login = lower(:login) AND c.slug = :tenant;

\echo ''
\echo 'Câmeras desta clínica — copie o id da que o serviço vai observar para VISAO_CAMERA_ID:'
SELECT cam.id AS visao_camera_id, cam.identificador, amb.nome AS ambiente, cam.status
FROM camera cam
JOIN ambiente amb ON amb.id = cam.ambiente_id
JOIN clinica  cli ON cli.id = amb.clinica_id
WHERE cli.slug = :tenant
ORDER BY amb.nome;
