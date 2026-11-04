#!/bin/bash
# Reinicia o sistema (por exemplo, depois de editar servidor/app.env).
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"
exigir_root
exigir_configuracao
dc up -d --force-recreate web worker
aguardar_site
