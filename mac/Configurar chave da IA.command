#!/bin/bash
# Define ou troca a chave da API Anthropic usada para gerar conteúdo com IA.
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"

titulo "PRISMA OS — chave da IA"
exigir_configuracao
garantir_docker
chave="$(pedir_chave_anthropic)"
config_definir ANTHROPIC_API_KEY "$chave"
if [ -n "$chave" ]; then
  ok "Chave salva."
else
  aviso "Chave removida: a geração por IA fica desligada até você configurar uma nova."
fi
info "Aplicando..."
compose up -d
aguardar_site
info "Para confirmar, entre no PRISMA OS e use Integrações > Testar conexão."
pausar
