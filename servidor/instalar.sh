#!/bin/bash
# Instala o PRISMA OS num servidor Ubuntu (VPS da Hostinger ou outro), com
# HTTPS automático, backup diário e o primeiro acesso. Pode rodar de novo
# sem perder nada: o que já foi feito é mantido.
#
#   sudo bash servidor/instalar.sh
#
# Sem perguntas (automação): PRISMA_DOMAIN=app.agencia.com.br PRISMA_TLS_EMAIL=voce@agencia.com.br sudo -E bash servidor/instalar.sh
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"

titulo "PRISMA OS: instalação no servidor"
exigir_root

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  info "Instalando o Docker (script oficial em get.docker.com)..."
  command -v curl >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq curl; }
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || erro "O Docker Compose não está disponível. Instale o pacote docker-compose-plugin e rode de novo."
command -v openssl >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq openssl; }
ok "Docker pronto."

# 2. Firewall (se estiver ligado): libera só a web; o SSH continua liberado.
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow OpenSSH >/dev/null || true
  ufw allow 80/tcp >/dev/null
  ufw allow 443 >/dev/null
  ok "Firewall: portas 80 e 443 liberadas."
fi

# 3. Configuração (uma vez)
if [ ! -f "$CONFIG" ]; then
  dominio="${PRISMA_DOMAIN:-}"
  while ! [[ "$dominio" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] && [ "$dominio" != "localhost" ]; do
    read -r -p "Endereço do sistema (ex.: app.suaagencia.com.br): " dominio
    dominio="$(echo "$dominio" | tr '[:upper:]' '[:lower:]' | sed -E 's#^https?://##; s#/.*$##')"
  done
  email="${PRISMA_TLS_EMAIL:-}"
  while ! [[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; do
    read -r -p "Seu e-mail (avisos do certificado HTTPS): " email
  done
  if [ "$dominio" != "localhost" ] && command -v getent >/dev/null 2>&1; then
    ip_dominio="$(getent ahostsv4 "$dominio" | awk 'NR==1 {print $1}' || true)"
    ip_servidor="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
    if [ -z "$ip_dominio" ]; then
      aviso "O domínio $dominio ainda não aponta para nenhum servidor. Crie um registro A com o IP ${ip_servidor:-deste servidor} no painel do domínio."
    elif [ -n "$ip_servidor" ] && [ "$ip_dominio" != "$ip_servidor" ]; then
      aviso "O domínio $dominio aponta para $ip_dominio, mas este servidor é $ip_servidor. O HTTPS só funciona quando apontar para cá."
    else
      ok "O domínio $dominio aponta para este servidor."
    fi
  fi
  (
    umask 077
    {
      echo "# Configuração do PRISMA OS neste servidor ($(date '+%d/%m/%Y %H:%M'))."
      echo "# Não apague nem compartilhe. Vai junto em cada backup."
      echo "PRISMA_DOMAIN=$dominio"
      echo "PRISMA_TLS_EMAIL=$email"
      echo "POSTGRES_PASSWORD=$(senha)"
      echo "PRISMA_OWNER_PASSWORD=$(senha)"
      echo "PRISMA_APP_PASSWORD=$(senha)"
      echo "APP_SECRET_KEY=$(openssl rand -hex 32)"
    } >"$CONFIG"
  )
  ok "Configuração criada em $CONFIG"
fi
if [ ! -f "$PASTA/app.env" ]; then
  (
    umask 077
    cat >"$PASTA/app.env" <<'MODELO'
# Chaves opcionais do PRISMA OS. Depois de editar: bash servidor/reiniciar.sh
# As chaves das redes sociais e o e-mail também podem ser salvos pela tela de Integrações.
# Claude (Anthropic) ou ChatGPT (OpenAI): uma das duas para gerar textos com IA.
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
# Google Drive (conta de serviço, JSON em base64)
GOOGLE_SERVICE_ACCOUNT_JSON=
MODELO
  )
fi

# 4. Sobe tudo
info "Preparando o sistema (a primeira vez leva alguns minutos)..."
# PRISMA_SEM_BUILD=1 usa a imagem já construída (ex.: testes).
if [ "${PRISMA_SEM_BUILD:-}" = "1" ]; then
  dc up -d --no-build
else
  dc build
  dc up -d
fi
aguardar_site || true

# 5. Primeiro acesso (só se ainda não houver agência cadastrada)
agencias="$(dc exec -T postgres psql -U postgres -d prisma_os -tAc "SELECT count(*) FROM organizations" 2>/dev/null | tr -d '[:space:]' || echo 0)"
if [ "${agencias:-0}" = "0" ]; then
  titulo "Primeiro acesso: crie a sua conta de administrador"
  if [ -n "${PRISMA_ADMIN_EMAIL:-}" ]; then
    dc run --rm --no-deps -T -e ADMIN_PASSWORD web npm run --silent admin:create -- --org "${PRISMA_ADMIN_ORG:?}" --name "${PRISMA_ADMIN_NOME:?}" --email "$PRISMA_ADMIN_EMAIL"
  else
    dc run --rm --no-deps web npm run --silent admin:create
  fi
fi

# 6. Backup diário às 03:17 (guarda os 14 mais recentes)
if [ "${PRISMA_SEM_AGENDAMENTO:-}" = "1" ]; then
  aviso "Backup diário não agendado (PRISMA_SEM_AGENDAMENTO=1)."
else
  cat >/etc/cron.d/prisma-os <<CRON
# Backup diário do PRISMA OS (banco, arquivos e configuração).
17 3 * * * root bash $PASTA/backup.sh --automatico >>/var/log/prisma-os-backup.log 2>&1
CRON
  chmod 644 /etc/cron.d/prisma-os
  ok "Backup diário agendado (03:17). Pasta: $BACKUP_DIR"
fi

titulo "Pronto"
info "Acesse: https://$(valor PRISMA_DOMAIN)"
info "Convide seu sócio em Equipe. Atualizar: sudo bash servidor/atualizar.sh"
