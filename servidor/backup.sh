#!/bin/bash
# Backup do banco, dos arquivos e da configuração. Com --automatico (o do
# agendamento diário), apaga os mais antigos e mantém os 14 últimos
# (PRISMA_BACKUP_MANTER muda a quantidade). Se o rclone estiver configurado
# com o destino em PRISMA_BACKUP_REMOTO (ex.: gdrive:prisma-os), envia uma
# cópia para fora do servidor.
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"
exigir_root
exigir_configuracao
fazer_backup
if [ "${1:-}" = "--automatico" ]; then
  manter="${PRISMA_BACKUP_MANTER:-14}"
  ls -1d "$BACKUP_DIR"/*/ 2>/dev/null | sort -r | tail -n +"$((manter + 1))" | while read -r antigo; do
    rm -rf -- "$antigo"
    info "Backup antigo removido: $antigo"
  done
fi
remoto="${PRISMA_BACKUP_REMOTO:-$(valor PRISMA_BACKUP_REMOTO || true)}"
if [ -n "$remoto" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "$BACKUP_CRIADO" "$remoto/$(basename "$BACKUP_CRIADO")" && ok "Cópia enviada para $remoto"
  else
    aviso "PRISMA_BACKUP_REMOTO definido, mas o rclone não está instalado (apt install rclone)."
  fi
fi
