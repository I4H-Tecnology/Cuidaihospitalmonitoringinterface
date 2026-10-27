-- =============================================================================
--  Cria (ou atualiza) um usuário administrador com acesso total.
--
--  NÃO fica em db/init/ de propósito: scripts de init rodam sozinhos na criação
--  do volume, e senha não pode ser decidida por arquivo versionado.
--
--  Uso:
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -v tenant="'clinica-demo'" -v login="'lucas'" \
--      -v email="'voce@exemplo.com'" -v nome="'Seu Nome'" \
--      -v senha="'SuaSenhaForte@123'" \
--      -f /scripts/criar-admin.sql
--
--  O hash é bcrypt, gerado pelo pgcrypto dentro do próprio banco (crypt +
--  gen_salt('bf', 12)). É o mesmo formato que passlib/bcrypt do FastAPI
--  verifica, então o backend valida sem conversão.
--
--  Rodar de novo com o mesmo login apenas troca a senha e recoloca o acesso
--  total — é idempotente.
-- =============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Eleva o perfil ADMIN a acesso total.
--    O nome tem de ser ADMIN, e não SUPERADMIN: o tipo Role do frontend
--    (authStore.ts) só aceita SYSTEM, ADMIN, MANAGER, DOCTOR, NURSE,
--    ADMINISTRATIVE, PATIENT e VISITOR. Nome fora dessa lista faz
--    getRoleLabel() devolver undefined e quebra a busca de permissões.
--
--    Cobre os 13 módulos de backend/app/comum.py:MODULOS (a mesma lista de
--    db/init/02_perfis.sql), com as quatro ações e as duas plataformas. É o
--    que "acesso completo" significa aqui. O UPDATE abaixo SUBSTITUI o JSON
--    inteiro: módulo que faltar nesta lista some do ADMIN (foi assim que a
--    lista antiga, de antes de 13/09, tirava acompanhantes e financeiro).
-- ---------------------------------------------------------------------------
INSERT INTO perfil (clinica_id, nome, descricao, permissoes)
VALUES (
  NULL,
  'ADMIN',
  'Acesso total a todos os módulos, web e app.',
  (
    SELECT jsonb_object_agg(
             modulo,
             jsonb_build_object(
               'view', true, 'create', true, 'edit', true, 'delete', true,
               'web', true, 'app', true
             )
           )
    FROM unnest(ARRAY[
      'dashboard', 'monitoring', 'alerts', 'clinical_logs', 'patients',
      'beds', 'reports', 'settings', 'users', 'companions',
      'finance', 'payroll', 'finance_admin'
    ]) AS modulo
  )
)
ON CONFLICT DO NOTHING;

-- Se o ADMIN já existia com permissões parciais (veio do seed), eleva agora.
UPDATE perfil SET permissoes = (
  SELECT jsonb_object_agg(
           modulo,
           jsonb_build_object(
             'view', true, 'create', true, 'edit', true, 'delete', true,
             'web', true, 'app', true
           )
         )
  FROM unnest(ARRAY[
    'dashboard', 'monitoring', 'alerts', 'clinical_logs', 'patients',
    'beds', 'reports', 'settings', 'users', 'companions',
    'finance', 'payroll', 'finance_admin'
  ]) AS modulo
)
WHERE nome = 'ADMIN' AND clinica_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Garante que a clínica informada existe.
-- ---------------------------------------------------------------------------
INSERT INTO clinica (slug, nome)
VALUES (:tenant, 'Clínica ' || :tenant)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Cria ou atualiza o usuário.
-- ---------------------------------------------------------------------------
WITH alvo AS (
  SELECT
    (SELECT id FROM clinica WHERE slug = :tenant)                       AS clinica_id,
    (SELECT id FROM perfil WHERE nome = 'ADMIN' AND clinica_id IS NULL) AS perfil_id
)
INSERT INTO usuario (
  clinica_id, perfil_id, nome, email, login, senha_hash,
  status, senha_alterada_em
)
SELECT
  alvo.clinica_id,
  alvo.perfil_id,
  :nome,
  :email,
  lower(:login),
  crypt(:senha, gen_salt('bf', 12)),
  'ativo',
  now()
FROM alvo
ON CONFLICT (clinica_id, lower(login)) DO UPDATE
SET senha_hash        = crypt(:senha, gen_salt('bf', 12)),
    perfil_id         = EXCLUDED.perfil_id,
    nome              = EXCLUDED.nome,
    email             = EXCLUDED.email,
    status            = 'ativo',
    tentativas_falhas = 0,
    bloqueado_ate     = NULL,
    senha_alterada_em = now();

-- ---------------------------------------------------------------------------
-- 4. Confere o resultado, sem exibir o hash.
-- ---------------------------------------------------------------------------
SELECT
  u.login,
  u.nome,
  u.email,
  c.slug                                     AS tenant,
  p.nome                                     AS perfil,
  (SELECT count(*) FROM jsonb_object_keys(p.permissoes)) AS modulos_liberados,
  u.status,
  (u.senha_hash LIKE '$2%')                  AS senha_com_bcrypt
FROM usuario u
JOIN clinica c ON c.id = u.clinica_id
JOIN perfil  p ON p.id = u.perfil_id
WHERE u.login = lower(:login) AND c.slug = :tenant;
