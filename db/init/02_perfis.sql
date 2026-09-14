-- =============================================================================
--  MedSignal — perfis de acesso (RBAC). RF04, RN01, RN02, RN03.
--
--  Roda sozinho na criação do volume. Também serve de REPARO num banco que já
--  existe, porque é idempotente:
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -f /docker-entrypoint-initdb.d/02_perfis.sql
--
--  Arquivo único de propósito: a matriz de permissão em dois lugares vira duas
--  matrizes diferentes na primeira vez que alguém mexer só em uma.
--
--  DUAS REGRAS que este arquivo existe para respeitar:
--
--  1. O NOME do perfil tem de estar na união `Role` do frontend
--     (authStore.ts): SYSTEM, ADMIN, MANAGER, DOCTOR, NURSE, ADMINISTRATIVE,
--     PATIENT e VISITOR. 'GESTOR' e 'ENFERMEIRO' não estão — por isso viram
--     MANAGER e NURSE aqui.
--
--  2. O FORMATO é dicionário de módulo para ações em inglês, que é o que
--     seguranca.py:exigir_permissao lê:
--         {"monitoring": {"view": true, "create": false, ...}}
--     A lista antiga ({"ocorrencias": ["ver"]}) não era lida por ninguém: todo
--     perfil naquele formato falhava em qualquer rota protegida.
--
--  Os 10 módulos aparecem em TODO perfil, inclusive os negados. Módulo ausente
--  do JSON some da tela de permissões (main.py:obter_permissoes itera as
--  chaves presentes) — e permissão que não aparece não pode ser conferida nem
--  corrigida por quem administra.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Renomeia o que veio dos nomes antigos, antes de inserir os novos.
--    UPDATE, e não DELETE + INSERT: usuario.perfil_id referencia esta linha
--    (ON DELETE RESTRICT), então apagar quebraria quem já está cadastrado.
--    A guarda do NOT EXISTS evita colidir com o índice único caso o nome novo
--    já exista — aí o registro antigo é lixo e sai no passo 3.
-- ---------------------------------------------------------------------------
UPDATE perfil SET nome = 'MANAGER'
 WHERE lower(nome) = 'gestor' AND clinica_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM perfil WHERE lower(nome) = 'manager' AND clinica_id IS NULL
   );

UPDATE perfil SET nome = 'NURSE'
 WHERE lower(nome) = 'enfermeiro' AND clinica_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM perfil WHERE lower(nome) = 'nurse' AND clinica_id IS NULL
   );

-- ---------------------------------------------------------------------------
-- 2. A matriz de permissão.
--
--    Uma linha por módulo CONCEDIDO. O que não estiver listado entra como
--    negado — a expansão para os 14 módulos é feita logo abaixo.
--
--    Fora do MVP pela seção 2.6 da RFC (appointments, hospital_management,
--    financial, inventory, hr): ninguém recebe nada. A tela existe no protótipo
--    para mostrar visão de produto, e não faz parte da v1.
-- ---------------------------------------------------------------------------
-- Mesma lista de backend/app/comum.py:MODULOS. Os cinco módulos de gestão
-- hospitalar ampla saíram com as telas (13/09/2026); `companions` é a aba de
-- acompanhantes do prontuário (RN03: admin e gestor liberam o acesso).
WITH modulos(nome) AS (
  VALUES ('dashboard'), ('monitoring'), ('alerts'), ('clinical_logs'),
         ('patients'), ('beds'), ('reports'), ('settings'), ('users'),
         ('companions')
),

perfis(nome, descricao) AS (
  VALUES
    ('ADMIN',   'Administra a clínica: usuários, pacientes, ambientes e câmeras (RN02, RN03)'),
    ('MANAGER', 'Acompanha indicadores e histórico de ocorrências; libera acesso de acompanhante (RN03)'),
    ('NURSE',   'Recebe o alerta, atende e encerra a ocorrência (RF17–RF20, RN13)')
),

