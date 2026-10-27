-- =============================================================================
--  Migração incremental: endereço do serviço de visão de cada câmera.
--
--  O serviço de visão roda um processo por câmera, cada um com o próprio
--  /stream. Sem saber qual processo atende qual câmera, o monitoramento só
--  conseguia mostrar um vídeo — o do serviço padrão — e os outros quartos
--  ficavam sem imagem.
--
--  Aditiva e idempotente: uma coluna nula em `camera`, sem tocar em linha
--  nenhuma. Nulo continua funcionando como antes (serviço padrão do painel).
--  Volume novo não precisa dela: `db/init/01_schema.sql` já cria a coluna.
--
--    docker compose exec -T db psql -U medsignal -d medsignal \
--      -f /scripts/2026-10-25-camera-visao-url.sql
-- =============================================================================

ALTER TABLE camera ADD COLUMN IF NOT EXISTS visao_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'camera_visao_url_http'
  ) THEN
    ALTER TABLE camera
      ADD CONSTRAINT camera_visao_url_http
      CHECK (visao_url IS NULL OR visao_url ~ '^https?://');
  END IF;
END $$;

COMMENT ON COLUMN camera.visao_url IS 'Processo do serviço de visão que analisa esta câmera (/stream, /estado). Nulo = serviço padrão do painel.';

SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'camera' AND column_name = 'visao_url';
