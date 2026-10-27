#!/bin/bash
# Define uma nova senha para uma conta (por exemplo, se você esqueceu a sua).
# Também libera o bloqueio por tentativas e encerra as sessões abertas dessa conta.
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"

titulo "PRISMA OS — redefinir senha"
exigir_configuracao
garantir_docker
email="${PRISMA_EMAIL:-}"
while [ -z "$email" ]; do read -r -p "E-mail da conta: " email; done
compose up -d postgres >/dev/null
compose run --rm --no-deps -e NEW_PASSWORD web npm run --silent user:reset-password -- --email "$email"
pausar
