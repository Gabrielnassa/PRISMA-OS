# Decisões técnicas

Registro das escolhas feitas durante a primeira entrega, com alternativas consideradas (seção 4: "adote um padrão razoável, documente a escolha e prossiga").

## 1. Repositório vazio → aplicação nova em Next.js 16

O repositório não tinha código. Stack: Next.js 16 (App Router), React 19, TypeScript estrito, Tailwind v4, PostgreSQL 16. Server Components e Server Actions reduzem a superfície de API pública; rotas `/api/*` existem só onde há upload, binários (PNG/ZIP/SVG) ou pré-visualização ao vivo.

## 2. PostgreSQL com SQL explícito, sem ORM

`pg` + SQL parametrizado + validação com Zod. Motivo: controle direto de RLS, `FOR UPDATE`, `SKIP LOCKED`, chaves compostas e gatilhos. Alternativas: Prisma/Drizzle (abstraem mal RLS por transação e `set_config`).

## 3. Autenticação própria em vez de Supabase Auth

A especificação permite "Supabase Auth ou equivalente". Sessões no próprio PostgreSQL funcionam em qualquer Postgres (local, Docker, Supabase, RDS), são testáveis sem serviços externos e mantêm o isolamento inteiro em um só lugar. Migrar para Supabase Auth no futuro exige trocar `src/server/auth/*` e preencher `app.user_id` a partir do JWT.

## 4. Isolamento em duas camadas (serviço + RLS)

Toda consulta filtra por organização/cliente no serviço **e** o banco aplica RLS com um usuário de aplicação que não é dono das tabelas. Assim um filtro esquecido não vira vazamento entre clientes. Custo: cada operação roda numa transação com `set_config`.

## 5. Fila no PostgreSQL em vez de Redis/n8n

`jobs` + `FOR UPDATE SKIP LOCKED` dá persistência, idempotência (`UNIQUE (organization_id, idempotency_key)`), tentativas com backoff e auditoria sem nova infraestrutura. n8n continua previsto para workflows de negócio (fase 3), não para a fila interna.

## 6. Motor de layout com Satori + resvg

Peças como documentos estruturados renderizados no servidor: o mesmo SVG serve a pré-visualização no navegador e o PNG final, sem depender de imagens geradas com texto embutido (seção 11). Alternativas: canvas no navegador (exportação inconsistente entre dispositivos), Puppeteer/headless Chrome (pesado para o worker). O transbordo de texto é confirmado pelo layout calculado do próprio Satori.

## 7. Fontes empacotadas (OFL) via `@fontsource`

Renderização determinística, sem chamadas externas e com licença compatível com uso comercial. Fontes próprias de clientes (upload de TTF/OTF) ficam para uma próxima etapa.

## 8. IA: Anthropic como primeiro provedor, atrás de um gateway

Modelo padrão `claude-opus-5-5` com esforço `medium` (configurável), saída estruturada validada por Zod e fallback do servidor em recusas por política. O gateway isola o SDK; outro provedor implementa a interface `AiProvider`. Nenhuma skill tem ferramentas: a IA devolve dados; ações ficam com o orquestrador e com pessoas.

## 9. Diretor de arte por regras (não por IA)

Escolher template, proporção e estilo com regras explicáveis é barato, determinístico e testável; a escolha pode ser trocada no editor. Uma direção de arte por IA pode ser adicionada depois como nova versão da skill.

## 10. Modo demonstração explícito

Para testar o fluxo sem credenciais, `AI_PROVIDER=demo` monta textos a partir do briefing **sem IA**. É bloqueado em produção e marcado como "Demonstração" em versões, execuções e na interface (seção 3: dados demonstrativos identificados e separados).

## 11. Custos só com tarifa cadastrada

Custo = tokens reais × tarifa vigente (`provider_prices`), com fonte registrada. Sem tarifa, custo nulo e aviso "sem tarifa" (seção 21: não inventar preços). A tarifa inicial do Claude Opus 5.5 vem da tabela pública da Anthropic.

## 12. Aprendizado controlado

Reprovações viram **sugestões** na memória do cliente, que não entram no contexto da IA até alguém registrá-las como fato ou preferência (seção 8: correções de um cliente não alteram outros nem políticas globais automaticamente).

## 13. Armazenamento local com interface plugável

Driver local para esta etapa; a interface `StorageDriver` permite S3/Supabase Storage sem mudar os serviços. Não foi implementado o driver S3 porque não havia como testá-lo de verdade neste ambiente.

## 14. Rotas em português

As URLs da interface seguem o idioma do produto (`/clientes`, `/criar`, `/conteudos`…); as rotas de API ficam em inglês.
