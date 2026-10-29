# Publicação no Instagram e no Facebook depois da aprovação (desenho)

Pedido do sócio: "aprovou, já pode postar". Este documento descreve como fazer isso com segurança. Ainda **não está implementado**: depende de credenciais e de uma aprovação da Meta que não dá para obter nem testar daqui, e o princípio do sistema é não mostrar botões que não funcionam.

## O que a Meta exige

1. **App da Meta do tipo Empresa** (developers.facebook.com) com o produto Instagram (login do Facebook).
2. **Permissões revisadas pela Meta** (App Review), com vídeo mostrando o uso: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` e, para Facebook, `pages_manage_posts`. Sem a revisão, só contas com papel no app (a da agência) conseguem publicar.
3. **Cada cliente conecta a própria conta**: o Instagram dele precisa ser profissional (comercial ou criador) e estar ligado a uma Página do Facebook. O cliente (ou a agência, se for administradora da Página no Gerenciador de Negócios) autoriza pelo login do Facebook.
4. **Limites da API**: até 100 publicações por conta a cada 24 horas; imagens em JPEG; carrossel de 2 a 10 itens; a imagem precisa estar numa URL pública de onde a Meta baixa.

## Como vai funcionar no PRISMA OS

- **Conexão por cliente** (Clientes → cliente → Canais): botão "Conectar Instagram" abre o login do Facebook (OAuth); o sistema guarda o token da Página **criptografado** no banco, com validade, e mostra a conta conectada (@ e foto). Desconectar apaga o token.
- **Publicar só versão aprovada**: na peça, o botão "Publicar" (ou "Agendar") só aparece com versão aprovada e conta conectada. Sempre pede confirmação explícita, mostrando conta, legenda e lâminas. Nada é publicado automaticamente na aprovação; o "aprovou, já posta" vira "aprovou → um clique em Publicar", ou um agendamento feito por uma pessoa.
- **Envio pela fila**: a publicação entra como tarefa (com nova tentativa e registro). Passos da API: criar o contêiner de mídia (imagem ou carrossel) → aguardar o status `FINISHED` → `media_publish`. O id do post publicado fica na peça.
- **Imagens**: o sistema gera os PNGs da versão aprovada, converte para JPEG e expõe por uma URL temporária assinada (válida por minutos), só para a Meta baixar.
- **Linha editorial**: as datas das pautas viram sugestão de agendamento; uma pessoa confirma cada agendamento.
- **Auditoria e custos**: quem publicou, quando, em qual conta, com o id do post. Falhas aparecem na peça com a mensagem da Meta traduzida.
- **Métricas** (fase 4): alcance, curtidas e comentários de cada post, lidos depois pela mesma conexão.

## Antes de começar a implementar

- Criar o app da Meta e solicitar a revisão das permissões (leva dias).
- Definir o domínio público do sistema (a Meta precisa de URL pública para o login e para baixar as imagens; Codespaces e o Mac local não servem para produção).
- Escolher um cliente piloto com conta profissional ligada a uma Página.
