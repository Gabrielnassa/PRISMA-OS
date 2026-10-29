# Plano da próxima etapa — visual novo, acabamento profissional e chave do ChatGPT

Pedido do dono (28/10/2026): aplicar a referência de design `docs/design/DESIGN-referencia.md`, deixar o sistema o mais profissional possível e permitir usar a chave da API da OpenAI (ChatGPT). Este arquivo é a lista de trabalho da sessão agendada; marque cada item ao concluir.

Princípios que continuam valendo: nada falso (botões, dados ou integrações simuladas), credenciais só por variável de ambiente, aprovação humana antes de ações sensíveis, isolamento por cliente, textos da interface em português do Brasil.

## A. Visual novo, seguindo a referência

A referência descreve o estilo de um produto de terceiros (Huly). Usamos a **linguagem visual** (cores, formas, ritmo), nunca o nome, o logotipo ou ilustrações dele. A marca continua sendo PRISMA OS.

1. **Cores (tokens em `src/app/globals.css`)**
   - Fundo do app quase preto (`#090a0c`), cartões `#111111`, bordas `#4a4b50`, texto secundário `#95979e`/`#a9a9aa`, texto principal branco.
   - Ação principal: azul íris `#5683da` com texto branco (um só botão principal por tela).
   - Acento quente: coral `#ff8964` só em pontos de destaque (notificação, etiquetas, ponta de gradiente). Sem terceira cor de acento.
   - Cores de estado (sucesso, alerta, erro) continuam existindo para status, mas discretas.
   - Conferir contraste AA (4,5:1) de todo texto informativo; a referência tem faixas de cinza que reprovam sobre `#303236` — validar antes de usar.
   - Remover os tons violeta/verde-água atuais onde forem marca; manter só se forem estado.
2. **Tipografia**
   - Inter para toda a interface (pacote `@fontsource/inter` já instalado), 14px/1.5 no corpo, tracking levemente negativo.
   - Fonte de destaque para títulos ≥ 28px: Sora (substituta livre indicada na referência; instalar `@fontsource/sora`, licença OFL), com tracking negativo. Nunca abaixo de 28px.
   - Decidir sobre a fonte mono atual (IBM Plex Mono): manter só para números de custo/versão se ajudar a leitura; caso contrário, Inter com `tabular-nums`.
   - Remover Newsreader e Schibsted Grotesk se não forem mais usadas (e tirar dos imports).
3. **Formas**
   - Botões e etiquetas em pílula (raio 9999px); cartões raio 12px; campos raio 4–6px; painéis grandes 30px quando fizer sentido.
   - Elevação por borda e contraste, não por sombra (sombra só em janelas flutuantes e na moldura de captura de tela).
   - Anel de foco visível e consistente.
4. **Componentes** (`src/components/ui.tsx`, `form.tsx`, `inline-action.tsx`, `status.tsx`)
   - Botão principal íris; botão fantasma em pílula com borda; botão branco só na tela de login.
   - Etiquetas/chips: fundo da cor a 12% e texto na cor cheia.
   - Indicadores do dashboard com números grandes na fonte de destaque.
   - Tabelas, alertas, abas, campos e estados vazios no novo estilo.
5. **Tela de login**: o único "feixe aurora" do sistema (gradiente íris → coral → branco, estreito e vertical, sobre `#090a0c`), com uma captura real do produto em moldura. Nada de gradiente em fundo inteiro.
6. **Barra lateral**: item ativo com indicador íris, ícones em linha `#95979e`, agência e usuário no rodapé; desfoque leve só se houver barra superior fixa.
7. **Todas as páginas**: dashboard, clientes (todas as abas), central de criação, conteúdos (lista e editor), aprovações, biblioteca de mídia e de layouts, skills, integrações, custos, usuários, configurações, troca de senha, 404 e erro.
8. **Logo/ícone**: revisar o prisma para conversar com íris e coral (sem copiar a marca da referência).

## B. Acabamento profissional (além das cores)

1. Trocar `window.confirm` por uma janela de confirmação própria, acessível (foco preso, Esc, botão de perigo), usada em arquivar, excluir, descartar alterações e sair com alterações pendentes.
2. Avisos de resultado (salvo, excluído, erro) num padrão único de notificação temporária ("toast"), sem perder as mensagens por campo dos formulários.
3. Carregamento por página com esqueleto do conteúdo (em vez de tela vazia).
4. Tabelas no celular viram lista de cartões; cabeçalho fixo e ordenação nas tabelas longas (conteúdos, custos).
5. Datas relativas onde ajudam ("há 2 h"), com a data completa no `title`.
6. Envio de arquivos com arrastar e soltar e pré-visualização.
7. Estados vazios com a próxima ação real (sem ilustração genérica).
8. Títulos das abas do navegador, favicon e metadados revisados.
9. Revisão de acessibilidade (contraste, foco, rótulos, ordem de tabulação) com o novo visual.
10. Revisão de todos os textos da interface: curtos, diretos, sem jargão técnico.
11. Atualizar as capturas em `docs/img` e o relatório `docs/STATUS.md`.

