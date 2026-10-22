# Operação e implantação

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
| `ANTHROPIC_EFFORT` | não | `low`…`max`, padrão `medium` |
| `ANTHROPIC_FALLBACKS` | não | `default` (fallback do servidor em recusas por política) ou `off` |
| `STORAGE_LOCAL_DIR` | não | Diretório dos arquivos (padrão `./storage`) — use volume persistente |
| `TRUST_PROXY` | não | `true` somente atrás de proxy confiável que define `X-Forwarded-For` |
| `AI_PROVIDER` | não | `anthropic`, `demo` (bloqueado em produção) ou `none` |

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

A senha é pedida no terminal sem eco (ou lida de `ADMIN_PASSWORD` em automações). O script cria a organização, o proprietário e a tarifa inicial documentada do modelo padrão. Os demais usuários são criados em **Usuários e permissões** (senha temporária exibida uma única vez; troca obrigatória no primeiro acesso).

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

Eventos principais: `worker.started`, `job.started`, `job.succeeded`, `job.retry_scheduled`, `job.failed`, `job.recovered`, `skill.succeeded`, `skill.failed`, `skill.reused`, `action.unexpected_error`, `api.unexpected_error`.

## Implantação e reversão

1. Backup do banco e do armazenamento.
2. `npm ci && npm run build` (o build roda a checagem de tipos).
3. `npm run db:migrate`.
4. Reinicie web e worker (o worker encerra com SIGTERM; tarefas interrompidas voltam para a fila após `JOB_LOCK_TIMEOUT_MS`).
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

## Exclusão completa de um cliente (LGPD)

Ainda sem tela. Procedimento administrativo, com backup prévio:

```sql
BEGIN;
SET LOCAL app.system = 'on';
SET LOCAL app.allow_purge = 'on';   -- libera exclusão de versões e auditoria
DELETE FROM clients WHERE id = '<uuid>' AND organization_id = '<uuid>';
COMMIT;
```

Em seguida remova `storage/org/<org>/client/<cliente>/`.

## Testes

```bash
npm run typecheck
npm run lint
npm test              # unitários + integração (banco prisma_os_test)
npm run test:e2e      # Playwright (banco prisma_os_e2e, porta 3100, worker incluído)
```

Se a versão do Playwright não encontrar o Chromium instalado, defina `PLAYWRIGHT_CHROMIUM_PATH`.
