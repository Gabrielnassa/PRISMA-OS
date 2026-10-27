#!/bin/bash
# Roda uma vez, quando o Codespace é criado: dependências, banco e build.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== PRISMA OS: preparando (alguns minutos) =="
npm ci --no-audit --no-fund
node .devcontainer/esperar-banco.mjs
npm run db:migrate
APP_URL="$(bash .devcontainer/endereco.sh)" NODE_ENV=production npm run build
echo "== Preparação concluída =="
