#!/bin/bash
# Volta o PRISMA OS para um backup (substitui TODOS os dados atuais).
#   sudo bash servidor/restaurar.sh                  (escolhe da lista)
#   sudo bash servidor/restaurar.sh /caminho/backup  (backup específico)
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"
titulo "PRISMA OS: restaurar backup"
exigir_root
exigir_configuracao
escolhido="${1:-}"
if [ -z "$escolhido" ]; then
  [ -n "$(ls -1 "$BACKUP_DIR" 2>/dev/null)" ] || erro "Nenhum backup em $BACKUP_DIR"
  info "Backups (do mais recente para o mais antigo):"
  n=0
  for pasta in $(ls -1r "$BACKUP_DIR"); do n=$((n + 1)); printf '  %s) %s\n' "$n" "$pasta"; done
  read -r -p "Número do backup [1 = mais recente]: " numero
  escolhido="$BACKUP_DIR/$(ls -1r "$BACKUP_DIR" | sed -n "${numero:-1}p")"
fi
[ -f "$escolhido/banco.dump" ] && [ -f "$escolhido/arquivos.tgz" ] || erro "Backup inválido: $escolhido"
aviso "Todos os dados atuais serão substituídos pelos do backup $escolhido"
if [ "${PRISMA_CONFIRMAR:-}" != "RESTAURAR" ]; then
  read -r -p "Para continuar, digite RESTAURAR: " confirmacao
  [ "$confirmacao" = "RESTAURAR" ] || { info "Nada foi alterado."; exit 0; }
fi
info "Cópia de segurança dos dados atuais antes de restaurar..."
fazer_backup
# A chave de criptografia do backup precisa ser a mesma do servidor.
if [ -f "$escolhido/config.env" ]; then
  chave_backup="$(grep -E '^APP_SECRET_KEY=' "$escolhido/config.env" | cut -d= -f2-)"
  if [ -n "$chave_backup" ] && [ "$chave_backup" != "$(valor APP_SECRET_KEY)" ]; then
    aviso "O backup usa outra chave de criptografia. Ela será adotada neste servidor para as chaves e conexões salvas continuarem abrindo."
    sed -i "s#^APP_SECRET_KEY=.*#APP_SECRET_KEY=$chave_backup#" "$CONFIG"
  fi
fi
dc stop web worker >/dev/null 2>&1 || true
dc exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "DROP DATABASE IF EXISTS prisma_os WITH (FORCE)" -c "CREATE DATABASE prisma_os OWNER prisma_owner" >/dev/null
dc exec -T postgres pg_restore -U postgres -d prisma_os --no-owner --role=prisma_owner --exit-on-error <"$escolhido/banco.dump"
dc run --rm --no-deps -T web sh -c 'find /app/storage -mindepth 1 -delete && tar -xzf - -C /app/storage' <"$escolhido/arquivos.tgz"
dc up -d
aguardar_site
ok "Backup restaurado. Os dados anteriores ficaram em: $BACKUP_CRIADO"
