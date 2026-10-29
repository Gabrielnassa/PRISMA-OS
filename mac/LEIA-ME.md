# PRISMA OS no seu Mac

Este guia instala o PRISMA OS no seu próprio computador, para uso interno da agência. Nada fica aberto na internet: por padrão, só este Mac acessa o sistema, em `http://localhost:3000`.

## O que você precisa

- Um Mac com pelo menos 8 GB de memória e 10 GB livres em disco.
- Internet na instalação (para baixar o Docker e preparar o sistema).
- Opcional: uma chave da API Anthropic, para gerar textos com IA. Sem ela, você cria as peças a partir dos templates e escreve os textos no editor.

## 1. Instalar o Docker Desktop (uma vez)

O Docker é o programa que roda o banco de dados e o PRISMA OS por baixo dos panos.

1. Veja qual é o chip do seu Mac: menu Apple  > **Sobre Este Mac** ("Chip Apple M…" ou "Processador Intel").
2. Baixe o Docker Desktop da versão certa em https://www.docker.com/products/docker-desktop/ e instale como qualquer app (arraste para Aplicativos).
3. Abra o Docker uma vez e aceite os termos. Não precisa criar conta.
4. Recomendado: em **Docker > Settings > General**, marque **"Start Docker Desktop when you sign in to your computer"**. Assim o PRISMA OS volta sozinho quando você liga o Mac.

## 2. Baixar o PRISMA OS

Escolha um dos jeitos.

**Pelo navegador (mais simples).** No GitHub do projeto, clique em **Code > Download ZIP**, descompacte e mova a pasta para a sua pasta pessoal (a do ícone de casinha no Finder). Não deixe na pasta Downloads.

**Pelo Terminal (facilita as atualizações).** Abra o Terminal (⌘ + espaço, digite "Terminal") e cole:

```bash
git clone -b claude/session-vagl59 https://github.com/gabrielnassa/PRISMA-OS.git ~/PRISMA-OS && open ~/PRISMA-OS/mac
```

Se o Mac pedir para instalar as "ferramentas de linha de comando", aceite e rode o comando de novo. Se o repositório for privado, o GitHub vai pedir login.

## 3. Primeira vez: iniciar

Abra a pasta **`mac`** e dê dois cliques em **Iniciar PRISMA OS**.

> **Se o Mac disser que não pode abrir o arquivo** ("desenvolvedor não identificado"), isso acontece com arquivos baixados pelo navegador. Clique em **OK**, abra **Ajustes do Sistema > Privacidade e Segurança**, role até a mensagem sobre o "Iniciar PRISMA OS" e clique em **Abrir Mesmo Assim**. Outra forma, que libera todos os atalhos de uma vez: no Terminal, rode `xattr -dr com.apple.quarantine ~/PRISMA-OS` (ajuste o caminho se a pasta estiver em outro lugar).

Uma janela do Terminal vai conduzir a instalação:

1. **Chave da Anthropic**: cole a chave e tecle Enter (ela não aparece na tela). Sem chave agora? Só tecle Enter.
2. **Preparação**: na primeira vez leva de 5 a 15 minutos. Nas próximas, segundos.
3. **Seu acesso**: nome da agência, seu nome, seu e-mail e uma senha (pelo menos 10 caracteres, com letras e números, digitada duas vezes).
4. O navegador abre em **http://localhost:3000**. Entre com o e-mail e a senha que você definiu. Vale salvar o endereço nos favoritos.

Se a porta 3000 já estiver em uso no seu Mac, o atalho escolhe outra (3010, 3020…) e mostra o endereço no final.

## Uso no dia a dia

| Atalho (pasta `mac`) | Para quê |
| --- | --- |
| **Iniciar PRISMA OS** | Liga o sistema e abre no navegador |
| **Parar PRISMA OS** | Desliga o sistema. Os dados continuam guardados |
| **Configurar chave da IA** | Coloca, troca ou remove a chave da Anthropic |
| **Fazer backup** | Salva banco de dados e arquivos em Documentos > PRISMA OS Backups |
| **Restaurar backup** | Volta para um backup (pede confirmação e guarda antes os dados atuais) |
| **Atualizar PRISMA OS** | Instala a versão mais nova (faz backup antes) |
| **Redefinir senha** | Define uma senha nova para uma conta, se alguém esquecer a sua |

Com o Docker aberto, o PRISMA OS continua rodando mesmo se você fechar a janela do Terminal, e volta sozinho quando o Mac reinicia.

## Chave da IA e custos