concessoes(perfil, modulo, ver, criar, editar, excluir, web, app) AS (
  VALUES
    -- ADMIN — cadastra tudo que o RN02 lista e administra o sistema.
    ('ADMIN', 'dashboard',      true,  false, false, false, true,  true),
    ('ADMIN', 'monitoring',     true,  true,  true,  true,  true,  true),
    ('ADMIN', 'alerts',         true,  true,  true,  true,  true,  true),
    -- Admite o paciente com alergias e medicações já na entrada (13/09/2026).
    ('ADMIN', 'clinical_logs',  true,  true,  false, false, true,  false),
    ('ADMIN', 'patients',       true,  true,  true,  true,  true,  true),
    ('ADMIN', 'beds',           true,  true,  true,  true,  true,  false),
    ('ADMIN', 'reports',        true,  false, false, false, true,  false),
    ('ADMIN', 'settings',       true,  true,  true,  true,  true,  false),
    ('ADMIN', 'users',          true,  true,  true,  true,  true,  false),
    ('ADMIN', 'companions',     true,  true,  true,  true,  true,  false),

    -- MANAGER — só leitura da operação, mais a geração de relatório.
    -- Não mexe em usuário nem em configuração: RN02 reserva isso ao admin.
    ('MANAGER', 'dashboard',     true, false, false, false, true, false),
    ('MANAGER', 'monitoring',    true, false, false, false, true, false),
    ('MANAGER', 'alerts',        true, false, false, false, true, false),
    ('MANAGER', 'clinical_logs', true, false, false, false, true, false),
    ('MANAGER', 'patients',      true, false, false, false, true, false),
    ('MANAGER', 'beds',          true, false, false, false, true, false),
    ('MANAGER', 'reports',       true, true,  false, false, true, false),
    -- RN03: gestor também libera acesso de acompanhante.
    ('MANAGER', 'companions',    true, true,  true,  false, true, false),

    -- NURSE — o perfil do app (§1.4: "uso intensivo do aplicativo mobile").
    -- Em alerts recebe 'edit', e não 'create': quem cria alerta é a IA. O que
    -- o enfermeiro faz é dar ciência, atender e encerrar (RF17–RF19).
    ('NURSE', 'dashboard',     true, false, false, false, true, true),
    ('NURSE', 'monitoring',    true, false, false, false, true, true),
    ('NURSE', 'alerts',        true, false, true,  false, true, true),
    ('NURSE', 'clinical_logs', true, true,  false, false, true, true),
    ('NURSE', 'patients',      true, false, false, false, true, true),
    ('NURSE', 'beds',          true, false, false, false, false, true),
    -- Enfermagem vê quem tem acesso; quem libera é admin ou gestor (RN03).
    ('NURSE', 'companions',    true, false, false, false, true, true)
),

montadas AS (
  SELECT
    p.nome AS perfil,
    p.descricao,
    jsonb_object_agg(
      m.nome,
      jsonb_build_object(
        'view',   COALESCE(c.ver,     false),
        'create', COALESCE(c.criar,   false),
        'edit',   COALESCE(c.editar,  false),
        'delete', COALESCE(c.excluir, false),
        'web',    COALESCE(c.web,     false),
        'app',    COALESCE(c.app,     false)
      )
    ) AS permissoes
  FROM perfis p
  CROSS JOIN modulos m
  LEFT JOIN concessoes c ON c.perfil = p.nome AND c.modulo = m.nome
  GROUP BY p.nome, p.descricao
)

INSERT INTO perfil (clinica_id, nome, descricao, permissoes)
SELECT NULL, perfil, descricao, permissoes FROM montadas
-- Infere pelo índice perfil_nome_por_clinica, que trata NULL como valor.
ON CONFLICT (COALESCE(clinica_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome))
DO UPDATE SET permissoes = EXCLUDED.permissoes,
              descricao  = EXCLUDED.descricao;

-- ---------------------------------------------------------------------------
-- 3. Remove sobra de nome antigo que ninguém mais usa.
--    Só apaga se nenhum usuário apontar para ela — a intenção é limpar lixo,
--    não desligar o acesso de alguém sem avisar.
-- ---------------------------------------------------------------------------
DELETE FROM perfil
 WHERE clinica_id IS NULL
   AND lower(nome) IN ('gestor', 'enfermeiro')
   AND NOT EXISTS (SELECT 1 FROM usuario u WHERE u.perfil_id = perfil.id);

-- ---------------------------------------------------------------------------
-- 4. Confere o resultado.
-- ---------------------------------------------------------------------------
SELECT
  p.nome                                                   AS perfil,
  (SELECT count(*) FROM jsonb_object_keys(p.permissoes))   AS modulos_no_json,
  (SELECT count(*) FROM jsonb_each(p.permissoes) e
    WHERE (e.value ->> 'view')::boolean)                   AS modulos_visiveis,
  (SELECT count(*) FROM usuario u WHERE u.perfil_id = p.id) AS usuarios
FROM perfil p
WHERE p.clinica_id IS NULL
ORDER BY p.nome;
