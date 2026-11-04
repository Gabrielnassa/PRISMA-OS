# PRISMA OS num servidor (Hostinger)

Com isso, você e seu sócio acessam o sistema de qualquer lugar por um endereço próprio com HTTPS (ex.: `https://app.suaagencia.com.br`), e as redes sociais conseguem publicar.

## O que contratar

- **VPS da Hostinger** (não serve "Hospedagem de Sites" nem "Cloud"): plano **KVM 2** (2 vCPU, 8 GB) ou maior, com **Ubuntu 24.04**, de preferência no data center do Brasil.
- **Um domínio** (pode ser um que vocês já têm, usando um subdomínio como `app.suaagencia.com.br`).

## Passo a passo (uma vez)

1. **Aponte o domínio para o servidor.** No painel do domínio, crie um registro **A** com o nome `app` (ou o subdomínio escolhido) e o **IP do VPS** (aparece no painel da Hostinger). A propagação leva de minutos a algumas horas.
2. **Entre no servidor.** No painel da Hostinger, use o **Terminal do navegador** do VPS (ou `ssh root@IP-DO-VPS` no Terminal do Mac).
3. **Baixe o PRISMA OS e instale:**

   ```bash
   apt-get update && apt-get install -y git
   git clone -b claude/session-vagl59 https://github.com/Gabrielnassa/PRISMA-OS.git /opt/prisma-os
   sudo bash /opt/prisma-os/servidor/instalar.sh
   ```

   O instalador pergunta o endereço (ex.: `app.suaagencia.com.br`) e um e-mail, instala o Docker, gera senhas e a chave de criptografia, liga o HTTPS e pede os dados da sua conta de administrador. No fim, mostra o endereço para acessar.

   Se o repositório for privado, o `git clone` pede usuário e um token do GitHub (Settings → Developer settings → Personal access tokens, com acesso de leitura ao repositório).

4. **Entre pelo navegador** e convide seu sócio em **Equipe**.
5. **IA:** edite `/opt/prisma-os/servidor/app.env` (`nano /opt/prisma-os/servidor/app.env`), cole a chave do Claude ou do ChatGPT e rode `sudo bash /opt/prisma-os/servidor/reiniciar.sh`.
6. **Redes sociais e e-mail:** pela tela de **Integrações** (guia em `docs/REDES-SOCIAIS.md`).

## No dia a dia

| Para | Comando (no servidor) |
| --- | --- |
| Atualizar para a versão mais nova | `sudo bash /opt/prisma-os/servidor/atualizar.sh` |
| Fazer um backup agora | `sudo bash /opt/prisma-os/servidor/backup.sh` |
| Voltar um backup | `sudo bash /opt/prisma-os/servidor/restaurar.sh` |
| Reiniciar (depois de mudar o `app.env`) | `sudo bash /opt/prisma-os/servidor/reiniciar.sh` |
| Ver o que está acontecendo | `bash /opt/prisma-os/servidor/registros.sh` (ou `... caddy`, `... worker`) |
| Senha nova para quem esqueceu | `sudo bash /opt/prisma-os/servidor/senha.sh email@dominio.com` |

A atualização sempre faz um backup antes. O sistema volta sozinho se o servidor reiniciar.

## Backups

- Todo dia às 03:17 sai um backup em `/opt/prisma-os/servidor/backups/` (banco, fotos e configuração). Ficam os 14 mais recentes.
- **Guarde cópias fora do servidor.** Duas opções:
  - Ative os **backups semanais do VPS** no painel da Hostinger.
  - Envie para o Google Drive com o rclone: `apt-get install -y rclone`, `rclone config` (crie um destino chamado `gdrive`) e acrescente `PRISMA_BACKUP_REMOTO=gdrive:prisma-os` ao `servidor/config.env`. Cada backup diário passa a ir também para lá.
- O backup leva junto a `APP_SECRET_KEY`, que abre as chaves dos apps e as conexões das redes. Trate a pasta de backups como confidencial.

## Segurança

- Só as portas 80 e 443 ficam abertas para a internet (o banco não é acessível de fora).
- O certificado HTTPS é do Let's Encrypt e renova sozinho.
- `servidor/config.env` guarda as senhas do banco e a chave de criptografia, legível só pelo administrador do servidor. Não apague nem compartilhe.
- Use uma senha forte no acesso ao VPS (ou chave SSH) e mantenha o Ubuntu atualizado (`apt-get upgrade`).

## Problemas comuns

- **"O endereço ainda não respondeu"**: o domínio ainda não aponta para o servidor. Confira o registro A e espere a propagação; o HTTPS liga sozinho quando o domínio chegar. Detalhes: `bash servidor/registros.sh caddy`.
- **Site fora do ar depois de atualizar**: `bash servidor/registros.sh web`. Para voltar ao estado anterior, `sudo bash servidor/restaurar.sh` e escolha o backup feito antes da atualização.
