-- =============================================================================
--  Módulo financeiro — 0005: número do título e renumeração de parcelas
--
--  1. Todo título ganha um número sequencial por empresa ("Título 42"), como
--     num ERP: é por ele que a equipe fala de uma conta ("a parcela 3 do
--     título 42"), e ele não muda quando as parcelas mudam. Quem dá o número é
--     um gatilho, então nenhum caminho (tela, folha, recorrência, conciliação)
--     cria título sem número.
--
--  2. A unicidade do número da parcela dentro do título passa a ser conferida
--     no fim do comando, e não linha a linha: o reparcelamento renumera as
--     parcelas pela ordem de vencimento num UPDATE só, e trocar 2 com 3 no meio
--     do comando não é duplicidade.
-- =============================================================================

ALTER TABLE financeiro.titulo ADD COLUMN numero integer;

-- Os títulos que já existem, na ordem em que foram criados. Sem os gatilhos de
-- auditoria e de "atualizado em": numerar não é alteração feita por alguém, e
-- não deve aparecer no histórico de cada título.
ALTER TABLE financeiro.titulo DISABLE TRIGGER trg_titulo_auditoria;
ALTER TABLE financeiro.titulo DISABLE TRIGGER trg_titulo_atualizado;
UPDATE financeiro.titulo t
   SET numero = n.numero
  FROM (SELECT id, row_number() OVER (PARTITION BY organizacao_id ORDER BY criado_em, id) AS numero
          FROM financeiro.titulo) n
 WHERE n.id = t.id;
ALTER TABLE financeiro.titulo ENABLE TRIGGER trg_titulo_auditoria;
ALTER TABLE financeiro.titulo ENABLE TRIGGER trg_titulo_atualizado;

ALTER TABLE financeiro.titulo ALTER COLUMN numero SET NOT NULL;
ALTER TABLE financeiro.titulo ADD CONSTRAINT titulo_numero_positivo CHECK (numero >= 1);
CREATE UNIQUE INDEX titulo_numero_unico ON financeiro.titulo (organizacao_id, numero);

CREATE OR REPLACE FUNCTION financeiro.numerar_titulo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Uma trava por empresa, até o fim da transação, põe em fila dois títulos
  -- criados ao mesmo tempo: o segundo só conta depois que o primeiro gravou.
  PERFORM pg_advisory_xact_lock(hashtext('financeiro.titulo.numero'), hashtext(NEW.organizacao_id::text));
  SELECT COALESCE(max(numero), 0) + 1 INTO NEW.numero
    FROM financeiro.titulo
   WHERE organizacao_id = NEW.organizacao_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_titulo_numero BEFORE INSERT ON financeiro.titulo
  FOR EACH ROW EXECUTE FUNCTION financeiro.numerar_titulo();

-- Número não se troca depois de dado.
CREATE OR REPLACE FUNCTION financeiro.manter_numero_do_titulo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS DISTINCT FROM OLD.numero THEN
    RAISE EXCEPTION 'O número do título não muda.' USING ERRCODE = 'P0001', HINT = 'numero_do_titulo';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_titulo_numero_fixo BEFORE UPDATE OF numero ON financeiro.titulo
  FOR EACH ROW EXECUTE FUNCTION financeiro.manter_numero_do_titulo();

ALTER TABLE financeiro.parcela
  DROP CONSTRAINT parcela_titulo_id_numero_key,
  ADD CONSTRAINT parcela_titulo_id_numero_key UNIQUE (titulo_id, numero) DEFERRABLE INITIALLY IMMEDIATE;
