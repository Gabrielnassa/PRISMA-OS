# Relatório da etapa — Fase 1 + primeira entrega obrigatória

Relatório no formato da seção 29 da especificação. Data: 22/10/2026. Branch: `claude/session-vagl59`.

## 1. Objetivo e funcionalidades implementadas

Objetivo da etapa (seções 25, 26 e 30): fundação do PRISMA OS e o ciclo completo em um cliente — **briefing → texto → arte → revisão → aprovação → exportação → histórico** — com autenticação, modelo de dados, gestão de clientes, testes e documentação.

| Área | Implementado |
| --- | --- |
| Autenticação e acesso | Login com sessões no PostgreSQL (token com hash), papéis (proprietário, administrador, criação, aprovador, leitura), acesso por cliente, troca obrigatória da senha temporária (expira em 7 dias), limite de tentativas serializado por e-mail, desativação por organização, nova senha temporária gerada pelo administrador |
| Multicliente | Isolamento por organização e por cliente no serviço **e** no banco (RLS com usuário de aplicação que não é dono das tabelas, chaves estrangeiras compostas) |
| Clientes | Cadastro, perfil de marca completo (negócio, público, voz, identidade visual, canais, ofertas confirmadas, referências), memória com fatos/preferências/hipóteses/sugestões, arquivos |
| Mídia | Upload com tipo detectado pelos bytes, SVG perigoso recusado, orientação EXIF aplicada, limites de tamanho e dimensões, permissão verificada antes de ler o corpo |
| Central de criação | Pedido com cliente, canal, formato (post, carrossel, story), objetivo, briefing estruturado, fotos, template preferido; sugestão de pautas por IA; criação manual pelo template sem IA |
| IA | Gateway de provedores (Anthropic + demonstração), 4 skills versionadas (`planner.ideas`, `copywriter.social`, `art-director.rules`, `quality.ai-review`), orquestrador com camadas de contexto, idempotência, limites, registro de custo por modelo |
| Skills da agência | Skills escritas pela agência ou importadas de um SKILL.md (nome, descrição e instruções; scripts e arquivos extras não rodam), para todos os clientes ou exclusivas de um; versão imutável a cada alteração; execução pelo mesmo orquestrador (contexto do cliente, regras invioláveis, limite por pessoa, teto de custo, idempotência contra clique duplo, registro em `ai_runs` como `custom:<id>`); histórico por skill; resultado vira briefing de uma peça; exportação em SKILL.md; gestão só por proprietário/administrador, execução também pela criação |
| Cores da marca | "Sugerir cores" no perfil da marca: lê logotipo, fotos ou um print do perfil (PNG, JPEG, GIF, SVG), agrupa as cores por proximidade perceptual (CIELAB) e propõe primária, secundária, destaque, fundo e texto com contraste mínimo de 4,5:1 entre texto e fundo; pelo @ do Instagram com a API oficial da Meta (Business Discovery: foto de perfil e até 9 posts; opcionalmente guarda a foto como logotipo). Só preenche o formulário: nada é salvo sem a pessoa revisar |
| Exclusão definitiva | Peças (na página da peça ou em lote) e clientes (confirmação pelo nome, conferida no servidor), só proprietário e administrador; recusa o que está em geração; apaga versões, aprovações, comentários, arquivos (também do armazenamento), memória, tarefas e skills exclusivas; custos de IA continuam nos totais, sem o texto gerado; auditoria registra quem excluiu |
| Fila | Tarefas no PostgreSQL com `SKIP LOCKED`, tentativas com backoff, renovação de reserva, recuperação de tarefas interrompidas, reprocessamento manual com histórico |
| Motor de layout | 18 templates originais (6 famílias × 3), proporções 1:1, 4:5 e 9:16, SVG/PNG no servidor (Satori + resvg), texto medido com as fontes reais, limites de caracteres calibrados por layout |
| Editor | Textos por campo com contadores do limite efetivo, tema, alinhamento, escala, foto com foco/zoom, template, cores, fontes, logotipo, lâminas (adicionar, duplicar, mover, remover), pré-visualização ao vivo, aviso de alterações não salvas |
| Qualidade | Verificações automáticas (texto cortado, contraste WCAG, glifos ausentes, marca, termos proibidos, CTA, números sem fonte, ofertas não confirmadas, resolução, texto alternativo…) e revisão consultiva por IA |
| Aprovação | Vinculada ao hash da versão exata; alteração exige nova aprovação; reprovação gera sugestão revisável na memória do cliente |
| Exportação e histórico | PNG/ZIP com legenda e textos alternativos (rascunhos identificados); versões imutáveis com comparação e restauração; auditoria somente inserção |
| Gestão | Dashboard com dados reais e filtros por cliente, período, canal e status; custos por execução e por cliente, tarifas com fonte, tetos mensais; integrações com diagnóstico e teste real; usuários e permissões; configurações |

