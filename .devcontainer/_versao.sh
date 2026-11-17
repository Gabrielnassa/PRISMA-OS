#!/bin/bash
# Funções compartilhadas pelos scripts do Codespace: mantêm as dependências e o
# build de acordo com a versão do código, mesmo depois de um `git pull` feito à
# mão (sem elas, o site antigo continuaria no ar ou o build falharia por falta
# de um pacote novo).

# Instala as dependências se o package-lock.json mudou desde a última instalação.
dependencias_em_dia() {
  local hash
  hash="$(sha256sum package-lock.json | cut -d' ' -f1)"
  if [ ! -d node_modules ] || [ "$(cat node_modules/.prisma-lock-hash 2>/dev/null)" != "$hash" ]; then
    echo "Instalando as dependências desta versão..."
    # Sem NODE_ENV=production: o build precisa das dependências de desenvolvimento.
    env -u NODE_ENV npm ci --no-audit --no-fund
    echo "$hash" >node_modules/.prisma-lock-hash
  fi
}

# Constrói o site se não houver build ou se ele for de outra versão do código.
build_em_dia() {
  local commit
  commit="$(git rev-parse HEAD 2>/dev/null || echo sem-git)"
  if [ ! -f .next/BUILD_ID ] || [ "$(cat .next/PRISMA_COMMIT 2>/dev/null)" != "$commit" ]; then
    echo "Construindo o site desta versão (cerca de 2 minutos)..."
    rm -rf .next
    NODE_ENV=production npm run build
    echo "$commit" >.next/PRISMA_COMMIT
  fi
}
