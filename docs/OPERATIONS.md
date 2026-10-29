# Operação e implantação

## GitHub Codespaces

`.devcontainer/` define o ambiente: contêiner de aplicação (Node 22 + cliente do PostgreSQL 16) e PostgreSQL 16, com senhas aleatórias geradas antes de os contêineres subirem (`gerar-senhas.sh`, em `.devcontainer/.env`, fora do Git). Na criação, `preparar.sh` instala dependências, aplica migrations e faz o build; a cada início, `iniciar.sh` aplica migrations e sobe site e worker em segundo plano (PIDs em `/tmp/prisma-*.pid`, registros em `/tmp/prisma-*.log`). `APP_URL` é o endereço encaminhado da porta 3000 (`https://<codespace>-3000.<domínio>`), declarado em `serverActions.allowedOrigins` porque o proxy do Codespaces reescreve o host. A chave da IA vem do segredo de Codespaces `ANTHROPIC_API_KEY`. Backups (`backup.sh`) usam o mesmo formato da instalação no Mac.

## Instalação local no Mac (Docker)

Para uso interno num único computador, a pasta `mac/` traz atalhos de dois cliques (iniciar, parar, backup, restaurar, atualizar, chave da IA, redefinir senha) sobre `mac/compose.yml`: PostgreSQL, migrations, web e worker a partir da mesma imagem (`Dockerfile`). As senhas do banco são geradas na primeira execução em `~/.prisma-os/config.env`, a porta fica presa a `127.0.0.1` e os dados ficam nos volumes `prisma-os_pgdata` e `prisma-os_storage`. Guia para o usuário: [mac/LEIA-ME.md](../mac/LEIA-ME.md). O mesmo `Dockerfile` e o mesmo compose servem de ponto de partida para um VPS.

## Processos

| Processo | Comando | Função |
| --- | --- | --- |
| Web | `npm run build && npm start` | Interface, Server Actions e rotas `/api/*` |
| Worker | `npm run worker` | Fila de tarefas (geração de conteúdo), novas tentativas e recuperação de tarefas interrompidas |
| Migrations | `npm run db:migrate` | Executar a cada implantação, **antes** de subir a nova versão |

Web e worker precisam do mesmo código, das mesmas variáveis e do mesmo armazenamento de arquivos. É possível rodar vários workers: a reserva usa `FOR UPDATE SKIP LOCKED`.

## Variáveis de ambiente

Veja `.env.example`. As essenciais:

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | sim | Usuário de **login da aplicação** (não dono das tabelas) |
| `MIGRATION_DATABASE_URL` | para migrations | Usuário proprietário do schema |
| `APP_URL` | recomendada | URL pública (verificação de origem das rotas de API) |
| `ANTHROPIC_API_KEY` | para IA | Chave da API Anthropic; sem ela a geração por IA fica indisponível (criação manual continua funcionando) |
| `ANTHROPIC_MODEL` | não | Padrão `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` | não | Vazio = esforço de cada skill (ideias `low`; textos e revisão `medium`). `low`…`max` força o mesmo esforço para todas |
| `ANTHROPIC_FALLBACKS` | não | `default` (fallback do servidor em recusas por política) ou `off` |
| `OPENAI_API_KEY` | para IA (alternativa) | Chave da API OpenAI (ChatGPT), criada em platform.openai.com → API keys. A assinatura do ChatGPT não inclui chave de API |
| `OPENAI_MODEL` | não | Padrão `gpt-6.1-sol`. Outros da lista oficial do SDK: `gpt-6-astra` (topo, mais caro), `gpt-6.1-terra` (mais barato) |
| `OPENAI_EFFORT` | não | Vazio = esforço de cada skill; `low`…`max` força o mesmo para todas |
| `STORAGE_LOCAL_DIR` | não | Diretório dos arquivos (padrão `./storage`) — use volume persistente |
| `TRUST_PROXY` | não | `true` somente atrás de **um** proxy confiável que acrescenta o IP do cliente ao `X-Forwarded-For` (usa-se o último valor). Sem isso, o limite de tentativas de login usa o e-mail e um limite global para IP desconhecido |
| `AI_PROVIDER` | não | `anthropic`, `openai`, `demo` (bloqueado em produção) ou `none`. Sem ele: Claude se houver `ANTHROPIC_API_KEY`, senão OpenAI |
| `AI_TIMEOUT_MS` | não | Tempo limite por chamada à IA (padrão 180000) |
| `JOB_LOCK_TIMEOUT_MS` | não | Reserva de uma tarefa sem renovação antes de ser considerada abandonada (padrão 600000; o worker renova a cada ¼ desse valor) |
| `GENERATION_RATE_PER_MINUTE` | não | Gerações e chamadas interativas de IA por pessoa por minuto (padrão 10) |
| `META_ACCESS_TOKEN` | para o @ do Instagram | Token da Meta com `instagram_basic` e `pages_read_engagement` (veja abaixo). Sem ele, a sugestão de cores funciona só por imagens |
| `META_IG_USER_ID` | para o @ do Instagram | ID numérico da conta comercial do Instagram **da agência** (quem faz a consulta) |
| `META_GRAPH_VERSION` | não | Versão da Graph API (padrão `v23.0`) |