Módulos das fases 3–6 (estratégias, calendário, automações, relatórios, sites, campanhas) aparecem no menu como "próximas fases", desabilitados — nada é simulado.

**Interface (redesenho de 28/10/2026).** Visual sóbrio e editorial sobre a mesma paleta (grafite, violeta e verde-água), sem degradês, brilhos ou rótulos em caixa alta: Newsreader nos títulos e números de destaque, Schibsted Grotesk na interface e IBM Plex Mono em metadados (datas, versões, custos, códigos), todas servidas pelo próprio sistema. Botão principal claro; violeta reservado a navegação ativa, foco, seleção e links; verde-água para estados positivos. Nova marca (prisma de duas faces), tela de acesso com painel da marca, barra lateral com agência, estado da IA e usuário, indicadores em faixa única com divisórias finas, estados com ponto colorido, tabelas e alertas mais discretos. Textos informativos com contraste mínimo AA (4,5:1); só itens desativados ficam abaixo disso. Corrigidos no caminho: rolagem horizontal no celular na página da peça (já existia) e na de custos, status de execuções em inglês ("succeeded") nas telas de custos e da peça, e a dica de primeiro acesso da tela de login, que mostrava um comando técnico.

## 2. Arquivos e módulos

| Caminho | Conteúdo |
| --- | --- |
| `db/migrations/0001_foundation.sql`, `0002_review_hardening.sql`, `0003_custom_skills.sql` | Esquema, RLS, gatilhos de imutabilidade, ajustes da revisão e skills da agência |
| `src/server/db` | Pool, transações com contexto (`app.user_id` / `app.system`), migrações com checksum |
| `src/server/auth`, `src/server/authz`, `src/lib/safe-redirect.ts` | Senhas (scrypt), sessões, cookies, matriz de permissões, redirecionamento seguro |
| `src/server/services` | Organizações, usuários, clientes, mídia, conteúdo (versões, aprovações, exportação), skills da agência, custos, dashboard, saúde, auditoria |
| `src/lib/skills` | Leitura e escrita de SKILL.md e modelos de partida |
| `src/server/brand/palette.ts`, `src/server/integrations/instagram.ts`, `src/server/services/brand-colors.ts` | Extração de paleta (resvg + CIELAB), consulta Business Discovery da Meta e sugestão de cores |
| `src/server/services/deletion.ts`, `src/components/content-table.tsx` | Exclusão de peças (uma ou em lote) e de clientes; tabela de conteúdos com seleção |
| `src/server/ai`, `src/server/orchestrator`, `src/server/skills` | Gateway, provedores, esquema JSON da saída estruturada, tarifas iniciais, orquestrador e skills |
| `src/server/jobs`, `scripts/worker.ts` | Fila, worker, geração de conteúdo |
| `src/server/render`, `src/lib/content/limits.ts` | Motor de layout, fontes, templates, calibração de capacidade |
| `src/server/quality` | Controle de qualidade por regras |
| `src/app`, `src/components` | Interface (App Router), formulários (`ActionForm`, `InlineAction`), rotas de API |
| `scripts` | Desenvolvimento, migrations, primeiro administrador, vínculo de conta (`member:add`), calibração, amostras |
| `tests` | Unitários, integração (PostgreSQL real) e E2E (Playwright) |
| `docs` | Arquitetura, segurança, operação, decisões, este relatório e capturas de tela |

## 3. Mudanças no banco

