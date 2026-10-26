-- =============================================================================
--  Pacientes de demonstração, para apresentar o MedSignal.
--
--  Nomes, datas, históricos e prescrições são INVENTADOS — a mesma regra de
--  db/init/03_seed.sql: nenhum dado pessoal real entra no repositório (LGPD).
--  Semelhança com pessoas reais é coincidência.
--
--  Rodar de novo recria esses pacientes do zero, com datas relativas a hoje.
--  O que foi registrado para eles na apresentação anterior (ocorrências,
--  evoluções, acompanhantes) sai junto. Só toca nos nomes desta lista, e só na
--  clinica-demo.
--
--  O Quarto 101 fica com UM paciente só, de propósito: é o quarto da câmera do
--  serviço de visão (CAM-QUARTO101), e a ocorrência vai para o paciente
--  internado mais recentemente no quarto da câmera (rotas/ocorrencias.py).
--
--  Uso:
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -v autor="'lucas'" -f /scripts/demo-apresentacao.sql
--
--  `autor` é o login de quem assina evoluções, prescrições e riscos. Sem ele,
--  vale o primeiro ADMIN ativo da clínica.
-- =============================================================================

\set ON_ERROR_STOP on
\if :{?autor}
\else
  \set autor NULL
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Quartos. Os quatro ambientes do seed continuam; 103 e 104 recebem o resto.
-- ---------------------------------------------------------------------------
INSERT INTO ambiente (clinica_id, nome, tipo)
SELECT c.id, q.nome, 'quarto'
  FROM clinica c, (VALUES ('Quarto 103'), ('Quarto 104')) AS q(nome)
 WHERE c.slug = 'clinica-demo'
   AND NOT EXISTS (SELECT 1 FROM ambiente a WHERE a.clinica_id = c.id AND a.nome = q.nome);

-- ---------------------------------------------------------------------------
-- 2. Quem assina os registros clínicos.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE demo_autor ON COMMIT DROP AS
SELECT coalesce(
  (SELECT u.id FROM usuario u JOIN clinica c ON c.id = u.clinica_id
    WHERE c.slug = 'clinica-demo' AND u.login = lower(:autor)),
  (SELECT u.id FROM usuario u
     JOIN clinica c ON c.id = u.clinica_id
     JOIN perfil  p ON p.id = u.perfil_id
    WHERE c.slug = 'clinica-demo' AND p.nome = 'ADMIN' AND u.status = 'ativo'
    ORDER BY u.created_at LIMIT 1)
) AS id;

DO $$
BEGIN
  IF (SELECT id FROM demo_autor) IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário para assinar os registros: crie um admin com db/scripts/criar-admin.sql';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Os pacientes. `quarto` NULL e `dias_desde_alta` preenchido = já teve alta.
--    Escala de Morse: 45 ou mais é alto risco de queda; 25 a 44, moderado.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE demo_paciente (
  nome            text,
  nascimento      date,
  quarto          text,
  dias_internado  int,
  dias_desde_alta int,
  medico          text,
  historico       text
) ON COMMIT DROP;

