#!/bin/bash
# Roda antes de os contêineres subirem: cria senhas aleatórias para o banco
# deste Codespace (uma vez). O arquivo fica fora do Git.
set -euo pipefail
arquivo="$(cd "$(dirname "$0")" && pwd)/.env"
[ -f "$arquivo" ] && exit 0
senha() { head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
umask 077
{
  echo "POSTGRES_PASSWORD=$(senha)"
  echo "PRISMA_OWNER_PASSWORD=$(senha)"
  echo "PRISMA_APP_PASSWORD=$(senha)"
} >"$arquivo"
