#!/bin/bash
# Funções compartilhadas pelos atalhos do PRISMA OS para Mac.
# Compatível com o bash 3.2 do macOS (sem recursos do bash 4+).
#
# Variáveis opcionais (automação e testes):
#   PRISMA_CONFIG_DIR   pasta da configuração (padrão: ~/.prisma-os)
#   PRISMA_BACKUP_DIR   pasta dos backups (padrão: ~/Documents/PRISMA OS Backups)
#   PRISMA_NAO_ABRIR=1  não abre o navegador
#   PRISMA_SEM_PAUSA=1  não espera Enter no final

set -euo pipefail

PASTA_MAC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASTA_PROJETO="$(cd "$PASTA_MAC/.." && pwd)"
CONFIG_DIR="${PRISMA_CONFIG_DIR:-$HOME/.prisma-os}"
CONFIG="$CONFIG_DIR/config.env"
BACKUP_DIR="${PRISMA_BACKUP_DIR:-$HOME/Documents/PRISMA OS Backups}"

titulo() {
  printf '\n\033[1;35m%s\033[0m\n' "$1"
  printf '%s\n\n' "------------------------------------------------------------"
}

info() { printf '%s\n' "$1"; }
aviso() { printf '\033[1;33m%s\033[0m\n' "$1"; }
ok() { printf '\033[1;32m%s\033[0m\n' "$1"; }

pausar() {
  if [ "${PRISMA_SEM_PAUSA:-}" != "1" ] && [ -t 0 ]; then
    printf '\n'
    read -r -p "Pressione Enter para fechar esta janela." _ || true
  fi
}

falhou() {
  printf '\n\033[1;31m%s\033[0m\n' "Algo deu errado (linha $1). Veja as mensagens acima."
  info "Se não souber o que fazer, tire um print desta janela e peça ajuda."
  pausar
}
trap 'falhou $LINENO' ERR

interativo() { [ -t 0 ]; }

# Lê um valor do arquivo de configuração (sem executá-lo).
config_valor() {
  if [ -f "$CONFIG" ]; then
    grep -E "^$1=" "$CONFIG" | tail -n 1 | cut -d= -f2-
  fi
}

porta() {
  local p
  p="$(config_valor PRISMA_PORT)"
  printf '%s' "${p:-3000}"
}

compose() {
  docker compose --project-directory "$PASTA_MAC" -f "$PASTA_MAC/compose.yml" --env-file "$CONFIG" "$@"
}

garantir_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    aviso "O Docker Desktop não está instalado."
    info "Instale em https://www.docker.com/products/docker-desktop/ , abra o Docker uma vez"
    info "e depois rode este atalho de novo."
    pausar
    exit 1
  fi
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  info "Abrindo o Docker Desktop..."
  if command -v open >/dev/null 2>&1; then
    open -a Docker >/dev/null 2>&1 || true
  fi
  local i=0
  while ! docker info >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 90 ]; then
      aviso "O Docker não respondeu. Abra o Docker Desktop, espere ficar pronto e rode este atalho de novo."
      pausar
      exit 1
    fi
    sleep 2
  done
  ok "Docker pronto."
}

gerar_senha() {
  openssl rand -hex 24
}

