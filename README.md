# PRISMA OS

**Sua agência no piloto automático. Você no controle.**

Central operacional de marketing com IA para agências que atendem vários clientes: perfil de marca estruturado, criação de posts e carrosséis com IA, peças realmente renderizadas e editáveis, controle de qualidade, aprovação vinculada à versão exata, exportação, histórico e custos — com isolamento de dados por cliente no backend **e** no banco.

> Estado atual: **Fase 1 (fundação) + primeira entrega obrigatória** (seção 30 da especificação). Calendário, automações, publicação em redes, vídeo, sites e anúncios estão planejados para as fases 3–6 e aparecem na interface como "próximas fases", nunca simulados. Veja [docs/STATUS.md](docs/STATUS.md).

## O que já funciona

| Fluxo | Onde |
| --- | --- |
| Login com sessões no banco, papéis e acesso por cliente | `/login`, Usuários e permissões |
| Cadastro de clientes e perfil de marca completo (negócio, público, voz, identidade visual, canais, ofertas confirmadas) | Clientes → Perfil da marca |
| Memória do cliente (fatos, preferências, hipóteses, sugestões) revisável e excluível | Clientes → Memória |
| Biblioteca de mídia com validação do tipo real do arquivo | Clientes → Arquivos, Biblioteca de mídia |
| Pedido de conteúdo com briefing, sugestão de pautas e escolha de fotos | Central de criação |
| Geração assíncrona (fila no PostgreSQL + worker) com direção de arte por regras e copy por IA | Conteúdos |
| 18 templates originais (6 famílias × 3) renderizados em SVG/PNG nas proporções 1:1, 4:5 e 9:16 | Biblioteca de layouts |
| Editor visual: textos com limite por campo ajustado ao layout, tema, alinhamento, escala, foto com foco/zoom, template, cores, fontes, logotipo | Conteúdos → editor |
| Controle de qualidade automático (texto cortado, contraste WCAG, marca, termos proibidos, CTA, números sem fonte, ofertas não confirmadas) | Painel de qualidade |
| Versões imutáveis, comparação e restauração | Conteúdos → Versões |
| Aprovação vinculada ao hash da versão; alteração exige nova aprovação; reprovação vira sugestão revisável na memória | Aprovações |
| Exportação PNG/ZIP (com legenda e textos alternativos) da versão aprovada; rascunhos identificados | Conteúdos → Exportar |
| Dashboard com dados reais e filtros por cliente, período, canal e status | Dashboard |
| Auditoria de ações, custos por execução de IA (por modelo, inclusive fallback), tetos mensais por cliente | Histórico, Custos e consumo |
| Saúde do sistema e teste real de conexão com a IA | Integrações, `GET /api/health` |

## Rodar pelo GitHub (Codespaces)

[![Abrir no GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/gabrielnassa/PRISMA-OS?ref=claude/session-vagl59)

Sem instalar nada: o botão cria um Codespace (computador na nuvem do GitHub) que prepara o banco, o site e o worker. O endereço é privado, só a sua conta do GitHub abre. O passo a passo abre sozinho no Codespace ([.devcontainer/COMO-USAR.md](.devcontainer/COMO-USAR.md)). O GitHub desliga o Codespace depois de 30 minutos parado e apaga Codespaces sem uso por muito tempo, então faça backups.

## Instalar no seu Mac (uso interno da agência)

Sem programar nada: instale o Docker Desktop, abra a pasta [`mac`](mac/) e dê dois cliques em **Iniciar PRISMA OS**. O passo a passo completo, com backup, chave da IA e atualização, está em [mac/LEIA-ME.md](mac/LEIA-ME.md).

## Requisitos

- Node.js 22+
- PostgreSQL 16 (local, Docker ou gerenciado — inclusive Supabase Postgres)
- Uma chave da API Anthropic para gerar conteúdo com IA (opcional para explorar o sistema: veja *modo demonstração*)

## Início rápido (desenvolvimento)

```bash
npm install

# 1. Banco local (escolha uma opção)
docker compose up -d postgres                 # cria papéis e bancos automaticamente
# ou, com um PostgreSQL já instalado:
PGUSER=postgres ./scripts/setup-local-db.sh

# 2. Configuração
cp .env.example .env                          # ajuste senhas e, se tiver, ANTHROPIC_API_KEY

# 3. Migrations (cria tabelas, políticas de RLS e concede o papel da aplicação)
npm run db:migrate

# 4. Primeiro administrador e organização (a senha é pedida no terminal)
npm run admin:create -- --org "Minha Agência" --name "Seu Nome" --email voce@agencia.com

# 5. Aplicação + worker de tarefas
npm run dev                                   # http://localhost:3000
```

Sem `ANTHROPIC_API_KEY`, defina `AI_PROVIDER=demo` para testar o fluxo completo: os textos são montados a partir do próprio briefing, **sem IA**, e tudo fica identificado como "Demonstração" na interface e no banco. O modo demonstração é bloqueado quando `NODE_ENV=production`.

## Comandos

| Comando | Para quê |
| --- | --- |
| `npm run dev` | Next.js + worker juntos |
| `npm run dev:web` / `npm run worker` | Cada processo separadamente |
| `npm run db:migrate` | Aplica migrations pendentes (usa `MIGRATION_DATABASE_URL`) |
| `npm run admin:create -- --org … --name … --email …` | Cria organização e proprietário |
| `npm run member:add -- --org … --email … --role …` | Operador: vincula uma conta existente a outra organização |
| `npm run user:reset-password -- --email …` | Operador: define uma senha nova (quem esqueceu a sua) e libera o bloqueio de login |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run typecheck` / `npm run lint` | TypeScript estrito e ESLint |
| `npm test` | Testes unitários + integração (PostgreSQL real) |
| `npm run test:e2e` | Testes de aceitação no navegador (Playwright) |
| `npm run render:samples -- <pasta>` | Renderiza todos os templates com conteúdo de exemplo |

Os testes de integração e E2E usam os bancos `prisma_os_test` e `prisma_os_e2e` (criados pelos scripts acima) e **apagam o schema desses bancos** a cada execução.

## Documentação

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — módulos, modelo de dados, fluxo de geração, motor de layout, skills
- [docs/SECURITY.md](docs/SECURITY.md) — isolamento, autenticação, permissões, LGPD, injeção de prompt
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — implantação, variáveis, backup e restauração, saúde, logs, atualização
- [docs/STATUS.md](docs/STATUS.md) — relatório da etapa: o que foi entregue, testes executados, pendências e riscos
- [docs/DECISIONS.md](docs/DECISIONS.md) — decisões técnicas e alternativas consideradas

## Licenças de terceiros

Fontes empacotadas via `@fontsource/*` (Inter, DM Sans, Montserrat, Nunito, Space Grotesk, Playfair Display, Lora, Bebas Neue) sob SIL Open Font License 1.1. Os templates são originais; nenhum material de Canva, Cut.Pro, TAOS OS ou outros produtos foi copiado.