INSERT INTO demo_paciente VALUES
  ('Maria Aparecida Nogueira', '1938-06-14', 'Quarto 101', 45, NULL,
   'Dra. Helena Prado (Geriatria)',
   'Doença de Alzheimer em estágio moderado. Hipertensão arterial sistêmica. Osteoporose. '
   'Fratura de fêmur à direita em 2024, tratada cirurgicamente; desde então deambula com andador. '
   'Desorientação noturna: costuma levantar-se sozinha de madrugada.'),
  ('José Carlos Ferreira', '1942-11-03', 'Quarto 102', 120, NULL,
   'Dr. Ricardo Menezes (Neurologia)',
   'Doença de Parkinson há 8 anos, com bradicinesia, rigidez e instabilidade postural. '
   'Episódios de congelamento da marcha. Hipertensão arterial. Constipação intestinal crônica. '
   'Disfagia leve para líquidos.'),
  ('Sebastião Ribeiro Lima', '1936-02-21', 'Quarto 102', 210, NULL,
   'Dra. Helena Prado (Geriatria)',
   'AVC isquêmico em 2023 com hemiparesia à esquerda. Fibrilação atrial em uso de anticoagulante. '
   'Insuficiência cardíaca compensada. Dependente para transferências.'),
  ('Antônia Gomes Barbosa', '1945-09-08', 'Quarto 103', 90, NULL,
   'Dr. Paulo Azevedo (Clínica Médica)',
   'Diabetes mellitus tipo 2 insulinodependente. Neuropatia periférica em membros inferiores. '
   'Retinopatia diabética com baixa acuidade visual. Hipertensão arterial.'),
  ('Terezinha de Jesus Oliveira', '1940-12-25', 'Quarto 103', 60, NULL,
   'Dr. Paulo Azevedo (Clínica Médica)',
   'Doença pulmonar obstrutiva crônica; ex-tabagista. Osteoartrose de joelhos. '
   'Depressão em tratamento.'),
  ('Benedito Alves Moreira', '1939-04-17', 'Quarto 104', 150, NULL,
   'Dra. Helena Prado (Geriatria)',
   'Demência vascular. Hipertensão arterial. Hiperplasia prostática benigna com noctúria: '
   'levanta-se várias vezes à noite para urinar. Agitação psicomotora no fim da tarde.'),
  ('Iracema Rocha Mendes', '1948-07-30', 'Quarto 104', 3, NULL,
   'Dr. Paulo Azevedo (Clínica Médica)',
   'Admitida para reabilitação após internação hospitalar por pneumonia comunitária. '
   'Hipotireoidismo. Descondicionamento físico pós-internação.'),
  ('Joaquim Pereira Santos', '1944-01-09', NULL, 40, 6,
   'Dr. Paulo Azevedo (Clínica Médica)',
   'Reabilitação após artroplastia total de quadril à direita. Hipertensão arterial controlada.');

-- Recria do zero: tira o que a apresentação anterior deixou para esses nomes.
DELETE FROM ocorrencia o
 USING paciente p, clinica c
 WHERE o.paciente_id = p.id AND p.clinica_id = c.id AND c.slug = 'clinica-demo'
   AND p.nome IN (SELECT nome FROM demo_paciente);

DELETE FROM paciente p
 USING clinica c
 WHERE p.clinica_id = c.id AND c.slug = 'clinica-demo'
   AND p.nome IN (SELECT nome FROM demo_paciente);

INSERT INTO paciente (
  clinica_id, ambiente_id, nome, data_nascimento, status,
  data_admissao, data_alta, medico_responsavel, historico_medico
)
SELECT c.id,
       a.id,
       d.nome,
       d.nascimento,
       CASE WHEN d.dias_desde_alta IS NULL THEN 'internado' ELSE 'alta' END,
       current_date - d.dias_internado,
       current_date - d.dias_desde_alta,
       d.medico,
       d.historico
  FROM demo_paciente d
  JOIN clinica c ON c.slug = 'clinica-demo'
  LEFT JOIN ambiente a ON a.clinica_id = c.id AND a.nome = d.quarto;

-- Os pacientes recém-criados, para os registros abaixo.
CREATE TEMP TABLE demo_criado ON COMMIT DROP AS
SELECT p.id, p.nome, p.data_admissao, p.data_alta
  FROM paciente p JOIN clinica c ON c.id = p.clinica_id
 WHERE c.slug = 'clinica-demo' AND p.nome IN (SELECT nome FROM demo_paciente);

