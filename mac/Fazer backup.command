#!/bin/bash
# Copia o banco de dados e os arquivos (fotos, logotipos) para a pasta de backups.
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"

titulo "PRISMA OS — backup"
exigir_configuracao
garantir_docker
fazer_backup
info "Guarde também uma cópia fora deste computador (HD externo ou nuvem)."
pausar
