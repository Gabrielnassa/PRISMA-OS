# Arquitetura do PRISMA OS

## Visão geral

```
Navegador (Next.js App Router, React 19, Tailwind)
   │  Server Components + Server Actions + Route Handlers (/api/*)
   ▼
Camada de serviços (src/server/services) ── autorização (authz) + auditoria
   │                     │
   │                     ├── Motor de layout (src/server/render) ── Satori → SVG → resvg → PNG
   │                     ├── Controle de qualidade (src/server/quality)
   │                     └── Fila de tarefas (src/server/jobs) ──► Worker (processo separado)
   │                                                               │
   │                                         Orquestrador (src/server/orchestrator)
   │                                               │  contexto + limites + registro
   │                                         Skills (src/server/skills)
   │                                               │
   │                                         Gateway de IA (src/server/ai) ──► Anthropic / demonstração
   ▼
PostgreSQL 16 (RLS por organização e cliente)      Armazenamento de arquivos (driver local; interface para S3)
```

Responsabilidades separadas, conforme a seção 5 da especificação:

| Camada | Diretório | Observações |
| --- | --- | --- |
| Interface | `src/app`, `src/components` | Português do Brasil; tema grafite com violeta e verde-água. Nenhum dado operacional é inventado. |
| Regras de negócio | `src/server/services` | Toda mutação chama `assertCan(papel, permissão)` e `requireClient` antes de agir. |
| Autorização | `src/server/authz`, migrations (RLS) | Matriz de permissões por papel + políticas de RLS no banco. |
| IA | `src/server/ai`, `src/server/skills`, `src/server/orchestrator` | Só o gateway conhece SDKs de IA. Skills não executam ações externas. |
| Persistência | `src/server/db`, `db/migrations` | SQL explícito com `pg`; migrations versionadas com checksum. |
| Processamento assíncrono | `src/server/jobs`, `scripts/worker.ts` | Fila no PostgreSQL com `FOR UPDATE SKIP LOCKED`. |
| Renderização | `src/server/render` | Satori (layout flexbox + texto vetorizado) e resvg (PNG). |
| Arquivos | `src/server/storage`, `src/server/media` | Tipo real detectado pelos bytes; driver plugável. |

## Multicliente e isolamento

- **Organização** (agência) → **clientes** → todo o resto. Cada tabela vinculada a cliente tem `organization_id` e `client_id` com **chave estrangeira composta** `(client_id, organization_id) → clients(id, organization_id)`: o banco recusa um registro que aponte para cliente de outra organização.
- A aplicação conecta com um usuário **que não é dono das tabelas** (membro do papel `prisma_app`); as políticas de RLS valem para ele.
- Cada transação define `app.user_id` (usuário autenticado) ou `app.system = 'on'` (login, worker e scripts). Funções `SECURITY DEFINER` (`app_can_access_client`, `app_is_org_admin`…) leem memberships sem recursão entre políticas.
- Proprietários e administradores acessam todos os clientes da organização; os demais papéis só os clientes atribuídos em `client_access`.
- O worker não usa privilégios de sistema para o trabalho: ele reconstrói o contexto do usuário que pediu a tarefa (`worker-auth.ts`), então o RLS também vale para a geração.

Detalhes em [SECURITY.md](SECURITY.md).

## Modelo de dados (migration `0001_foundation.sql`)

| Entidade | Tabela | Notas |
| --- | --- | --- |
| Organizações, usuários, papéis | `organizations`, `users`, `memberships` | Papéis: owner, admin, editor, reviewer, viewer |
| Sessões e tentativas de login | `sessions`, `login_attempts` | Token aleatório; só o SHA-256 fica no banco |
| Clientes e acesso por cliente | `clients`, `client_access` | |
| Perfil de marca | `brand_profiles` | JSON estruturado validado por Zod (`src/lib/brand.ts`), com `revision` para concorrência otimista |
| Memória | `client_memories` | fato, preferência, hipótese, sugestão; ativa/arquivada; excluível |
| Mídia | `media_assets` | dedupe por SHA-256 por cliente; exclusão lógica para reproduzir versões antigas |
| Conteúdo | `content_items` | status da seção 14; `request_id` único (idempotência do formulário) |
| Versões | `content_versions` | **imutáveis** (gatilho bloqueia UPDATE/DELETE); `document_hash` canônico |
| Qualidade | `quality_reports` | relatório por versão (`checker_version`) |
| Aprovações | `approvals` | vinculadas a versão + hash; no máximo uma pendente por conteúdo |
| Comentários | `content_comments` | |
| IA | `ai_runs`, `provider_prices`, `client_budgets` | tokens, custo calculado, tarifa usada, idempotência |
| Fila | `jobs`, `job_attempts` | tentativas, backoff, recuperação |
| Auditoria | `audit_logs` | somente inserção (gatilho) |

## Documento de conteúdo

Uma peça é um **documento estruturado** (`src/lib/content/document.ts`), não uma imagem:

