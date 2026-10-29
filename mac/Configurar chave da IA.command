#!/bin/bash
# Define ou troca a chave da IA usada para gerar conteúdo: Claude (Anthropic) ou ChatGPT (OpenAI).
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"

titulo "PRISMA OS — chave da IA"
exigir_configuracao
garantir_docker
provedor="${PRISMA_AI_PROVIDER:-}"
if [ -z "$provedor" ] && interativo; then
  info "Qual IA você quer usar?"
  info "  1) Claude (Anthropic)"
  info "  2) ChatGPT (OpenAI)"
  read -r -p "Escolha 1 ou 2: " opcao || true
  case "$opcao" in
    2) provedor="openai" ;;
    *) provedor="anthropic" ;;
  esac
fi
provedor="${provedor:-anthropic}"
if [ "$provedor" = "openai" ]; then
  chave="$(pedir_chave_openai)"
  config_definir OPENAI_API_KEY "$chave"
else
  chave="$(pedir_chave_anthropic)"
  config_definir ANTHROPIC_API_KEY "$chave"
fi
if [ -n "$chave" ]; then
  config_definir AI_PROVIDER "$provedor"
  ok "Chave salva. IA em uso: $([ "$provedor" = "openai" ] && echo "ChatGPT (OpenAI)" || echo "Claude (Anthropic)")."
else
  config_definir AI_PROVIDER ""
  aviso "Chave removida. Se houver a chave da outra IA, ela passa a ser usada; senão, a geração por IA fica desligada."
fi
info "Aplicando..."
compose up -d
aguardar_site
info "Para confirmar, entre no PRISMA OS e use Integrações > Testar conexão."
pausar
