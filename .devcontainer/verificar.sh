#!/bin/bash
# Mostra numa tela só se o PRISMA OS está no ar e, se não estiver, o motivo.
# Rode no Terminal do Codespace: bash .devcontainer/verificar.sh
cd "$(dirname "$0")/.."

ok() { printf '  [ok]    %s\n' "$1"; }
falha() { printf '  [FALHA] %s\n' "$1"; }
problemas=0

echo "== PRISMA OS: verificação =="
echo "  Versão: $(git log -1 --format='%h de %cd' --date=format:'%d/%m/%Y %H:%M' 2>/dev/null) (ramo $(git branch --show-current 2>/dev/null))"
echo "  Endereço: $(bash .devcontainer/endereco.sh)"
echo

# Arquivos do sistema mudados aqui dentro (à mão ou por um assistente) e que
# não vieram do GitHub: a causa mais comum de o PRISMA OS parar de ligar.
alterados="$(git status --porcelain --untracked-files=no 2>/dev/null)"
if [ -n "$alterados" ]; then
  falha "Arquivos do sistema alterados neste Codespace (não vieram do GitHub):"
  printf '%s\n' "$alterados" | sed 's/^/          /'
  echo "        Para guardar essas alterações à parte e voltar à versão do GitHub:"
  echo "          git stash && bash .devcontainer/iniciar.sh"
  echo "        (para recuperá-las depois: git stash pop)"
  problemas=1
fi

if node .devcontainer/esperar-banco.mjs --uma-vez >/dev/null 2>&1; then
  ok "Banco de dados respondendo"
else
  falha "Banco de dados não responde"
  problemas=1
fi

if [ -f .next/BUILD_ID ]; then
  ok "Site construído (build)"
else
  falha "Site ainda não construído"
  problemas=1
fi

for nome in web worker; do
  rotulo="Site"
  [ "$nome" = worker ] && rotulo="Worker (gera as peças e publica)"
  arquivo="/tmp/prisma-$nome.pid"
  if [ -f "$arquivo" ] && kill -0 "$(cat "$arquivo")" 2>/dev/null; then
    ok "$rotulo rodando"
  else
    falha "$rotulo parado"
    problemas=1
  fi
done

saude="$(curl -s --max-time 5 http://localhost:3000/api/health || true)"
if [ -n "$saude" ]; then
  ok "Site responde em localhost:3000"
  echo "        $saude"
else
  falha "Site não responde em localhost:3000"
  problemas=1
fi

echo
if [ "$problemas" = 0 ]; then
  echo "Tudo no ar. Se o navegador mostra \"HTTP ERROR 401\", o bloqueio é do GitHub, não do"
  echo "PRISMA OS: abra pela aba Portas (Ports) > linha PRISMA OS (3000) > ícone de globo."
  echo "Se ainda assim der 401, saia e entre de novo em github.com e repita."
else
  echo "Algo está parado. Para religar, rode:"
  echo "  bash .devcontainer/iniciar.sh"
  echo
  echo "-- Últimas mensagens do site (/tmp/prisma-web.log) --"
  tail -n 15 /tmp/prisma-web.log 2>/dev/null || echo "  (sem registro: o site não foi iniciado neste Codespace)"
  echo "-- Últimas mensagens do worker (/tmp/prisma-worker.log) --"
  tail -n 8 /tmp/prisma-worker.log 2>/dev/null || echo "  (sem registro)"
fi
exit "$problemas"
