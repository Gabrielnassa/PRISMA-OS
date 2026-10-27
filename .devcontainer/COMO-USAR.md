# PRISMA OS no GitHub Codespaces

Este Codespace é um computador na nuvem do GitHub rodando o PRISMA OS completo: banco de dados, site e o worker que gera os conteúdos. O endereço é **privado**: só a sua conta do GitHub consegue abrir.

## Primeira vez

1. **Espere a preparação terminar.** No painel de baixo (Terminal), aparece "Preparação concluída". Leva uns 5 minutos.
2. **Crie o seu acesso.** Clique no Terminal, digite o comando abaixo e tecle Enter:
   ```
   npm run primeiro-acesso
   ```
   Responda o nome da agência, o seu nome, o seu e-mail e uma senha (mínimo 10 caracteres, com letras e números, digitada duas vezes; ela não aparece na tela).
3. **Abra o sistema.** No painel de baixo, clique na aba **Portas** (Ports). Na linha **PRISMA OS (3000)**, clique no ícone de globo ("Abrir no navegador"). Entre com o e-mail e a senha que você criou.

Salve esse endereço nos favoritos. Ele continua o mesmo enquanto este Codespace existir.

## Chave da IA (opcional)

Sem a chave, você cria as peças pelos templates e escreve os textos no editor. Para gerar com IA:

1. Abra https://github.com/settings/codespaces (são as configurações da **sua conta**: foto no canto superior direito > Settings > Codespaces; não é a aba Settings do repositório). Em **Codespaces secrets**, clique em **New secret**.
2. Nome: `ANTHROPIC_API_KEY`. Valor: a sua chave (começa com `sk-ant-`). Em **Repository access**, escolha o repositório do PRISMA OS.

   Outro caminho: na aba **Settings do repositório**, menu **Secrets and variables > Codespaces > New repository secret**, com o mesmo nome e valor.
3. Pare e abra o Codespace de novo (o GitHub também pode oferecer "Reload to apply").
4. No PRISMA OS, confirme em **Integrações > Testar conexão**.

O uso é cobrado na conta da Anthropic dona da chave. Crie a chave num workspace só para o PRISMA OS e defina um limite de gasto mensal no Console da Anthropic.

## Uso no dia a dia

- Para voltar ao sistema: em https://github.com/codespaces, abra este Codespace. O PRISMA OS liga sozinho em cerca de 30 segundos. Depois use o endereço salvo ou a aba **Portas**.
- O Codespace **desliga sozinho depois de 30 minutos sem uso**. Os dados continuam guardados; ao abrir de novo, tudo volta.
- **Custos do GitHub:** contas pessoais têm uma cota mensal gratuita de uso do Codespaces. Acompanhe em **Settings > Billing and plans**. Desligar quando não estiver usando economiza a cota.

## Backup (importante)

O GitHub **apaga automaticamente** um Codespace que fica muito tempo sem uso (o padrão é 30 dias), e com ele os dados. Faça backup com frequência e baixe para o seu computador:

```
bash .devcontainer/backup.sh
```

O backup vai para a pasta `backups/<data>` (painel de arquivos à esquerda). Clique com o botão direito na pasta > **Download**. Esse backup também pode ser restaurado na instalação do PRISMA OS no Mac (atalho "Restaurar backup").

## Outros comandos (no Terminal)

| Comando | Para quê |
| --- | --- |
| `bash .devcontainer/atualizar.sh` | Baixa a versão mais nova do GitHub e reinicia (faz backup antes) |
| `bash .devcontainer/iniciar.sh` | Reinicia o sistema se algo travar |
| `npm run user:reset-password -- --email voce@exemplo.com` | Define uma senha nova (se você esquecer a sua) |
| `tail -n 50 /tmp/prisma-web.log` | Mostra as últimas mensagens do site, para pedir ajuda |

## Privacidade

A porta 3000 é **privada** por padrão: só quem está logado na sua conta do GitHub abre o endereço. Não mude a visibilidade da porta para "Public". Para outra pessoa da equipe usar o sistema de forma contínua, o caminho é a instalação no Mac ou um servidor (VPS).