## C. Chave da API do ChatGPT (OpenAI)

Observação para o dono: a assinatura do ChatGPT (Plus/Pro) **não** dá chave de API. A chave vem de platform.openai.com (API keys), com cobrança separada por uso.

1. Novo provedor em `src/server/ai/providers/openai.ts`, ligado só pelo `gateway.ts` (mesma interface `AiProvider`): saída estruturada com esquema JSON (Responses API), tempo limite, erros traduzidos (chave inválida, sem crédito, limite de uso, recusa), tokens de entrada/saída/cache para custos.
2. Variáveis: `OPENAI_API_KEY`, `OPENAI_MODEL` (padrão: o modelo atual recomendado pela OpenAI — **conferir na documentação oficial no dia**, não inventar nome), `AI_PROVIDER=openai`. Se as duas chaves existirem, `AI_PROVIDER` decide; sem ele, manter Anthropic como padrão.
3. Tarifas da OpenAI em `pricing-defaults.ts` com fonte (página oficial de preços, conferida no dia) e migration para organizações existentes, como foi feito para os modelos de fallback.
4. Esforço/raciocínio: mapear o esforço por skill para o parâmetro equivalente da OpenAI, se o modelo escolhido tiver.
5. Integrações: cartão mostra qual provedor está ativo; "Testar conexão" funciona para os dois.
6. Onde colocar a chave: `.env.example`, `docs/OPERATIONS.md`, Codespaces (secret `OPENAI_API_KEY` em `devcontainer.json` e `COMO-USAR.md`), Mac (`compose.yml` + atalho "Configurar chave da IA" perguntando qual provedor).
7. Testes: unitários contra API simulada (formato do pedido, cabeçalho, esquema, erros, custos); integração com o orquestrador usando o provedor falso; E2E sem chave continua passando. Se `api.openai.com` estiver acessível, um teste manual real só com chave fornecida pelo dono (nunca versionar a chave).

## D. Como entregar

- Antes de começar: `git pull`, Postgres no ar (`pg_ctlcluster 16 main start`), `npm ci`.
- Trabalhar na branch `claude/session-vagl59`, commits pequenos por bloco (A, B, C).
- Antes de cada push: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build` e `npm run test:e2e:prod`.
- Conferir visualmente cada página (desktop e celular) com capturas.
- Ao final: resumo em português para o dono, com o que mudou, prints e como atualizar o Codespace (`bash .devcontainer/atualizar.sh`).

## E. Pedidos do sócio (29/10/2026)

Como a agência trabalha: cada cliente tem um **pacote mensal**, normalmente 8 posts (4 cards ou carrosséis e 4 vídeos curtos). As fotos e os vídeos do cliente ficam numa pasta (ex.: Google Drive).

1. **Pacote e estimativa de custo por cliente**: cadastrar o pacote do mês por cliente (quantidade por formato); mostrar quanto foi produzido no mês × o contratado e uma estimativa do custo de IA por cliente, calculada com o custo médio real por peça quando houver execuções reais e, antes disso, com a tarifa vigente e um consumo típico, sempre identificada como **estimativa**. Usar isso também para sugerir o teto mensal.
2. **Linha editorial com aprovação**: a IA propõe as pautas do mês de acordo com o pacote e o perfil da marca; a equipe edita e aprova; ao aprovar, o sistema cria as peças na fila usando as fotos da biblioteca do cliente; tudo passa pela aprovação de versão que já existe. (Começo da fase 3: calendário editorial.)
3. **Pasta do Google Drive por cliente**: ligar uma pasta do Drive a cada cliente e importar fotos e vídeos para a biblioteca, sem duplicar (hash), com botão "Importar agora" e, se possível, sincronização periódica pela fila. Credenciais só por variável de ambiente (conta de serviço do Google com a pasta compartilhada com ela, ou OAuth). Sem credencial, a tela explica o que falta; nada simulado. Testar contra API simulada se o Google não estiver acessível daqui.
4. **Publicar depois de aprovar (Instagram/Facebook)**: precisa da conta Meta Business de cada cliente conectada (OAuth) e de permissões revisadas pela Meta (`instagram_content_publish`). Nesta etapa: deixar o desenho pronto e documentado (conexão por cliente, botão "Publicar"/"Agendar" só para versão aprovada, confirmação explícita, registro na auditoria). Implementar só a parte que dá para testar de verdade; nada de publicar automaticamente sem confirmação.
5. **Vídeos**: a biblioteca já aceita MP4 e MOV; criação/edição de vídeo fica para a fase seguinte. No pacote, os vídeos contam como itens planejados e acompanhados, feitos fora do sistema por enquanto.
6. **Teste com cliente real**: deixar o caminho pronto para subir as fotos de um cliente piloto e gerar com a chave real (Claude ou OpenAI) assim que ela estiver configurada.

Ordem sugerida: C (chave) → A → B → E1 → E2 → E3 → E4 (preparação).
