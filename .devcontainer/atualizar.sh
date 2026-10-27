#!/bin/bash
# Atualiza para a versão mais nova do GitHub e reinicia (faz backup antes).
set -euo pipefail
cd "$(dirname "$0")/.."
bash .devcontainer/backup.sh
git pull --ff-only
npm ci --no-audit --no-fund
APP_URL="$(bash .devcontainer/endereco.sh)" NODE_ENV=production npm run build
bash .devcontainer/iniciar.sh