Variáveis definidas com valor vazio (como no `.env.example`) valem como não definidas.

## Banco de dados

### Papéis

A aplicação **não pode** conectar como dona das tabelas, senão o RLS deixa de valer. Crie dois usuários:

```sql
CREATE ROLE prisma_owner LOGIN CREATEROLE PASSWORD '...';   -- migrations
CREATE ROLE prisma_app_login LOGIN PASSWORD '...';          -- aplicação e worker
CREATE DATABASE prisma_os OWNER prisma_owner;
```

`npm run db:migrate` cria o papel `prisma_app` (se não existir), aplica as migrations e concede `prisma_app` ao usuário de `DATABASE_URL`. Se `DATABASE_URL` usar o mesmo usuário das migrations, o script avisa e `/api/health` passa a responder 503.

**Supabase**: use a string de conexão do Postgres do projeto. Rode as migrations com o usuário `postgres` (tem `CREATEROLE`) e crie um usuário de login separado para a aplicação. A autenticação é própria (tabela `users`), independente do Supabase Auth.

### Migrations

- Arquivos em `db/migrations`, aplicados em ordem, cada um numa transação; registro em `prisma_meta.schema_migrations` com checksum.
- Migrations já aplicadas **não podem ser editadas** (o checksum divergente interrompe a execução). Crie sempre um novo arquivo.
- Não há "down migrations": a reversão é feita restaurando o backup feito antes da implantação (veja abaixo).

## Primeiro administrador

```bash
npm run admin:create -- --org "Nome da Agência" --name "Nome" --email admin@agencia.com
```

A senha é pedida no terminal sem eco (ou lida de `ADMIN_PASSWORD` em automações). O script cria a organização, o proprietário e as tarifas iniciais documentadas (modelo padrão e modelos de fallback). Os demais usuários são criados em **Usuários e permissões**: a senha temporária é exibida uma única vez, expira em 7 dias e precisa ser trocada no primeiro acesso (a pessoa é levada a `/trocar-senha` antes de qualquer outra tela). Administradores podem gerar uma nova senha temporária para quem pertence só à sua organização.

### Pessoa que já tem conta em outra organização

Por segurança, convidar um e-mail que já existe **não** vincula a conta existente (isso permitiria descobrir e-mails de outras agências). O operador da plataforma vincula pelo terminal:

```bash
npm run member:add -- --org <slug-da-organização> --email pessoa@exemplo.com --role editor
```

A desativação de um membro vale apenas para a organização que a fez; a conta continua ativa nas demais.

### Senha esquecida

Pelo terminal do servidor (pede a senha nova duas vezes; também libera o bloqueio por tentativas e encerra as sessões abertas):

```bash
npm run user:reset-password -- --email pessoa@exemplo.com
```

## Backup e restauração

Faça backup do **banco** e do **diretório de arquivos** juntos (as versões referenciam arquivos por chave).

```bash
# Backup
pg_dump --format=custom --no-owner "$MIGRATION_DATABASE_URL" > prisma_os-$(date +%F).dump
tar -czf storage-$(date +%F).tgz -C "$STORAGE_LOCAL_DIR" .

# Restauração (banco vazio, papéis já criados)
pg_restore --no-owner --role=prisma_owner -d "$MIGRATION_DATABASE_URL" prisma_os-AAAA-MM-DD.dump
npm run db:migrate            # reaplica concessões ao papel da aplicação
tar -xzf storage-AAAA-MM-DD.tgz -C "$STORAGE_LOCAL_DIR"
```