- Crie a chave no Console da Anthropic (platform.claude.com). Recomendado: um workspace só para o PRISMA OS e um **limite de gasto mensal**.
- O uso é cobrado na conta dona da chave, separado da assinatura do Claude.
- Gastam créditos: "Gerar com IA", "Sugerir pautas", "Revisar com IA" e "Testar conexão". Editar, renderizar, exportar, o controle de qualidade e criar pelo template não gastam.
- O custo de cada geração aparece em **Custos e consumo**. Dá para definir um teto mensal por cliente.
- Depois de configurar a chave, confirme em **Integrações > Testar conexão**.

## Backups

- Faça backup com frequência (por exemplo, toda sexta) e **copie a pasta "PRISMA OS Backups" para fora do Mac** (HD externo ou nuvem). Um backup que só existe no mesmo computador não protege contra perda ou defeito do Mac.
- Cada backup é uma pasta com data e hora, com dois arquivos: `banco.dump` (clientes, conteúdos, versões, aprovações) e `arquivos.tgz` (fotos, logotipos, documentos).
- Para trocar de Mac: instale no Mac novo (passos 1 a 3), copie a pasta de backups e use **Restaurar backup**.

## Onde ficam as coisas

- **Configuração e senhas do banco**: `~/.prisma-os/config.env` (pasta oculta na sua pasta pessoal). Não apague. Sem ela, o banco atual não abre (os backups continuam restauráveis numa instalação nova).
- **Dados**: dentro do Docker, nos volumes `prisma-os_pgdata` (banco) e `prisma-os_storage` (arquivos).

> **Cuidado no Docker Desktop:** não apague esses volumes e não use "Clean / Purge data" nem "Reset to factory defaults" sem antes fazer backup. Essas opções apagam todos os dados do PRISMA OS.

## Dar acesso à equipe (opcional, depois)

Por padrão, só este Mac acessa. Para outra pessoa da agência usar de outro lugar, sem abrir para a internet, um caminho seguro é o **Tailscale** (rede privada entre os seus aparelhos, com plano gratuito para poucas pessoas):

1. Instale o Tailscale no seu Mac e no computador da outra pessoa, na mesma conta/rede.
2. Acrescente ao arquivo `~/.prisma-os/config.env` (troque pelo nome do seu Mac no Tailscale):
   ```
   PRISMA_BIND=0.0.0.0
   PRISMA_APP_URL=http://nome-do-seu-mac.sua-rede.ts.net:3000
   ```
3. Rode **Iniciar PRISMA OS** de novo e crie o acesso da pessoa em **Usuários e permissões**.

Observações: com `PRISMA_BIND=0.0.0.0`, quem estiver na mesma rede Wi-Fi também enxerga a tela de login (o acesso continua exigindo usuário e senha). O sistema só funciona enquanto o seu Mac estiver ligado. Para uso contínuo da equipe, o próximo passo é um servidor (VPS).

## Usar o ChatGPT no lugar do Claude (opcional)

Rode **Configurar chave da IA**, escolha **2) ChatGPT (OpenAI)** e cole a chave criada em platform.openai.com > API keys. A assinatura do ChatGPT (Plus/Pro) não inclui chave de API: o uso da API é cobrado à parte, com saldo adicionado em Billing. Para voltar ao Claude, rode o atalho de novo e escolha 1.

## Cores da marca pelo @ do Instagram (opcional)

Sem configurar nada, o PRISMA OS já sugere as cores a partir do logotipo ou de um print do perfil do cliente. Para buscar direto pelo @, é preciso um token da API oficial da Meta (passo a passo em `docs/OPERATIONS.md`, seção "Instagram: cores da marca pelo @"). Com o token e o ID da conta do Instagram da agência em mãos, acrescente ao arquivo `~/.prisma-os/config.env`:

```
META_ACCESS_TOKEN=cole-o-token-aqui
META_IG_USER_ID=17840000000000000
```

Depois rode **Iniciar PRISMA OS** de novo.

## Problemas comuns

- **"O Docker Desktop não está instalado"**: faça o passo 1.
- **O Docker não abre ou demora**: abra o Docker Desktop manualmente, espere o ícone da baleia ficar parado na barra de menus e rode o atalho de novo.
- **Esqueci a senha**: use **Redefinir senha**.
- **A página não abre**: rode **Iniciar PRISMA OS**; ele mostra o endereço e, se algo falhar, as últimas mensagens do sistema.
- **Algo deu errado**: tire um print da janela do Terminal e peça ajuda.