-- ---------------------------------------------------------------------------
-- 4. Alergias e riscos, registrados na admissão.
-- ---------------------------------------------------------------------------
INSERT INTO risco_paciente (paciente_id, tipo, descricao, gravidade, usuario_id, created_at)
SELECT p.id, r.tipo, r.descricao, r.gravidade, (SELECT id FROM demo_autor),
       p.data_admissao + time '10:00'
  FROM (VALUES
    ('Maria Aparecida Nogueira',    'risco',   'Alto risco de queda (Morse 65)', 'grave'),
    ('Maria Aparecida Nogueira',    'risco',   'Desorientação noturna: levanta-se sem chamar a equipe', 'moderada'),
    ('Maria Aparecida Nogueira',    'alergia', 'Dipirona', 'moderada'),
    ('José Carlos Ferreira',        'risco',   'Alto risco de queda (Morse 55): congelamento da marcha', 'grave'),
    ('José Carlos Ferreira',        'risco',   'Risco de broncoaspiração: disfagia leve para líquidos', 'moderada'),
    ('José Carlos Ferreira',        'alergia', 'Penicilina', 'grave'),
    ('Sebastião Ribeiro Lima',      'risco',   'Alto risco de queda (Morse 70)', 'grave'),
    ('Sebastião Ribeiro Lima',      'risco',   'Anticoagulado: risco de sangramento em caso de queda', 'grave'),
    ('Sebastião Ribeiro Lima',      'risco',   'Risco de lesão por pressão (Braden 13)', 'moderada'),
    ('Sebastião Ribeiro Lima',      'alergia', 'Contraste iodado', 'leve'),
    ('Antônia Gomes Barbosa',       'risco',   'Risco moderado de queda (Morse 35): baixa visão e neuropatia', 'moderada'),
    ('Antônia Gomes Barbosa',       'risco',   'Hipoglicemia noturna: glicemia capilar às 3h', 'moderada'),
    ('Antônia Gomes Barbosa',       'alergia', 'Sulfonamidas', 'grave'),
    ('Terezinha de Jesus Oliveira', 'risco',   'Risco moderado de queda (Morse 30)', 'moderada'),
    ('Terezinha de Jesus Oliveira', 'alergia', 'Ácido acetilsalicílico (broncoespasmo)', 'grave'),
    ('Benedito Alves Moreira',      'risco',   'Alto risco de queda (Morse 60): levanta-se à noite para urinar', 'grave'),
    ('Benedito Alves Moreira',      'risco',   'Tansulosina e quetiapina: hipotensão postural ao levantar', 'moderada'),
    ('Iracema Rocha Mendes',        'risco',   'Risco moderado de queda (Morse 40): descondicionamento', 'moderada'),
    ('Iracema Rocha Mendes',        'alergia', 'Ibuprofeno', 'leve')
  ) AS r(nome, tipo, descricao, gravidade)
  JOIN demo_criado p ON p.nome = r.nome;