Recomendações: backup diário com retenção de 30 dias, teste de restauração mensal num ambiente separado e backup imediatamente antes de cada migration.

## Verificação de saúde

- `GET /api/health` — sem login; responde `200` quando banco, isolamento (RLS efetivo), fila e armazenamento estão OK e `503` caso contrário. Não expõe dados nem segredos.
- Página **Integrações** — mesmo diagnóstico com detalhes e o botão "Testar conexão" (chamada mínima e real à IA, registrada na auditoria).
- Alerta de worker: tarefas na fila há mais de 2 minutos aparecem como "worker possivelmente parado".

## Logs

Worker, orquestrador e erros inesperados escrevem **JSON por linha** no stdout (`level`, `msg`, ids, duração, tokens, custo, erro). Encaminhe o stdout para a ferramenta de logs da hospedagem. Segredos e conteúdo de briefings não são registrados.

Eventos principais: `worker.started`, `job.started`, `job.succeeded`, `job.retry_scheduled`, `job.failed`, `job.recovered`, `job.recover_failed`, `job.lock_lost`, `job.heartbeat_failed`, `skill.succeeded`, `skill.failed`, `skill.reused`, `action.unexpected_error`, `api.unexpected_error`.

## Implantação e reversão

1. Backup do banco e do armazenamento.
2. `npm ci && npm run build` (o build roda a checagem de tipos).
3. `npm run db:migrate`.
4. Reinicie web e worker (o worker encerra com SIGTERM; tarefas interrompidas voltam para a fila após `JOB_LOCK_TIMEOUT_MS`, e a chamada de IA já concluída é reaproveitada sem nova cobrança).
5. Verifique `GET /api/health` e faça um teste de geração.

Reversão: volte o código para a versão anterior. Se a nova versão aplicou migrations incompatíveis, restaure o backup do passo 1.

## Atualização de dependências

