#!/bin/bash
# Roda uma vez, quando o Codespace é criado: dependências, banco e build.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== PRISMA OS: preparando (alguns minutos) =="
. .devcontainer/_versao.sh
dependencias_em_dia
node .devcontainer/esperar-banco.mjs
npm run db:migrate
APP_URL="$(bash .devcontainer/endereco.sh)"
export APP_URL
build_em_dia
echo "== Preparação concluída =="
