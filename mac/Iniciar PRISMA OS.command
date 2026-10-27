#!/bin/bash
# Inicia o PRISMA OS neste computador e abre no navegador.
# Na primeira vez: cria a configuração, prepara o sistema (alguns minutos) e o seu acesso.
source "$(cd "$(dirname "$0")" && pwd)/_comum.sh"

titulo "PRISMA OS — iniciar"
garantir_docker
primeira_configuracao
info "Iniciando. Na primeira vez a preparação leva alguns minutos; nas próximas, segundos."
compose up -d
aguardar_site
criar_administrador_se_preciso
abrir_navegador
printf '\n'
ok "PRISMA OS rodando em http://localhost:$(porta)"
info "Pode fechar esta janela: o sistema continua rodando enquanto o Docker estiver aberto."
info "Para desligar, use o atalho \"Parar PRISMA OS\"."
pausar
