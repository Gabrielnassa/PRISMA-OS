#!/bin/bash
# Volta o PRISMA OS para um backup feito com "Fazer backup".
# ATENÇÃO: substitui todos os dados atuais pelos do backup escolhido.
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"

titulo "PRISMA OS — restaurar backup"
exigir_configuracao
garantir_docker

escolhido="${1:-}"
if [ -z "$escolhido" ]; then
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -1 "$BACKUP_DIR" 2>/dev/null)" ]; then
    aviso "Nenhum backup encontrado em: $BACKUP_DIR"
    pausar
    exit 1
  fi
  info "Backups disponíveis (do mais recente para o mais antigo):"
  n=0
  for pasta in $(ls -1r "$BACKUP_DIR"); do
    n=$((n + 1))
    printf '  %s) %s\n' "$n" "$pasta"
  done
  read -r -p "Número do backup [1 = mais recente]: " numero
  numero="${numero:-1}"
  escolhido="$BACKUP_DIR/$(ls -1r "$BACKUP_DIR" | sed -n "${numero}p")"
fi
if [ ! -f "$escolhido/banco.dump" ] || [ ! -f "$escolhido/arquivos.tgz" ]; then
  aviso "Backup inválido: $escolhido (faltam banco.dump ou arquivos.tgz)."
  pausar
  exit 1
fi

aviso "Todos os dados atuais serão substituídos pelos do backup:"
info "  $escolhido"
if [ "${PRISMA_CONFIRMAR:-}" != "RESTAURAR" ]; then
  read -r -p "Para continuar, digite RESTAURAR: " confirmacao
  if [ "$confirmacao" != "RESTAURAR" ]; then
    info "Nada foi alterado."
    pausar
    exit 0
  fi
fi

info "Fazendo uma cópia de segurança dos dados atuais antes de restaurar..."
fazer_backup
info "Restaurando o banco de dados..."
compose stop web worker >/dev/null 2>&1 || true
compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c "DROP DATABASE IF EXISTS prisma_os WITH (FORCE)" -c "CREATE DATABASE prisma_os OWNER prisma_owner" >/dev/null
compose exec -T postgres pg_restore -U postgres -d prisma_os --no-owner --role=prisma_owner --exit-on-error <"$escolhido/banco.dump"
info "Restaurando fotos e arquivos..."
compose run --rm --no-deps -T web sh -c 'find /app/storage -mindepth 1 -delete && tar -xzf - -C /app/storage' <"$escolhido/arquivos.tgz"
info "Reiniciando..."
compose up -d
aguardar_site
ok "Backup restaurado. Os dados anteriores ficaram salvos em: $BACKUP_CRIADO"
pausar
