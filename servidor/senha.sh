#!/bin/bash
# Gera uma senha temporária nova para quem esqueceu: sudo bash servidor/senha.sh email@dominio.com
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"
exigir_root
exigir_configuracao
[ -n "${1:-}" ] || erro "Uso: sudo bash servidor/senha.sh email@dominio.com"
dc run --rm --no-deps web npm run --silent user:reset-password -- --email "$1"