-- ---------------------------------------------------------------------------
-- 5. Prescrições. As de quem teve alta ficam inativas, encerradas na alta.
-- ---------------------------------------------------------------------------
INSERT INTO prescricao (
  paciente_id, medicamento, posologia, medico_prescritor, observacao,
  ativo, inativado_em, usuario_id, created_at
)
SELECT p.id, x.medicamento, x.posologia, d.medico, x.observacao,
       p.data_alta IS NULL,
       p.data_alta + time '11:00',
       (SELECT id FROM demo_autor),
       p.data_admissao + time '10:30'
  FROM (VALUES
    ('Maria Aparecida Nogueira',    'Donepezila 10 mg', '1 comprimido à noite', NULL),
    ('Maria Aparecida Nogueira',    'Losartana 50 mg', '1 comprimido pela manhã', NULL),
    ('Maria Aparecida Nogueira',    'Alendronato de sódio 70 mg', '1 comprimido por semana, às segundas, em jejum', 'Manter sentada por 30 minutos após a tomada'),
    ('Maria Aparecida Nogueira',    'Colecalciferol 7.000 UI', '1 cápsula por semana', NULL),
    ('José Carlos Ferreira',        'Levodopa + benserazida 200/50 mg', '1 comprimido às 7h, 12h e 18h', 'Respeitar o horário: atraso piora a rigidez e o congelamento'),
    ('José Carlos Ferreira',        'Pramipexol 0,25 mg', '1 comprimido 3 vezes ao dia', NULL),
    ('José Carlos Ferreira',        'Anlodipino 5 mg', '1 comprimido pela manhã', NULL),
    ('José Carlos Ferreira',        'Lactulose', '15 mL à noite, se constipação', NULL),
    ('Sebastião Ribeiro Lima',      'Apixabana 2,5 mg', '1 comprimido de 12 em 12 horas', NULL),
    ('Sebastião Ribeiro Lima',      'Furosemida 40 mg', '1 comprimido pela manhã', NULL),
    ('Sebastião Ribeiro Lima',      'Carvedilol 6,25 mg', '1 comprimido de 12 em 12 horas', NULL),
    ('Sebastião Ribeiro Lima',      'Sinvastatina 20 mg', '1 comprimido à noite', NULL),
    ('Antônia Gomes Barbosa',       'Insulina NPH', '14 UI antes do café e 8 UI às 22h, subcutânea', 'Glicemia capilar antes das refeições e às 3h'),
    ('Antônia Gomes Barbosa',       'Metformina 850 mg', '1 comprimido após o almoço e o jantar', NULL),
    ('Antônia Gomes Barbosa',       'Enalapril 10 mg', '1 comprimido de 12 em 12 horas', NULL),
    ('Terezinha de Jesus Oliveira', 'Formoterol + budesonida 12/400 mcg', '1 inalação de 12 em 12 horas', NULL),
    ('Terezinha de Jesus Oliveira', 'Sertralina 50 mg', '1 comprimido pela manhã', NULL),
    ('Terezinha de Jesus Oliveira', 'Paracetamol 750 mg', '1 comprimido até de 6 em 6 horas, se dor', NULL),
    ('Benedito Alves Moreira',      'Tansulosina 0,4 mg', '1 cápsula à noite', NULL),
    ('Benedito Alves Moreira',      'Quetiapina 25 mg', '1 comprimido à noite', NULL),
    ('Benedito Alves Moreira',      'Losartana 50 mg', '1 comprimido de 12 em 12 horas', NULL),
    ('Iracema Rocha Mendes',        'Amoxicilina + clavulanato 875/125 mg', '1 comprimido de 12 em 12 horas, por 7 dias', 'Completa o tratamento iniciado no hospital'),
    ('Iracema Rocha Mendes',        'Levotiroxina 50 mcg', '1 comprimido em jejum', NULL),
    ('Joaquim Pereira Santos',      'Enoxaparina 40 mg', '1 aplicação subcutânea ao dia', 'Profilaxia de trombose após a cirurgia'),
    ('Joaquim Pereira Santos',      'Losartana 50 mg', '1 comprimido pela manhã', NULL)
  ) AS x(nome, medicamento, posologia, observacao)
  JOIN demo_criado p ON p.nome = x.nome
  JOIN demo_paciente d ON d.nome = x.nome;

