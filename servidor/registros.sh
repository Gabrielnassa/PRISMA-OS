#!/bin/bash
# Mostra os registros recentes: bash servidor/registros.sh [web|worker|caddy|postgres]
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"
exigir_configuracao
dc ps
dc logs --tail 120 "${@:-web}"
