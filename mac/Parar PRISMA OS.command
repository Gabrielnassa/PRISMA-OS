#!/bin/bash
# Desliga o PRISMA OS. Os dados continuam guardados; para voltar, use "Iniciar PRISMA OS".
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"

titulo "PRISMA OS — parar"
exigir_configuracao
garantir_docker
compose down
ok "PRISMA OS desligado. Seus dados continuam guardados."
pausar