porta_livre() {
  ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

escolher_porta() {
  local p
  for p in 3000 3010 3020 3030 3040 3050; do
    if porta_livre "$p"; then
      printf '%s' "$p"
      return 0
    fi
  done
  printf '%s' "3060"
}

# Grava/atualiza uma linha CHAVE=valor no arquivo de configuração.
config_definir() {
  local chave="$1" valor="$2" tmp
  tmp="$(mktemp "$CONFIG_DIR/.config.XXXXXX")"
  if [ -f "$CONFIG" ]; then
    grep -v -E "^$chave=" "$CONFIG" >"$tmp" || true
  fi
  printf '%s=%s\n' "$chave" "$valor" >>"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$CONFIG"
}

# Imprime só a chave na saída padrão; as mensagens vão para a tela (stderr),
# porque a função é chamada dentro de $(...).
pedir_chave_anthropic() {
  local chave=""
  if [ -n "${PRISMA_ANTHROPIC_KEY+x}" ]; then
    chave="$PRISMA_ANTHROPIC_KEY"
  elif interativo; then
    {
      info "Cole a chave da API Anthropic (começa com sk-ant-) e tecle Enter."
      info "Ela não aparece na tela enquanto você cola. Sem chave agora? Só tecle Enter:"
      info "dá para criar peças pelos templates e configurar a chave depois."
    } >&2
    read -r -s -p "Chave: " chave || true
    printf '\n' >&2
  fi
  chave="$(printf '%s' "$chave" | tr -d '[:space:]')"
  if [ -n "$chave" ] && [ "${chave#sk-ant-}" = "$chave" ]; then
    aviso "Atenção: a chave não começa com sk-ant-. Confira no Console da Anthropic se copiou a chave certa." >&2
  fi
  printf '%s' "$chave"
}

primeira_configuracao() {
  if [ -f "$CONFIG" ]; then
    return 0
  fi
  info "Primeira execução: preparando a configuração."
  mkdir -p "$CONFIG_DIR"
  chmod 700 "$CONFIG_DIR"
  local chave porta_escolhida
  chave="$(pedir_chave_anthropic)"
  porta_escolhida="$(escolher_porta)"
  (
    umask 077
    {
      echo "# Configuração local do PRISMA OS (criada em $(date '+%d/%m/%Y %H:%M'))."
      echo "# As senhas abaixo protegem o banco de dados deste computador. Não apague este arquivo."
      echo "POSTGRES_PASSWORD=$(gerar_senha)"
      echo "PRISMA_OWNER_PASSWORD=$(gerar_senha)"
      echo "PRISMA_APP_PASSWORD=$(gerar_senha)"
      echo "PRISMA_PORT=$porta_escolhida"
      echo "ANTHROPIC_API_KEY=$chave"
    } >"$CONFIG"
  )
  ok "Configuração salva em $CONFIG"
}

exigir_configuracao() {
  if [ ! -f "$CONFIG" ]; then
    aviso "O PRISMA OS ainda não foi configurado neste computador."
    info "Use primeiro o atalho \"Iniciar PRISMA OS\"."
    pausar
    exit 1
  fi
}

aguardar_site() {
  local url="http://localhost:$(porta)/api/health" i=0 codigo
  info "Aguardando o sistema responder em http://localhost:$(porta) ..."
  while true; do
    codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
    if [ "$codigo" = "200" ]; then
      ok "Sistema no ar."
      return 0
    fi
    if [ "$codigo" = "503" ]; then
      aviso "O sistema respondeu, mas a verificação de saúde apontou um problema."
      info "Depois de entrar, veja os detalhes em Integrações."
      return 0
    fi
    i=$((i + 1))
    if [ "$i" -gt 120 ]; then
      aviso "O sistema não respondeu a tempo. Últimas mensagens:"
      compose logs --tail 40 web migrate || true
      return 1
    fi
    sleep 2
  done
}

total_usuarios() {
  compose exec -T postgres psql -U postgres -d prisma_os -tAc "SELECT count(*) FROM users" 2>/dev/null | tr -d '[:space:]'
}

criar_administrador_se_preciso() {
  local total
  total="$(total_usuarios || true)"
  if [ "${total:-0}" != "0" ]; then
    return 0
  fi
  titulo "Criar o seu acesso de administrador"
  local org="${PRISMA_ADMIN_ORG:-}" nome="${PRISMA_ADMIN_NOME:-}" email="${PRISMA_ADMIN_EMAIL:-}" tentativa=1
  while true; do
    while [ -z "$org" ]; do read -r -p "Nome da agência: " org; done
    while [ -z "$nome" ]; do read -r -p "Seu nome: " nome; done
    while [ -z "$email" ]; do read -r -p "Seu e-mail (será o login): " email; done
    if compose run --rm --no-deps -e ADMIN_PASSWORD web npm run --silent admin:create -- --org "$org" --name "$nome" --email "$email"; then
      ok "Acesso criado. Entre com $email e a senha que você definiu."
      return 0
    fi
    tentativa=$((tentativa + 1))
    if [ "$tentativa" -gt 3 ] || ! interativo; then
      return 1
    fi
    aviso "Vamos tentar de novo. Confira o e-mail e a senha."
    # O e-mail é pedido de novo (pode ter sido o erro); agência e nome são mantidos.
    [ -n "${PRISMA_ADMIN_EMAIL:-}" ] || email=""
  done
}

abrir_navegador() {
  local url="http://localhost:$(porta)"
  if [ "${PRISMA_NAO_ABRIR:-}" != "1" ] && command -v open >/dev/null 2>&1; then
    open "$url"
  fi
}

fazer_backup() {
  local destino n=1
  destino="$BACKUP_DIR/$(date '+%Y-%m-%d_%H%M%S')"
  # Nunca sobrescreve um backup feito no mesmo segundo.
  while [ -e "$destino" ]; do
    n=$((n + 1))
    destino="$BACKUP_DIR/$(date '+%Y-%m-%d_%H%M%S')-$n"
  done
  mkdir -p "$destino"
  info "Salvando o banco de dados..."
  compose up -d postgres >/dev/null
  local i=0
  until compose exec -T postgres pg_isready -U postgres -d prisma_os >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -gt 60 ] && { aviso "O banco não ficou pronto."; return 1; }
    sleep 2
  done
  compose exec -T postgres pg_dump -U postgres -Fc prisma_os >"$destino/banco.dump"
  info "Salvando fotos, logotipos e arquivos..."
  compose run --rm --no-deps -T web tar -czf - -C /app/storage . >"$destino/arquivos.tgz"
  ok "Backup salvo em: $destino"
  BACKUP_CRIADO="$destino"
}
