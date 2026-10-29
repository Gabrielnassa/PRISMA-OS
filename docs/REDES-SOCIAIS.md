# Redes sociais: conectar e publicar

O PRISMA OS publica nas redes dos clientes pelas APIs oficiais. Antes da primeira publicação são três etapas, feitas uma vez:

1. **Hospedar o sistema num domínio com HTTPS** (ex.: `https://app.suaagencia.com.br`). O login das plataformas volta para esse endereço, e o Instagram e a TikTok baixam as imagens dele. No Mac local ou no Codespaces dá para cadastrar tudo, mas a publicação no Instagram e nas fotos da TikTok só funciona depois de hospedar.
2. **Criar um app da agência em cada plataforma** e colar as chaves em **Integrações**. Cada cartão mostra o passo a passo e o endereço de retorno para copiar.
3. **Conectar as contas de cada cliente** em **Clientes → cliente → Redes**. Quem conecta faz o login na plataforma com um usuário que administra a conta do cliente.

Depois disso, toda peça aprovada ganha o painel **Publicar** (agora ou agendado), e os vídeos da biblioteca saem por **Publicações → Publicar vídeo**.

## Meta (Instagram e Facebook)

- App do tipo **Empresa** em developers.facebook.com, com **Login do Facebook para Empresas** e **API do Instagram**.
- Endereço de retorno: `https://SEU-DOMINIO/api/conexoes/meta/retorno` (em Login do Facebook → Configurações → URIs de redirecionamento do OAuth válidos).
- Chaves: **ID do app** e **Chave secreta do app** (Configurações → Básico).
- Permissões pedidas no login: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights` e `business_management`. Para conectar contas de clientes, a Meta precisa **revisar** o app (App Review, com vídeo de uso). Antes disso, só funcionam as contas de pessoas com papel no app.
- O Instagram do cliente precisa ser **profissional** (comercial ou criador) e estar **ligado à Página** do Facebook. Um login conecta os dois.
- Instagram: post (4:5 ou 1:1), carrossel (2 a 10 lâminas), story (9:16) e Reels (vídeo). Peças 9:16 entram como story. Limite da Meta: 50 posts por conta a cada 24 horas.
- Facebook: foto, várias fotos num post, story e vídeo na Página.
- Métricas: curtidas, comentários e alcance (Instagram); reações, comentários e compartilhamentos (Facebook). Atualizam sozinhas um dia depois e pelo botão **Atualizar métricas**.

## TikTok

- App em developers.tiktok.com com **Login Kit** e **Content Posting API** (Direct Post ativado).
- Endereço de retorno: `https://SEU-DOMINIO/api/conexoes/tiktok/retorno` (Login Kit → Redirect URI).
- Verifique o domínio em **URL properties**: a TikTok só baixa fotos de domínios verificados.
- Chaves: **Client key** e **Client secret**.
- Até a **auditoria** da TikTok, tudo o que o app publica fica privado (só o dono da conta vê). Na publicação, a pessoa escolhe quem pode ver entre as opções da própria conta e confirma o uso de música da TikTok, como a plataforma exige.

## YouTube

- No Google Cloud: projeto com a **YouTube Data API v3** ativada, tela de consentimento OAuth (Externo) e um **ID do cliente OAuth** do tipo Aplicativo da Web.
- Endereço de retorno: `https://SEU-DOMINIO/api/conexoes/google/retorno`.
- Enquanto o app estiver em teste, adicione as contas Google dos clientes como testadoras.
- Só vídeos (o YouTube não aceita imagens pela API). Vídeos verticais e curtos viram Shorts.
- Até a **auditoria** da API do YouTube, os envios ficam privados. A cota padrão permite poucos envios por dia; aumente no Google Cloud se precisar.

## Como a publicação funciona

- Só sai a **versão aprovada** (a exata). Se a peça mudar depois de agendada, a publicação falha com aviso até a nova versão ser aprovada.
- Sempre há confirmação antes de enviar. Nada é publicado sozinho na aprovação.
- O envio roda em segundo plano, com novas tentativas. Uma tentativa nova continua do ponto em que parou, sem post duplicado.
- Se a plataforma recusar o acesso (senha trocada, permissão removida), a conta fica marcada para **Reconectar** na aba Redes e quem pediu a publicação recebe e-mail (se o e-mail estiver configurado).
- Cada publicação fica registrada: quem pediu, quando, em qual conta, o link do post e as métricas.

## Segurança

- Chaves dos apps, tokens das contas e senha do e-mail ficam **criptografados** no banco com a chave `APP_SECRET_KEY`, que só existe na configuração do servidor. Guarde essa chave junto com o backup: sem ela, as chaves e conexões precisam ser cadastradas de novo.
- A tela nunca mostra uma chave salva, só os últimos caracteres.
- As imagens para o Instagram e a TikTok ficam num endereço assinado que vale 3 horas e são apagadas depois da publicação.