-- ---------------------------------------------------------------------------
-- 6. Evoluções de enfermagem dos últimos dias.
-- ---------------------------------------------------------------------------
INSERT INTO evolucao (paciente_id, usuario_id, texto, data_hora)
SELECT p.id, (SELECT id FROM demo_autor), e.texto, now() - e.ha
  FROM (VALUES
    ('Maria Aparecida Nogueira', interval '2 days 3 hours',
     'Bom estado geral, orientada apenas em pessoa. Aceitou todo o café da manhã. Deambulou no corredor com andador e supervisão. PA 128x76 mmHg, FC 74 bpm, SpO2 96%.'),
    ('Maria Aparecida Nogueira', interval '1 day 6 hours',
     'Noite agitada: levantou-se às 3h sem chamar a equipe e foi encontrada sentada à beira do leito, sem queda. Reforçada a orientação, grades elevadas e luz de vigília acesa. Comunicado à Dra. Helena Prado.'),
    ('Maria Aparecida Nogueira', interval '3 hours',
     'Manhã tranquila. Higiene com auxílio. Sem queixas de dor. Mantido o monitoramento por câmera no quarto.'),
    ('José Carlos Ferreira', interval '1 day 2 hours',
     'Tremor de repouso mais evidente no fim da tarde, perto do horário da levodopa. Marcha em pequenos passos, com congelamento ao passar pela porta do banheiro. Acompanhado na deambulação.'),
    ('José Carlos Ferreira', interval '5 hours',
     'Recebeu levodopa às 7h, com melhora da rigidez após cerca de 40 minutos. Dieta pastosa com líquidos espessados, sem engasgos.'),
    ('Sebastião Ribeiro Lima', interval '1 day 4 hours',
     'Hemiparesia à esquerda inalterada. Mudança de decúbito de 2 em 2 horas. Região sacral hiperemiada, que clareia à digitopressão. Mantido colchão pneumático.'),
    ('Sebastião Ribeiro Lima', interval '4 hours',
     'Transferência do leito para a poltrona com dois profissionais. Sem sinais de sangramento. Diurese presente após a furosemida.'),
    ('Antônia Gomes Barbosa', interval '10 hours',
     'Glicemia capilar às 3h: 68 mg/dL, paciente sudoreica. Oferecido suco com açúcar; nova glicemia em 15 minutos: 112 mg/dL. Comunicado ao Dr. Paulo Azevedo para revisão da insulina noturna.'),
    ('Terezinha de Jesus Oliveira', interval '6 hours',
     'Eupneica em ar ambiente, SpO2 93%. Realizou a inalação prescrita. Dor no joelho direito, nota 4 de 10; administrado paracetamol, com melhora.'),
    ('Benedito Alves Moreira', interval '9 hours',
     'Levantou-se quatro vezes durante a noite para urinar. Deixado papagaio ao lado do leito e orientado a chamar a equipe. Sem queda.'),
    ('Benedito Alves Moreira', interval '2 hours',
     'Agitação no fim da tarde de ontem, que cedeu com abordagem verbal e música. Hoje calmo; participou da atividade na sala de convivência.'),
    ('Iracema Rocha Mendes', interval '2 days 20 hours',
     'Admitida após alta hospitalar por pneumonia comunitária. Consciente e orientada, deambula com apoio. Em uso de antibiótico oral até completar 7 dias.'),
    ('Iracema Rocha Mendes', interval '7 hours',
     'Sem febre nas últimas 48 horas. Tosse produtiva em melhora. Aceitando bem a dieta.'),
    ('Joaquim Pereira Santos', interval '6 days',
     'Alta para casa, acompanhado da filha. Orientados os cuidados com a marcha e o retorno ambulatorial em 15 dias.')
  ) AS e(nome, ha, texto)
  JOIN demo_criado p ON p.nome = e.nome;

COMMIT;

-- ---------------------------------------------------------------------------
-- 7. Confere o resultado.
-- ---------------------------------------------------------------------------
SELECT p.nome,
       date_part('year', age(p.data_nascimento))::int AS idade,
       coalesce(a.nome, '-')                          AS quarto,
       p.status,
       p.data_admissao,
       (SELECT count(*) FROM risco_paciente r WHERE r.paciente_id = p.id) AS riscos,
       (SELECT count(*) FROM prescricao x WHERE x.paciente_id = p.id AND x.ativo) AS prescricoes_ativas,
       (SELECT count(*) FROM evolucao e WHERE e.paciente_id = p.id) AS evolucoes
  FROM paciente p
  JOIN clinica c ON c.id = p.clinica_id
  LEFT JOIN ambiente a ON a.id = p.ambiente_id
 WHERE c.slug = 'clinica-demo'
 ORDER BY p.status DESC, a.nome NULLS LAST, p.nome;