- `format` (post, carrossel, story), `aspect` (1:1, 4:5, 9:16), `templateId`
- `style`: cores da marca, fontes, logotipo, assinatura
- `slides[]`: tipo (abertura, desenvolvimento, CTA), campos de texto separados (`kicker`, `title`, `body`, `highlight`, `footer`), imagem com ponto focal e zoom, tema, alinhamento, escala, texto alternativo
- `caption` (até 2.200), `hashtags` (até 30), `cta`, `notes`

Texto, imagem, logotipo e decoração ficam separados (seção 11), então qualquer ajuste re-renderiza na hora sem regenerar a peça. Cada salvamento cria uma nova versão; o hash canônico (chaves ordenadas) amarra a aprovação ao conteúdo exato.

## Motor de layout

- `src/server/render/kit.tsx` — contexto da lâmina, paleta derivada da marca com garantias de contraste (texto, texto de destaque e texto secundário sempre ≥ 4,5:1), primitivas (foto com recorte, película, logotipo, contador) e **pilhas de texto** que reduzem proporcionalmente as fontes até caber.
- `src/server/render/fonts.ts` — mede o texto com as mesmas fontes do Satori (opentype) para escolher o tamanho.
- `src/server/render/engine.tsx` — renderiza com Satori e **confirma o transbordo** com o layout calculado (`onNodeDetected`); converte para PNG com resvg.
- `src/server/render/templates/*` — 18 templates em 6 famílias (Editorial premium, Natural e humano, Educativo e estratégico, Produto e oferta, Vídeo social profissional, Tech/Prisma), cada um com os metadados da seção 11.3: identificador, nome, família, finalidade, formatos, proporções, campos editáveis com limites, regras de composição, critérios de qualidade, versão e origem/licença.

## Controle de qualidade (seção 11.4)

`src/server/quality/checks.ts` roda a cada versão salva e em cada pré-visualização:

formato e dimensões · título obrigatório · limites de caracteres · campos que o template não exibe · **texto cortado** · **contraste WCAG** (pior caso sobre foto com película) · fonte muito pequena · foto exigida ausente · baixa resolução · texto alternativo · cores/fontes/logotipo diferentes da marca · **termos proibidos** · CTA ausente ou diferente do briefing · **números sem fonte** · **condições comerciais não confirmadas** · depoimento a confirmar · legenda e hashtags.

Problemas críticos bloqueiam o envio para aprovação. A revisão por IA (skill `quality.ai-review`) é consultiva e não substitui as regras nem a aprovação humana.

## IA: gateway, skills e orquestrador

- **Gateway** (`src/server/ai/gateway.ts`): único ponto que instancia provedores. Provedores: `AnthropicProvider` (SDK oficial, `claude-opus-5-5` por padrão, esforço configurável, saída estruturada validada por Zod, fallback do servidor em caso de recusa por política) e `DemoProvider` (sem IA, bloqueado em produção).
- **Skills** (`src/server/skills`): módulos versionados com identificador, descrição, instruções, esquemas de entrada e saída, ferramentas autorizadas (nenhuma), critérios de qualidade, tratamento de erros e testes. Implementadas: `planner.ideas`, `copywriter.social`, `art-director.rules`, `quality.ai-review`. As demais da seção 9 estão listadas como previstas em Agentes e skills.
- **Orquestrador** (`src/server/orchestrator`): valida a entrada, verifica acesso e teto de consumo, monta as **camadas de contexto** (global da agência, cliente, memória — hipóteses rotuladas como hipóteses), chama o provedor fora de transação, valida a saída e registra `ai_runs` com tokens, custo, duração e erro. Com chave de idempotência, uma execução já concluída é **reaproveitada sem nova cobrança**.

## Fluxo de geração (seção 10)

1. A Central de criação grava `content_items` (status *Em geração*) e enfileira `content.generate` com chave `content:<id>:generate`.
2. O worker reserva a tarefa (`SKIP LOCKED`), registra a tentativa e reconstrói o contexto do solicitante.
3. Diretor de arte (regras) escolhe template, proporção e estilo; copywriter (IA) escreve respeitando os limites de cada campo.
4. O documento é composto, salvo como versão (fonte `ai` ou `demo`), renderizado e avaliado pelo controle de qualidade; status → *Em revisão*.
5. Falhas transitórias são reagendadas com backoff exponencial (até 3 tentativas); definitivas marcam o conteúdo como *Falhou* com a mensagem, e podem ser reprocessadas manualmente.

## Estados do conteúdo (seção 14)

Rascunho → Em geração → Em revisão → Aguardando aprovação → Aprovado (→ Agendado → Publicado, fase 4) · Reprovado · Falhou · Arquivado.

- Envio para aprovação exige a versão atual e controle de qualidade sem críticos.
- Qualquer alteração cria nova versão, marca aprovações pendentes como *substituídas* e volta o conteúdo para *Em revisão*.
- A exportação oficial usa a versão aprovada; outras versões saem como "RASCUNHO".

## Custos (seção 21)

Custo = tokens informados pelo provedor × tarifa vigente cadastrada (`provider_prices`). Sem tarifa, o custo fica **nulo** e a interface mostra "sem tarifa" — nada é estimado. A tarifa inicial do Claude Opus 5.5 vem da tabela pública da Anthropic, com a fonte registrada. Tetos mensais por cliente podem interromper novas gerações.