- **0001_foundation**: `organizations`, `users`, `memberships`, `sessions`, `login_attempts`, `clients`, `client_access`, `brand_profiles`, `client_memories`, `media_assets`, `content_items`, `content_versions`, `quality_reports`, `approvals`, `content_comments`, `provider_prices`, `ai_runs`, `client_budgets`, `jobs`, `job_attempts`, `audit_logs`; RLS em todas as tabelas; papel `prisma_app` sem posse das tabelas; versões e auditoria imutáveis (exclusão só com `app.allow_purge`).
- **0002_review_hardening**: `memberships.deactivated_at` e `last_access_at` (ativação por organização; `app_org_role` passa a considerá-la), `users.password_set_at` (validade da senha temporária), `media_assets.orientation` (EXIF), `ai_runs.estimated_cost_usd` e `usage_breakdown` (custo por modelo e estimativa para o teto), limite de `jobs.max_attempts` ampliado para reprocessamentos, `job_attempts.duration_ms` em `bigint`, tarifas dos modelos de fallback para organizações existentes.
- Sem migration nova para cores e exclusão: a exclusão usa as cascatas existentes e liga `app.allow_purge` só na transação que apaga; antes disso, desvincula as execuções de IA (`ai_runs`) da peça ou do cliente, para os custos continuarem nos totais.
- **0003_custom_skills**: `custom_skills` (nome único por organização, sem diferenciar maiúsculas; escopo opcional por cliente com chave composta) e `custom_skill_versions` (somente inserção: o papel da aplicação não tem UPDATE/DELETE); RLS: leitura por membros (skill de cliente só para quem acessa o cliente), escrita por administradores.

## 4. Testes executados e resultados reais

Executados em 28/10/2026 neste ambiente (Node 22, PostgreSQL 16 local, Chromium do Playwright):

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | sem erros |
| `npm run lint` | sem erros nem avisos |
| `npm test` (Vitest: unitários + integração com PostgreSQL real) | **17 arquivos, 165 testes aprovados**, 0 falhas |
| `npm run test:e2e` (Playwright, `next dev` + worker) | **4/4 aprovados** (ciclo completo; cores pelo logotipo e exclusão de peças e cliente; skills da agência; celular, inclusive a página da peça sem rolagem horizontal) |
| `npm run build` + `npm run test:e2e:prod` (build de produção) | build concluído; **4/4 aprovados** (sem chave, o botão de executar skill fica desativado com o aviso) |

Destaques da cobertura: isolamento entre organizações e clientes (RLS efetivo, inserção cruzada recusada pelo banco); ciclo completo com versões e aprovação vinculada; invalidação da aprovação quando a peça muda; bloqueio por termo proibido; fila (backoff, recuperação, reserva perdida, reprocessamento com histórico); idempotência da IA (reaproveitamento, chamada simultânea não paga duas vezes); custo por modelo no fallback e estimativa sem tarifa no teto; contexto correto enviado à IA sem dados de outro cliente; login (limite em paralelo, senha temporária vencida, convite de e-mail existente, desativação por organização); redirecionamento seguro; provedor Anthropic contra API simulada (esquema com `enum`, esforço, recusa, erros recuperáveis); todos os 18 templates em todas as proporções sem texto cortado e com textos no limite efetivo; dashboard com filtros e isolamento; skills da agência (versões a cada alteração, edição simultânea recusada, nome repetido, permissões por papel, skill exclusiva invisível para quem não acessa o cliente e recusada em outro cliente, outra organização sem acesso, versões imutáveis no banco, contexto do cliente e regras invioláveis enviados à IA, custo com o nome da skill, clique duplo sem cobrança dupla, histórico filtrado pelo acesso, leitura e exportação de SKILL.md); origens aceitas no túnel do Codespaces só dentro de um Codespace; paleta (logotipo de duas cores, marca em preto e branco, fundo escuro com contraste, peso do logotipo sobre fotos, SVG, formatos não lidos), consulta à Meta contra API simulada (token só no cabeçalho, @ e link do perfil normalizados, só imagens do CDN da Meta com tipo e tamanho conferidos, erros traduzidos, configuração inválida sem derrubar o sistema), sugestão por imagens de outro cliente ou já excluídas recusada; exclusão (versões, aprovações, comentários e relatórios apagados, custos mantidos sem o texto gerado, peças em geração preservadas, lote ignorando outra organização, cliente só com o nome certo e sem gerações pendentes, todas as tabelas do cliente e os arquivos do armazenamento apagados, outro cliente intacto, permissões por papel). O E2E também confirma que um erro devolvido pelo servidor não apaga o formulário, que descartar alterações mantém o editor utilizável e que sair pelo menu com alterações pendentes pede confirmação.