```bash
npm outdated
npm update            # dentro das faixas do package.json
npm audit
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

Atualizações maiores (Next.js, React, SDK da Anthropic, Satori, resvg, Zod) devem ser feitas uma por vez, revisando as notas de versão. O Next.js 16 traz a documentação da versão instalada em `node_modules/next/dist/docs`.

## Templates

Ao criar ou alterar um template, recalibre a capacidade de texto e copie o resultado para o campo `capacity` do template:

```bash
npx tsx scripts/calibrate-capacity.ts [filtro-de-id]
npx vitest run --project unit tests/unit/capacity.test.ts
```

## ChatGPT (OpenAI) no lugar do Claude

O sistema funciona com qualquer um dos dois provedores; as skills, a fila, o controle de qualidade e os custos são os mesmos. Para usar a OpenAI:

1. Em platform.openai.com → API keys, crie uma chave e, em Billing, adicione saldo (a assinatura do ChatGPT Plus/Pro não serve para a API).
2. Defina `OPENAI_API_KEY` (e `AI_PROVIDER=openai` se também houver chave da Anthropic). Servidor: variável de ambiente; Mac: atalho **Configurar chave da IA** → opção 2; Codespaces: secret `OPENAI_API_KEY`.
3. Reinicie e use Integrações → "Testar conexão".

Detalhes: Responses API com saída em JSON Schema estrito, esforço de raciocínio por skill e `store: false` (as respostas não ficam guardadas na conta da OpenAI). Tokens em cache são separados dos de entrada para cada parte ser cobrada pela sua tarifa. As tarifas iniciais (`gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-astra`) vieram de agregadores porque o site da OpenAI não estava acessível na configuração: confira em openai.com/api/pricing e ajuste em Custos e consumo. Modelo sem tarifa cadastrada entra no teto por estimativa, como no fallback do Claude.

## Instagram: cores da marca pelo @

Em Clientes → Perfil da marca → Identidade visual, "Sugerir cores" lê as cores de imagens do cliente (logotipo, fotos ou print do perfil; PNG, JPEG, GIF ou SVG) e, com a API da Meta configurada, também pelo @ do Instagram: foto de perfil e até 9 posts recentes. A sugestão só preenche o formulário; nada é salvo sem "Salvar perfil da marca".

A consulta usa a API oficial ("Business Discovery" da Graph API com login do Facebook). Nada é raspado do site do Instagram. Funciona para contas **comerciais ou de criador**; contas pessoais e privadas não aparecem. Para configurar:

1. A conta do Instagram **da agência** precisa ser profissional (comercial ou criador) e estar vinculada a uma Página do Facebook.
2. Em developers.facebook.com, crie um app do tipo Empresa e adicione o produto do Instagram (API com login do Facebook).
3. Gere um token de usuário com `instagram_basic` e `pages_read_engagement` (o Explorador da Graph API serve para o primeiro teste) e troque-o por um token de longa duração. Para não expirar, use um usuário do sistema no Gerenciador de Negócios.
4. Descubra o ID da conta do Instagram da agência: `GET /me/accounts?fields=instagram_business_account` com o token.
5. Defina `META_ACCESS_TOKEN` e `META_IG_USER_ID` no ambiente do servidor e reinicie. Em Integrações, o cartão "Instagram: cores da marca pelo @" mostra se está configurado.

Onde definir: servidor → variáveis de ambiente; Mac → acrescente as duas linhas em `~/.prisma-os/config.env` e rode **Iniciar PRISMA OS**; Codespaces → secrets `META_ACCESS_TOKEN` e `META_IG_USER_ID` (mesmo caminho da chave da IA em `.devcontainer/COMO-USAR.md`).

Mensagens de erro da Meta aparecem traduzidas (token expirado, sem permissão, conta não encontrada, limite de consultas). O token vai no cabeçalho `Authorization`, nunca na URL, e as imagens só são baixadas dos domínios da Meta (`fbcdn.net`, `cdninstagram.com`), com limite de 5 MB e tipo conferido. A integração foi testada contra uma API simulada; a primeira consulta real confirma a configuração.

## Exclusão de conteúdos e de clientes

Arquivar continua sendo o caminho reversível. A exclusão definitiva fica com proprietário e administrador:

- **Peças**: na página da peça ("Excluir definitivamente", com confirmação) ou em lote em Conteúdos e na aba Conteúdos do cliente (seleção + confirmação na barra). Apaga versões, aprovações, comentários e relatórios de qualidade. Peças em geração ficam de fora até a geração terminar.
- **Cliente**: Clientes → cliente → Visão geral → "Excluir cliente". A tela lista o que será apagado e só libera o botão com o nome do cliente digitado. Apaga perfil da marca, memória, arquivos (inclusive os já removidos da biblioteca e guardados para versões antigas), peças, limite de custos, tarefas e skills exclusivas dele. Recusa enquanto houver geração na fila ou em andamento.

O que fica, de propósito:

- **Custos**: as execuções de IA continuam nos totais de Custos e consumo (o provedor já cobrou), sem vínculo com a peça e sem o texto gerado. As de um cliente excluído aparecem como "Nome (excluído)".
- **Auditoria**: é somente inserção. Registra a exclusão (quem, quando, nome e contagens) e mantém as entradas anteriores, que guardam ações e metadados (por exemplo, nomes de arquivos), não o conteúdo das peças.

Se for preciso apagar também a auditoria de um cliente já excluído (pedido de titular, por exemplo), faça backup e rode:

```sql
BEGIN;
SET LOCAL app.system = 'on';
SET LOCAL app.allow_purge = 'on';   -- libera a exclusão na tabela de auditoria
DELETE FROM audit_logs WHERE client_id = '<uuid>' AND organization_id = '<uuid>';
COMMIT;
```

A exclusão pela interface liga `app.allow_purge` só dentro da própria transação: fora dela, versões e auditoria continuam imutáveis.

## Testes

```bash
npm run typecheck
npm run lint
npm test              # unitários + integração (banco prisma_os_test)
npm run test:e2e      # Playwright (banco prisma_os_e2e, porta 3100, worker incluído)
```

Se a versão do Playwright não encontrar o Chromium instalado, defina `PLAYWRIGHT_CHROMIUM_PATH`.
