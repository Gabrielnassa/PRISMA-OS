#!/bin/bash
# Atualiza para a versão mais nova do GitHub e reinicia (faz backup antes).
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'echo; echo "A atualização parou antes do fim (veja a mensagem acima). Rode de novo: bash .devcontainer/atualizar.sh"' ERR

bash .devcontainer/backup.sh
git pull --ff-only

# Para o site e o worker antes de reconstruir: o site antigo no ar durante o
# build passa a pedir arquivos de estilo que o build apaga, e as páginas
# aparecem sem nenhum visual.
for nome in web worker; do
  arquivo="/tmp/prisma-$nome.pid"
  if [ -f "$arquivo" ]; then
    kill -- "-$(cat "$arquivo")" 2>/dev/null || true
    rm -f "$arquivo"
  fi
done
echo "Site parado para a atualização (volta sozinho no fim)."

npm ci --no-audit --no-fund
# Build do zero: nada da versão anterior fica misturado.
rm -rf .next
APP_URL="$(bash .devcontainer/endereco.sh)" NODE_ENV=production npm run build
bash .devcontainer/iniciar.sh