### Testes de aceitação (seção 27)

| # | Critério | Situação e evidência |
| --- | --- | --- |
| 1 | Usuário autorizado autentica | ✅ `auth.test.ts`, E2E |
| 2 | Cadastrar cliente e configurar marca | ✅ E2E (passos 1–3), `content-flow.test.ts` |
| 3 | IA usa o contexto correto | ✅ `jobs-costs.test.ts` ("a IA recebe o contexto do cliente certo…") |
| 4 | Gerar conteúdo por integração real | ⚠️ **Parcial.** Integração Anthropic implementada e testada contra a API simulada no nível do SDK; **não foi exercitada contra a API real** porque não há `ANTHROPIC_API_KEY` neste ambiente. Ver "Configurações pendentes" |
| 5 | Resultado salvo no banco | ✅ `content-flow.test.ts`, E2E |
| 6 | Peça realmente renderizada, visualizada e editada | ✅ E2E (PNG 1080×1350 conferido no ZIP), `templates-quality.test.ts` |
| 7 | Aprovação vinculada à versão correta | ✅ `content-flow.test.ts`, E2E |
| 8 | Reprovado não é publicado | ✅ Não há publicação automática nesta fase; a versão reprovada nunca vira a oficial e sai como rascunho na exportação (`content-flow.test.ts`); o E2E confere que o ZIP oficial contém só a versão aprovada |
| 9 | Dados dos clientes isolados | ✅ `isolation.test.ts`, `dashboard.test.ts` |
| 10 | Falhas registradas, sem duplicidade | ✅ `jobs-costs.test.ts`, idempotência em `content-flow.test.ts` |
| 11 | Tarefas assíncronas com status verificável | ✅ `jobs`/`job_attempts`, `/api/contents/:id/status`, E2E |
| 12 | Consumo registrado | ✅ `jobs-costs.test.ts` (tokens, tarifa, custo por modelo) |
| 13 | Permissões no backend | ✅ `rules.test.ts`, `isolation.test.ts`, `content-flow.test.ts` |
| 14 | Interface em diferentes telas | ✅ E2E desktop e celular (sem rolagem horizontal) |
| 15 | Documentação reproduz o ambiente | ✅ README (início rápido), OPERATIONS.md; o E2E recria o ambiente do zero a cada execução |

### Correções após a revisão

Ao capturar as telas para a página de apresentação, apareceram mais três problemas, já corrigidos e cobertos por testes: pedidos de **post** e **story** eram recusados (a interface envia uma lâmina e a validação exigia duas); um erro interno inesperado aparecia para a pessoa com a mensagem técnica crua (agora ela vê uma mensagem clara e o detalhe fica no registro); e, no modo demonstração, uma oferta longa era cortada no destaque ("15% de desconto até"), hoje ela entra inteira ou vai completa para o texto.

### Revisão adversarial

Depois da primeira versão, uma revisão em várias frentes levantou **61 achados** (9 de segurança, 11 de integridade de dados, 11 de IA, 14 de renderização e 16 de interface). Todos foram corrigidos; os principais ganharam testes de regressão. Exemplos: desativação de membro afetando outras organizações, vínculo silencioso de contas por convite, redirecionamento externo após login, IP forjável no limite de login, troca de senha temporária não exigida, upload lido antes da checagem de permissão, conteúdo preso em "gerando", chamada de IA paga duas vezes, custo do fallback sem tarifa fora do teto, `enum` removido da saída estruturada, fotos WebP sumindo do PNG, orientação EXIF ignorada, limites de texto acima do espaço real, formulários apagados após erro.

## 5. Integrações efetivamente conectadas

