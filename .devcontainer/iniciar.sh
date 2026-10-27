#!/bin/bash
# Roda sempre que o Codespace liga: aplica migrations e sobe o site e o worker
# em segundo plano. Também serve para reiniciar: bash .devcontainer/iniciar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV=production
APP_URL="$(bash .devcontainer/endereco.sh)"
export APP_URL

# Encerra só os processos que este script iniciou antes (grupo de cada um).
for nome in web worker; do
  arquivo="/tmp/prisma-$nome.pid"
  if [ -f "$arquivo" ]; then
    kill -- "-$(cat "$arquivo")" 2>/dev/null || true
    rm -f "$arquivo"
  fi
done

node .devcontainer/esperar-banco.mjs
npm run --silent db:migrate
[ -f .next/BUILD_ID ] || npm run build

setsid nohup npm start -- -p 3000 >/tmp/prisma-web.log 2>&1 </dev/null &
echo $! >/tmp/prisma-web.pid
setsid nohup npm run worker >/tmp/prisma-worker.log 2>&1 </dev/null &
echo $! >/tmp/prisma-worker.pid
echo "PRISMA OS iniciando em $APP_URL (registros em /tmp/prisma-web.log e /tmp/prisma-worker.log)"
