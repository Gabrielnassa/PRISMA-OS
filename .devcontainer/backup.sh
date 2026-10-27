#!/bin/bash
# Salva banco e arquivos em backups/<data>/ (mesmo formato do backup do Mac:
# dá para restaurar com "Restaurar backup" na instalação local).
set -euo pipefail
cd "$(dirname "$0")/.."
if ! pg_dump --version 2>/dev/null | grep -q " 16\."; then
  echo "Backup indisponível: o cliente do PostgreSQL 16 não foi instalado neste Codespace."
  echo "Recrie o Codespace (ou use a instalação no Mac, que faz backup pelo próprio banco)."
  exit 1
fi
destino="backups/$(date '+%Y-%m-%d_%H%M%S')"
n=1
while [ -e "$destino" ]; do n=$((n + 1)); destino="backups/$(date '+%Y-%m-%d_%H%M%S')-$n"; done
mkdir -p "$destino" storage
PGPASSWORD="$PRISMA_DB_SUPERUSER_PASSWORD" pg_dump -U postgres -Fc prisma_os >"$destino/banco.dump"
tar -czf "$destino/arquivos.tgz" -C storage .
echo "Backup salvo em $destino"
echo "Para baixar: no painel de arquivos à esquerda, clique com o botão direito na pasta e escolha Download."