| Integração | Situação |
| --- | --- |
| PostgreSQL | Conectado e testado (desenvolvimento, testes e E2E) |
| Armazenamento local de arquivos | Conectado e testado |
| Anthropic (Claude) | Implementada (`claude-opus-5-5`, saída estruturada, fallback do servidor); testada contra API simulada; **conexão real pendente de chave**. O botão "Testar conexão" em Integrações faz a verificação real assim que a chave for definida |
| OpenAI (ChatGPT) | Implementada (Responses API, saída em JSON Schema estrito, esforço por skill, `store: false`, custos com cache separado e cobrança da versão datada pela tarifa do modelo pedido); testada contra API simulada no nível do SDK oficial (v7.45.1). **Conexão real pendente de chave**; o site da OpenAI não estava acessível daqui, então modelo padrão (`gpt-6.1-sol`) e lista de modelos vêm do SDK oficial, e as tarifas de agregadores (conferir em Custos e consumo) |
| Provedor de demonstração | Ativo nos testes; bloqueado em produção e identificado como "Demonstração" |
| Meta (Instagram Business Discovery) | Implementada para sugerir cores pelo @ (foto de perfil e posts de contas comerciais ou de criador); testada contra API simulada; **conexão real pendente de token** (`META_ACCESS_TOKEN` e `META_IG_USER_ID`). Os domínios da Meta não estavam acessíveis neste ambiente, então a consulta segue a documentação pública da Graph API; a primeira consulta real confirma. Sem token, a tela de Integrações mostra o que falta e a sugestão funciona por imagens |
| Redes sociais (publicação), e-mail, n8n, Meta/Google Ads, Analytics, Drive, S3 | Não conectados (fases seguintes); nada é apresentado como conectado |

## 6. Configurações pendentes

**Instalação local disponível.** A pasta `mac/` instala o sistema completo (banco, migrations, site e worker em Docker) num Mac, com atalhos de dois cliques para iniciar, parar, fazer e restaurar backup, atualizar, configurar a chave da IA e redefinir senha (guia: `mac/LEIA-ME.md`). Testado neste ambiente com Docker: primeira instalação interativa (inclusive senha fraca recusada), login no navegador sobre `http://localhost`, criação e edição de peça, download de rascunho, backup, restauração que de fato volta banco e arquivos, persistência ao parar e iniciar, troca da chave da IA e redefinição de senha. Não testado aqui: a execução num Mac real (o comportamento do macOS com arquivos baixados está descrito no guia) e o atalho de atualização de ponta a ponta.

**Execução pelo GitHub Codespaces.** A pasta `.devcontainer/` sobe banco, site e worker num Codespace privado (botão no README; guia: `.devcontainer/COMO-USAR.md`), com senhas do banco geradas por Codespace, chave da IA como secret do Codespaces, `npm run primeiro-acesso` guiado e backup baixável que também restaura na instalação do Mac. Os scripts de preparação, início, reinício, backup e atualização foram testados aqui simulando o ambiente (inclusive o proxy de portas do Codespaces: origem do Codespace aceita com cookie seguro, origem estranha recusada). No primeiro Codespace real, a criação, o build, as migrations e o primeiro acesso funcionaram, mas o site e o worker caíam logo depois do postStartCommand (o Codespace fecha o terminal da inicialização e o SIGHUP chegava antes do setsid/nohup); corrigido ignorando SIGHUP no script e esperando o site responder antes de terminar, com a falha reproduzida e a correção validada aqui num terminal que fecha ao fim do script. O túnel de portas do Codespaces também inverte os cabeçalhos (endereço público em `x-forwarded-host` e `Origin` trocado por `localhost:3000`), o que fazia o Next recusar o login como CSRF; a configuração aceita essa combinação só quando `CODESPACE_NAME` está definido (fora do Codespace a mesma requisição continua recusada, e origens estranhas são recusadas nos dois casos). A mesma regra passou a valer para as rotas de API que alteram estado (envio de arquivos e pré-visualização do editor), que teriam o mesmo bloqueio; ela fica num único lugar (`src/lib/allowed-origins.ts`). Também foi corrigida a criação de peças pelo acesso em `http` na rede local (Tailscale): o navegador não oferece `crypto.randomUUID` fora de contexto seguro e a página quebrava. Não testado aqui: a instalação do cliente PostgreSQL 16 pela imagem (sem ele, só o backup fica indisponível, com aviso) e o `initializeCommand` (sem ele, o banco usa senhas fixas de desenvolvimento, sem porta exposta).

