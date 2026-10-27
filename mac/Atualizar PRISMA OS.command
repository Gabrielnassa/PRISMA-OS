#!/bin/bash
# Atualiza o PRISMA OS para a versão mais nova, com backup automático antes.
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"

titulo "PRISMA OS — atualizar"
exigir_configuracao
garantir_docker

info "Fazendo backup antes de atualizar..."
fazer_backup

if [ -d "$PASTA_PROJETO/.git" ] && command -v git >/dev/null 2>&1; then
  info "Baixando a versão mais nova..."
  git -C "$PASTA_PROJETO" pull --ff-only
else
  aviso "Esta pasta não veio do git: baixe a versão nova no GitHub (Code > Download ZIP),"
  aviso "descompacte e use os atalhos da pasta nova. Seus dados continuam guardados."
  info "Recompilando com o código desta pasta..."
fi

info "Preparando a nova versão (alguns minutos)..."
compose up -d --build
aguardar_site
ok "PRISMA OS atualizado e rodando em http://localhost:$(porta)"
pausar
