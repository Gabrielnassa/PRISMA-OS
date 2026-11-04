#!/bin/bash
# Funções usadas pelos scripts do servidor.
set -euo pipefail
PASTA="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$PASTA/.." && pwd)"
CONFIG="$PASTA/config.env"
BACKUP_DIR="${PRISMA_BACKUP_DIR:-$PASTA/backups}"

if [ -t 1 ]; then
  VERDE=$'\e[32m'; AMARELO=$'\e[33m'; VERMELHO=$'\e[31m'; NEGRITO=$'\e[1m'; NORMAL=$'\e[0m'
else
  VERDE=""; AMARELO=""; VERMELHO=""; NEGRITO=""; NORMAL=""
fi
info() { echo "$*"; }
ok() { echo "${VERDE}✓${NORMAL} $*"; }
aviso() { echo "${AMARELO}!${NORMAL} $*"; }
erro() { echo "${VERMELHO}✗ $*${NORMAL}" >&2; exit 1; }
titulo() { echo; echo "${NEGRITO}$*${NORMAL}"; echo; }

dc() { docker compose -f "$PASTA/compose.yml" --env-file "$CONFIG" "$@"; }

exigir_root() {
  [ "$(id -u)" -eq 0 ] || erro "Rode como administrador: sudo bash $0"
}

exigir_configuracao() {
  [ -f "$CONFIG" ] || erro "O PRISMA OS ainda não foi instalado neste servidor. Rode: sudo bash servidor/instalar.sh"
}

valor() {
  grep -E "^$1=" "$CONFIG" | tail -n1 | cut -d= -f2-
}

senha() { openssl rand -hex 24; }

# Espera o site responder pelo endereço público (HTTPS) ou, sem domínio no ar ainda, por dentro.
aguardar_site() {
  local dominio i codigo extra=()
  dominio="$(valor PRISMA_DOMAIN)"
  [ "${PRISMA_TESTE:-}" = "1" ] && extra=(-k)
  info "Aguardando o sistema responder em https://$dominio ..."
  for i in $(seq 1 120); do
    codigo="$(curl -s "${extra[@]}" -o /dev/null -w '%{http_code}' --max-time 5 "https://$dominio/api/health" || true)"
    if [ "$codigo" = "200" ] || [ "$codigo" = "503" ]; then
      ok "Sistema no ar: https://$dominio"
      return 0
    fi
    sleep 3
  done
  aviso "O endereço https://$dominio ainda não respondeu."
  info "Confira se o domínio aponta para este servidor (registro A) e veja os registros com: bash servidor/registros.sh caddy"
  return 1
}

fazer_backup() {
  local destino n=1
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  destino="$BACKUP_DIR/$(date '+%Y-%m-%d_%H%M%S')"
  while [ -e "$destino" ]; do n=$((n + 1)); destino="$BACKUP_DIR/$(date '+%Y-%m-%d_%H%M%S')-$n"; done
  (umask 077; mkdir -p "$destino")
  info "Salvando o banco de dados..."
  (umask 077; dc exec -T postgres pg_dump -U postgres -Fc prisma_os >"$destino/banco.dump")
  info "Salvando fotos, logotipos e arquivos..."
  (umask 077; dc run --rm --no-deps -T web tar -czf - -C /app/storage . >"$destino/arquivos.tgz")
  # A configuração vai junto: sem a APP_SECRET_KEY, as chaves e conexões salvas não abrem.
  (umask 077; cp "$CONFIG" "$destino/config.env"; [ -f "$PASTA/app.env" ] && cp "$PASTA/app.env" "$destino/app.env" || true)
  ok "Backup salvo em: $destino"
  BACKUP_CRIADO="$destino"
}