1. `ANTHROPIC_API_KEY` no ambiente do servidor (e, se desejado, `ANTHROPIC_EFFORT`). Depois: Integrações → "Testar conexão" e uma geração real para fechar o critério 4.
2. `APP_URL` com a URL pública e `TRUST_PROXY=true` somente atrás de proxy confiável.
3. Usuários de banco separados (migrations × aplicação) no ambiente de produção — ver OPERATIONS.md.
4. Volume persistente para `STORAGE_LOCAL_DIR` e rotina de backup do banco + arquivos.
5. Conferir as tarifas cadastradas com a tabela vigente da Anthropic antes do uso comercial.
6. Opcional: `META_ACCESS_TOKEN` e `META_IG_USER_ID` para sugerir cores pelo @ do Instagram (passo a passo em OPERATIONS.md). Para o token não expirar, use um usuário do sistema do Gerenciador de Negócios.

## 7. Custos conhecidos ou estimados

- **Tarifas cadastradas** (fonte: tabela pública da Anthropic): Claude Opus 5.5 — US$ 4 por milhão de tokens de entrada, US$ 20 de saída, US$ 0,20 de leitura de cache, US$ 5 de escrita de cache. Modelos de fallback (Claude Opus 5 e Claude Opus 4.8) — US$ 5 entrada / US$ 25 saída (cache cobrado como entrada, por não haver tarifa própria cadastrada).
- **Custo real** é medido por execução (tokens informados pela API × tarifa vigente) e aparece em Custos e consumo, por cliente e por skill.
- **Estimativa ilustrativa, não medida**: uma geração de carrossel com ~6 mil tokens de entrada e ~4 mil de saída (incluindo o raciocínio do modelo) custaria cerca de 6.000 × 4/10⁶ + 4.000 × 20/10⁶ ≈ **US$ 0,10**. O valor real depende do tamanho do briefing e do perfil, do esforço e do aproveitamento de cache; confirme com as primeiras execuções reais.
- Infraestrutura: PostgreSQL e um processo web + um worker; sem outros serviços pagos nesta fase.

## 8. Riscos identificados

- **IA real ainda não exercitada** neste ambiente: o formato da resposta, a latência e o custo reais precisam ser conferidos com a chave (critério 4).
- Conta presente em mais de uma organização entra na organização mais antiga ativa; não há seletor de organização.
- Armazenamento local: sem volume persistente e backup conjunto, arquivos podem se perder em reimplantações.
- Senhas temporárias são exibidas na tela (não há envio por e-mail ainda).
- WebP é recusado no envio até haver conversão no servidor.
- Fontes de clientes (TTF/OTF próprios) ainda não podem ser enviadas; só as fontes OFL empacotadas.
- Consulta pelo @ do Instagram ainda não exercitada contra a Meta real: o app pode precisar de revisão ou de acesso avançado às permissões, e tokens de usuário expiram (cerca de 60 dias no de longa duração). Se o CDN da Meta entregar WebP, essa imagem é ignorada (o leitor de cores aceita PNG, JPEG, GIF e SVG).
- A exclusão definitiva não tem lixeira: arquivar continua sendo o caminho reversível, e o backup é a única forma de recuperar algo excluído.
- Dependência de desenvolvimento com alerta (`braces`, via `eslint-config-next`); `npm audit --omit=dev` não aponta vulnerabilidades.
- Ferramentas de terceiros podem alterar APIs (Next.js 16, SDK da Anthropic, Satori): atualize uma por vez e rode toda a suíte.

## 9. Próximos passos prioritários

1. Configurar a chave da Anthropic, testar a conexão e validar 3–5 gerações reais (qualidade, custo, tempo) com um cliente piloto.
2. Geração em lote (vários itens por pedido, tolerando falhas parciais) e alternativas de texto por lâmina.
3. Fase 3: calendário editorial, workflows A/B/E com ativação, pausa e execução manual, notificações e controles de consumo ampliados.
4. Armazenamento S3/Supabase Storage e envio de e-mail (convites e senhas).
5. Novos formatos (anúncio, banner, capa, peça promocional) e upload de fontes próprias dos clientes.
6. Seletor de organização para contas em mais de uma agência.
