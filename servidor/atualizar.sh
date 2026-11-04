#!/bin/bash
# Atualiza para a versão mais nova do GitHub: faz backup, baixa, reconstrói e
# reinicia (as migrations do banco rodam sozinhas antes do site subir).
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"
titulo "PRISMA OS: atualização"
exigir_root
exigir_configuracao
fazer_backup
git -C "$RAIZ" pull --ff-only
dc build
dc up -d --remove-orphans
aguardar_site
docker image prune -f >/dev/null 2>&1 || true
ok "Atualizado. Backup anterior à atualização: $BACKUP_CRIADO"
