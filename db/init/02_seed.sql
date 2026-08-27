-- =============================================================================
--  MedSignal — dados iniciais para desenvolvimento local
--
--  NÃO cria usuários. Senha exige hash real (bcrypt/argon2), que é
--  responsabilidade do backend FastAPI — deixar um hash de exemplo aqui viraria
--  credencial fraca versionada, exatamente o problema que estamos corrigindo.
--
--  Para criar o primeiro admin, use o endpoint/CLI do backend quando ele chegar.
-- =============================================================================

-- Perfis globais (clinica_id NULL): valem para qualquer clínica.
INSERT INTO perfil (clinica_id, nome, descricao, permissoes) VALUES
  (NULL, 'ADMIN', 'Administra a clínica: usuários, pacientes, ambientes e câmeras (RN02)',
   '{"usuarios":["ver","criar","editar","excluir"],
     "pacientes":["ver","criar","editar","excluir"],
     "ambientes":["ver","criar","editar","excluir"],
     "cameras":["ver","criar","editar","excluir"],
     "ocorrencias":["ver","editar"],
     "acompanhantes":["ver","criar","revogar"]}'::jsonb),

  (NULL, 'GESTOR', 'Acompanha indicadores e libera acesso de acompanhante (RN03)',
   '{"pacientes":["ver"],
     "ambientes":["ver"],
     "cameras":["ver"],
     "ocorrencias":["ver"],
     "relatorios":["ver"],
     "acompanhantes":["ver","criar","revogar"]}'::jsonb),

  (NULL, 'ENFERMEIRO', 'Recebe alertas e registra atendimento da ocorrência (RN13)',
   '{"pacientes":["ver"],
     "ocorrencias":["ver","editar"],
     "atendimentos":["ver","criar","editar"]}'::jsonb);


-- Clínica de demonstração, com ambientes e câmeras coerentes com o MVP.
WITH nova_clinica AS (
  INSERT INTO clinica (slug, nome, cnpj, endereco)
  VALUES ('clinica-demo', 'Clínica de Repouso Demonstração', '12345678000199',
          'Rua Exemplo, 100 — Joinville/SC')
  RETURNING id
),
novos_ambientes AS (
  INSERT INTO ambiente (clinica_id, nome, tipo)
  SELECT id, nome, tipo FROM nova_clinica, (VALUES
    ('Quarto 101', 'quarto'),
    ('Quarto 102', 'quarto'),
    ('Corredor Ala A', 'corredor'),
    ('Sala de Convivência', 'sala_convivencia')
  ) AS a(nome, tipo)
  RETURNING id, clinica_id, nome
)
INSERT INTO camera (ambiente_id, identificador, url_stream, status)
SELECT id,
       'CAM-' || upper(regexp_replace(nome, '[^a-zA-Z0-9]', '', 'g')),
       'rtsp://192.168.0.10:554/' || lower(regexp_replace(nome, '[^a-zA-Z0-9]', '', 'g')),
       'offline'
FROM novos_ambientes;


-- Pacientes fictícios para o dashboard ter o que exibir em desenvolvimento.
-- Nomes inventados: nenhum dado pessoal real entra no repositório (LGPD).
INSERT INTO paciente (clinica_id, ambiente_id, nome, data_nascimento, data_admissao)
SELECT c.id, a.id, p.nome, p.nasc, CURRENT_DATE - p.dias
FROM clinica c
JOIN ambiente a ON a.clinica_id = c.id
JOIN (VALUES
  ('Quarto 101', 'Paciente Demo A', DATE '1942-03-11', 12),
  ('Quarto 102', 'Paciente Demo B', DATE '1938-07-25', 5)
) AS p(ambiente, nome, nasc, dias) ON a.nome = p.ambiente
WHERE c.slug = 'clinica-demo';
