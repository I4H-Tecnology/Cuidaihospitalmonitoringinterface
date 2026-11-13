-- =============================================================================
--  Cria (ou atualiza) o usuário de leitura da apresentação do TCC.
--
--  Perfil VISITOR: só visualiza, e só o que a RFC especifica (a matriz está em
--  db/init/02_perfis.sql, num lugar só). Não cria, não edita, não exclui nada,
--  e não enxerga financeiro, compras, contratos, CRM, operações nem prontuário.
--
--  NÃO fica em db/init/ de propósito: senha não pode ser decidida por arquivo
--  versionado (mesma regra de criar-admin.sql).
--
--  Passo 1 — só em banco que já existe (volume novo já traz o VISITOR): grava
--  o perfil. É idempotente; reaplica a matriz de ADMIN, MANAGER e NURSE.
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -f /docker-entrypoint-initdb.d/02_perfis.sql
--
--  Passo 2 — cria o usuário. Só `senha` é obrigatória; o resto tem padrão
--  (tenant clinica-demo, login tcc). Os valores levam aspas simples por dentro,
--  como em criar-admin.sql.
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -v senha="'UmaSenhaForte@123'" \
--      -f /scripts/criar-usuario-tcc.sql
--
--  Com tudo explícito:
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -v tenant="'clinica-demo'" -v login="'tcc'" \
--      -v nome="'Avaliação TCC'" -v email="'tcc@medsignal.local'" \
--      -v senha="'UmaSenhaForte@123'" \
--      -f /scripts/criar-usuario-tcc.sql
--
--  O hash é bcrypt, gerado pelo pgcrypto dentro do banco (o mesmo formato que
--  o login da API verifica). Rodar de novo com o mesmo login troca a senha,
--  reativa a conta e devolve o perfil VISITOR — é idempotente.
-- =============================================================================

\set ON_ERROR_STOP on

-- Sem senha, falha com mensagem (e código de saída diferente de zero), em vez
-- de deixar o psql tropeçar num ":senha" não substituído lá na frente.
\if :{?senha}
\else
  DO $$ BEGIN
    RAISE EXCEPTION 'Falta a senha: passe -v senha="''SuaSenhaForte@123''" (aspas simples por dentro).';
  END $$;
\endif
\if :{?tenant}
\else
  \set tenant '''clinica-demo'''
\endif
\if :{?login}
\else
  \set login '''tcc'''
\endif
\if :{?nome}
\else
  \set nome '''Avaliação TCC'''
\endif
\if :{?email}
\else
  \set email '''tcc@medsignal.local'''
\endif

-- ---------------------------------------------------------------------------
-- 1. O perfil VISITOR precisa existir. Se não existir, o passo 1 do cabeçalho
--    ainda não rodou: parar aqui evita criar um usuário sem acesso nenhum.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfil WHERE nome = 'VISITOR' AND clinica_id IS NULL) THEN
    RAISE EXCEPTION 'Perfil VISITOR não existe. Rode antes db/init/02_perfis.sql (passo 1 do cabeçalho).';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. A clínica precisa existir. Diferente de criar-admin.sql, este script não
--    inventa clínica: um erro de digitação no tenant criaria uma clínica
--    vazia, e o usuário entraria numa tela sem dado algum.
-- ---------------------------------------------------------------------------
-- Dentro de $$...$$ o psql não substitui :variavel, por isso a checagem usa
-- \gset + \if em vez de um bloco DO.
SELECT EXISTS (SELECT 1 FROM clinica WHERE slug = :tenant) AS clinica_existe \gset
\if :clinica_existe
\else
  DO $$ BEGIN
    RAISE EXCEPTION 'A clínica informada em tenant não existe.';
  END $$;
\endif

-- ---------------------------------------------------------------------------
-- 3. Cria ou atualiza o usuário.
-- ---------------------------------------------------------------------------
WITH alvo AS (
  SELECT
    (SELECT id FROM clinica WHERE slug = :tenant)                         AS clinica_id,
    (SELECT id FROM perfil WHERE nome = 'VISITOR' AND clinica_id IS NULL) AS perfil_id
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
-- 4. Confere o resultado, sem exibir o hash: quem o usuário vê e o que pode.
-- ---------------------------------------------------------------------------
SELECT
  u.login,
  u.nome,
  c.slug                                                      AS tenant,
  p.nome                                                      AS perfil,
  u.status,
  (u.senha_hash LIKE '$2%')                                   AS senha_com_bcrypt,
  (SELECT string_agg(e.key, ', ' ORDER BY e.key)
     FROM jsonb_each(p.permissoes) e
    WHERE (e.value ->> 'view')::boolean)                      AS modulos_que_ve,
  (SELECT count(*)
     FROM jsonb_each(p.permissoes) e
    WHERE (e.value ->> 'create')::boolean
       OR (e.value ->> 'edit')::boolean
       OR (e.value ->> 'delete')::boolean)                    AS modulos_com_escrita
FROM usuario u
JOIN clinica c ON c.id = u.clinica_id
JOIN perfil  p ON p.id = u.perfil_id
WHERE u.login = lower(:login) AND c.slug = :tenant;
