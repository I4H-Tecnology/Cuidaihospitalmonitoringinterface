-- =============================================================================
--  MedSignal — dados iniciais para desenvolvimento local
--
--  NÃO cria usuários. Senha exige hash real (bcrypt/argon2), que é
--  responsabilidade do backend FastAPI — deixar um hash de exemplo aqui viraria
--  credencial fraca versionada, exatamente o problema que estamos corrigindo.
--
--  Para criar o primeiro admin: db/scripts/criar-admin.sql
--  Os perfis de acesso ficam em 02_perfis.sql, que roda antes deste.
-- =============================================================================

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
-- Um paciente só: o suficiente para exercitar as telas sem encher o banco de
-- gente que não existe. Cadastrar mais é trabalho de quem administra a clínica.
JOIN (VALUES
  ('Quarto 101', 'Paciente Demo A', DATE '1942-03-11', 12)
) AS p(ambiente, nome, nasc, dias) ON a.nome = p.ambiente
WHERE c.slug = 'clinica-demo';
