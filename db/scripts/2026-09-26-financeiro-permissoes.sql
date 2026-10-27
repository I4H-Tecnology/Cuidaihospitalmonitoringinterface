-- =============================================================================
--  Migração incremental: permissões do módulo financeiro.
--
--  Acrescenta os módulos `finance`, `payroll` e `finance_admin` a TODO perfil
--  que ainda não os tem — o global e as cópias por clínica criadas pela tela
--  de permissões. Sem isso, um perfil customizado não enxergaria o financeiro
--  e, pior, a linha nem apareceria na tela para alguém corrigir.
--
--  Aditiva e idempotente: perfil que já tem o módulo fica como está (se o
--  administrador já ajustou, o ajuste dele vale). Volume novo não precisa:
--  db/init/02_perfis.sql já traz os três.
--
--  O schema `financeiro` em si NÃO é criado aqui: a API aplica as migrações
--  do módulo sozinha na subida (backend/financeiro/migracoes).
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -f /scripts/2026-09-26-financeiro-permissoes.sql
-- =============================================================================

WITH padrao(perfil, modulo, ver, criar, editar, excluir) AS (
  VALUES
    ('ADMIN',   'finance',       true,  true,  true,  true),
    ('ADMIN',   'payroll',       true,  true,  true,  true),
    ('ADMIN',   'finance_admin', true,  true,  true,  true),
    ('MANAGER', 'finance',       true,  false, false, false)
),
modulos(nome) AS (VALUES ('finance'), ('payroll'), ('finance_admin')),
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
             'app',    false
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

-- Confere: quem vê o quê no financeiro.
SELECT p.nome AS perfil,
       COALESCE(c.slug, '(global)') AS clinica,
       (p.permissoes -> 'finance' ->> 'view')::boolean AS financeiro,
       (p.permissoes -> 'payroll' ->> 'view')::boolean AS folha,
       (p.permissoes -> 'finance_admin' ->> 'view')::boolean AS capital_e_config
  FROM perfil p
  LEFT JOIN clinica c ON c.id = p.clinica_id
 ORDER BY clinica, perfil;
