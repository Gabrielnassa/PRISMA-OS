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

# O iniciar.sh instala as dependências e refaz o build quando a versão mudou
# (build do zero: nada da versão anterior fica misturado).
bash .devcontainer/iniciar.sh
