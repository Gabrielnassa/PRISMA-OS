#!/bin/bash
# Roda sempre que o Codespace liga: aplica migrations e sobe o site e o worker
# em segundo plano. Também serve para reiniciar: bash .devcontainer/iniciar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# O Codespace fecha o terminal do postStartCommand assim que este script
# termina, e o fechamento manda SIGHUP para os processos dele. Ignorar o sinal
# aqui faz o site e o worker já nascerem imunes (o setsid/nohup sozinho chega
# tarde se o terminal fechar antes de eles rodarem).
trap '' HUP
export NODE_ENV=production
APP_URL="$(bash .devcontainer/endereco.sh)"
export APP_URL
# Chave que criptografa as chaves dos apps e as conexões no banco: criada uma
# vez e guardada fora do Git (perder o arquivo obriga a salvar as chaves de novo).
if [ -z "${APP_SECRET_KEY:-}" ]; then
  if [ ! -s .devcontainer/.chave-secreta ]; then
    (umask 077; head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' >.devcontainer/.chave-secreta)
  fi
  APP_SECRET_KEY="$(cat .devcontainer/.chave-secreta)"
  export APP_SECRET_KEY
fi

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
echo "PRISMA OS iniciando (registros em /tmp/prisma-web.log e /tmp/prisma-worker.log)..."

# Só termina com o site respondendo: assim o Codespace só fica pronto com o
# sistema no ar, e uma falha aparece aqui (e no log de criação).
for _ in $(seq 1 90); do
  codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://localhost:3000/api/health || true)"
  if [ "$codigo" = "200" ] || [ "$codigo" = "503" ]; then
    echo "PRISMA OS no ar em $APP_URL"
    exit 0
  fi
  sleep 2
done
echo "O PRISMA OS não respondeu a tempo. Últimas mensagens do site:"
tail -n 30 /tmp/prisma-web.log || true
exit 1
