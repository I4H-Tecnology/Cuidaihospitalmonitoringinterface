#!/usr/bin/env bash
# Atualiza a pilha de produção a partir do código já enviado para ~/medsignal.
#
# Quem chama: o pipeline (.github/workflows/ci.yml, job "publicar"), DEPOIS de os testes
# passarem. Também serve para recuperar à mão: bash deploy/atualizar.sh <sha>
#
# O que faz:
#   1. guarda as imagens atuais como ":anterior" (para o rollback);
#   2. reconstrói e recria só backend, frontend e (se já habilitada) a visão;
#      o banco NÃO é tocado e o .env da VPS (segredos) nunca vem do pipeline;
#   3. recria o Caddy só se o Caddyfile mudou (arquivo único montado: sem isso o
#      contêiner continuaria vendo a versão velha);
#   4. espera ficarem saudáveis; se não ficarem, volta à imagem anterior e sai com erro;
#   5. grava o commit publicado em ~/medsignal/VERSAO.
#
# Migração de banco NÃO é automática de propósito: db/init só roda na criação do volume e
# db/scripts/02_perfis.sql reaplicado sobrescreveria permissões editadas pela tela.

set -euo pipefail

cd "$(dirname "$0")"                      # pasta deploy/
SHA="${1:-desconhecido}"
ESPERA_SEGUNDOS="${ESPERA_SEGUNDOS:-420}" # a visão leva ~2,5 min só para carregar os modelos
ESTADO="../.estado"
mkdir -p "$ESTADO"

log() { printf '%s [atualizar] %s\n' "$(date -u +%FT%TZ)" "$*"; }

[ -f .env ] || { log "ERRO: deploy/.env não existe. Os segredos ficam só na VPS; crie-o (ver LEIA-ME)."; exit 2; }

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

# A visão é opcional (profile): atualiza só se este servidor já a usa.
PERFIS=()
SERVICOS=(backend frontend)
if grep -q -E '^VISAO_CAMERA_ID=.+' .env; then
  PERFIS=(--profile visao)
  SERVICOS+=(visao)
fi

PROJETO="$("${COMPOSE[@]}" config 2>/dev/null | sed -n 's/^name: //p' | head -1)"
[ -n "$PROJETO" ] || { log "ERRO: não achei o nome do projeto no compose."; exit 2; }
log "commit $SHA | projeto $PROJETO | serviços: ${SERVICOS[*]}"

# 1. Foto das imagens atuais, para poder voltar.
for s in "${SERVICOS[@]}"; do
  if docker image inspect "$PROJETO-$s:latest" >/dev/null 2>&1; then
    docker tag "$PROJETO-$s:latest" "$PROJETO-$s:anterior"
  else
    log "aviso: $PROJETO-$s ainda não tem imagem (primeira publicação); sem rollback para ele"
  fi
done

# Ao terminar a espera, devolve 0 se todos os serviços com verificação de saúde estão
# saudáveis e os demais estão rodando.
esperar_saude() {
  local limite=$((SECONDS + ESPERA_SEGUNDOS)) s cid saude rodando ok
  while [ "$SECONDS" -lt "$limite" ]; do
    ok=1
    for s in "${SERVICOS[@]}"; do
      cid="$("${COMPOSE[@]}" "${PERFIS[@]}" ps -q "$s" 2>/dev/null || true)"
      if [ -z "$cid" ]; then ok=0; continue; fi
      saude="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      rodando="$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || true)"
      if [ -n "$saude" ]; then
        [ "$saude" = "healthy" ] || ok=0
      else
        [ "$rodando" = "true" ] || ok=0
      fi
    done
    [ "$ok" = 1 ] && return 0
    sleep 5
  done
  return 1
}

# 2. Reconstrói e recria. --no-deps: nunca mexe no banco nem no Caddy por aqui.
log "construindo e subindo..."
if ! "${COMPOSE[@]}" "${PERFIS[@]}" up -d --build --no-deps "${SERVICOS[@]}"; then
  log "ERRO: o build ou a subida falhou."
  FALHOU=1
else
  FALHOU=0
  esperar_saude || FALHOU=1
fi

# 4. Rollback automático.
if [ "$FALHOU" = 1 ]; then
  log "FALHA: a versão nova não ficou saudável. Voltando à anterior."
  "${COMPOSE[@]}" "${PERFIS[@]}" logs --tail 40 "${SERVICOS[@]}" 2>&1 | sed 's/^/    /' || true
  VOLTOU=1
  for s in "${SERVICOS[@]}"; do
    if docker image inspect "$PROJETO-$s:anterior" >/dev/null 2>&1; then
      docker tag "$PROJETO-$s:anterior" "$PROJETO-$s:latest"
    else
      VOLTOU=0
    fi
  done
  if [ "$VOLTOU" = 1 ] && "${COMPOSE[@]}" "${PERFIS[@]}" up -d --no-build --no-deps "${SERVICOS[@]}" && esperar_saude; then
    log "ROLLBACK ok: a versão anterior voltou a responder. A publicação FALHOU."
  else
    log "ROLLBACK incompleto: confira à mão (docker compose ps / logs). A publicação FALHOU."
  fi
  exit 1
fi

# 3. Caddy: só recria se o Caddyfile mudou desde a última publicação.
NOVO="$(sha256sum Caddyfile | cut -d' ' -f1)"
ANTIGO="$(cat "$ESTADO/caddyfile.sha256" 2>/dev/null || true)"
if [ "$NOVO" != "$ANTIGO" ]; then
  # Um Caddyfile com erro derrubaria o site inteiro ao recriar o contêiner. Valida antes,
  # num contêiner descartável com o arquivo novo; se falhar, o Caddy atual segue no ar.
  log "Caddyfile mudou: validando a configuração nova..."
  if ! "${COMPOSE[@]}" run --rm --no-deps --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile; then
    log "ERRO: o Caddyfile novo é inválido. O Caddy atual continua no ar; backend e frontend já estão atualizados."
    exit 1
  fi
  log "recriando o Caddy (o certificado fica no volume, não é reemitido)"
  "${COMPOSE[@]}" up -d --force-recreate --no-deps caddy
  echo "$NOVO" > "$ESTADO/caddyfile.sha256"
fi

# 5. Registro do que está no ar + limpeza só do que ficou sem nome.
printf '%s\n' "$SHA" > ../VERSAO
docker image prune -f >/dev/null 2>&1 || true
log "OK: commit $SHA publicado."
