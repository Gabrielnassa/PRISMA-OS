# Segurança e proteção de dados

## Modelo de ameaça considerado

1. Usuário autenticado tentando acessar dados de outro cliente ou de outra agência.
2. Falha de programação que esqueça um filtro de organização/cliente numa consulta.
3. Conteúdo externo (briefings, documentos, perfis, URLs) tentando instruir a IA a executar ações.
4. Upload de arquivos maliciosos (tipo falso, SVG com script).
5. Roubo de sessão, força bruta de senha, CSRF.
6. Vazamento de segredos em código, logs ou respostas.

## Isolamento entre organizações e clientes

| Camada | Mecanismo |
| --- | --- |
| Serviços | Toda função recebe o `AuthContext`, filtra pela organização ativa e chama `requireClient` (inexistente e sem acesso são indistinguíveis: 404). |
| Banco — integridade | Chaves estrangeiras compostas `(client_id, organization_id)` impedem registros cruzados. |
| Banco — leitura e escrita | RLS em todas as tabelas. A aplicação usa um usuário que **não é dono das tabelas**; cada transação informa `app.user_id`. Sem usuário, nenhuma linha é visível. |
| Worker | Atua com o contexto do usuário que pediu a tarefa; se ele perdeu o acesso, a tarefa falha. |
| Verificação contínua | `/api/health` e a página Integrações alertam se a conexão da aplicação for dona das tabelas ou ignorar RLS. |

**Limite conhecido:** `app.system = 'on'` é usado em login, sessões, fila e scripts administrativos. O RLS protege contra erros de programação, não contra quem consiga executar SQL arbitrário com o usuário da aplicação (essa pessoa também poderia definir `app.user_id`). Todas as consultas usam parâmetros (`$1`), sem concatenação de entrada do usuário.

Testes: `tests/integration/isolation.test.ts` (organizações, membros sem atribuição, inserção cruzada recusada pelo banco, contexto vazio) e `tests/integration/content-flow.test.ts`.

## Autenticação e sessões

- Senhas com **scrypt** (N=2¹⁵, r=8, p=1, sal aleatório) e comparação em tempo constante; e-mail inexistente consome o mesmo tempo (hash fictício).
- Política mínima: 10 caracteres com letras e números. Usuários convidados recebem senha temporária que **expira em 7 dias** e cuja troca é **obrigatória**: enquanto não for trocada, todas as páginas levam a `/trocar-senha` e as rotas de API respondem 403.
- Sessão: token de 256 bits; só o SHA-256 é guardado. Cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, expiração configurável (`SESSION_TTL_HOURS`).
- Troca de senha e redefinição revogam as outras sessões. A desativação de um membro vale **só para a organização** que a fez (`memberships.deactivated_at`) e revoga apenas as sessões abertas nessa organização; um administrador não consegue bloquear a conta de alguém em outra agência.
- Convidar um e-mail já cadastrado não vincula a conta existente nem revela se ela existe; o vínculo é feito pelo operador da plataforma (`npm run member:add`).
- **Limite de tentativas**: 5 falhas por e-mail ou 30 por IP em 15 minutos bloqueiam novas tentativas; tentativas simultâneas para o mesmo e-mail são serializadas (não é possível contornar o limite em paralelo). O IP vem de `X-Forwarded-For` (último valor, acrescentado pelo proxy) somente com `TRUST_PROXY=true`; sem IP confiável, vale um limite global para "IP desconhecido".
- Redirecionamento após o login só para caminhos internos da aplicação (barras invertidas, caracteres de controle e outras origens são recusados).

## Autorização

Matriz em `src/server/authz/permissions.ts`, verificada **no servidor** em cada ação (a interface apenas reflete as permissões):

| Papel | Pode |
| --- | --- |
| Proprietário | Tudo, inclusive gerenciar proprietários |
| Administrador | Clientes, usuários (exceto proprietários), custos, integrações, todos os clientes |
| Criação | Criar e editar conteúdos, marca, memória e arquivos dos clientes atribuídos |
| Aprovador | Comentar, aprovar e reprovar nos clientes atribuídos |
| Leitura | Consultar e exportar nos clientes atribuídos |

A organização pode exigir que o aprovador seja diferente de quem enviou (Configurações).

## Ações sensíveis e aprovação humana

- Nada é publicado, enviado ou pago automaticamente nesta fase. Publicação e anúncios (fases 4 e 6) exigirão versão aprovada e confirmação explícita.
- Aprovação amarrada ao hash canônico da versão; qualquer edição exige nova aprovação.
- Gerações de IA respeitam o teto mensal por cliente (interrupção configurável); execuções atendidas por modelo sem tarifa entram no teto por estimativa.
- Chamadas de IA repetidas com a mesma chave não são cobradas duas vezes (reaproveitamento ou "já em execução"); chamadas interativas têm limite por pessoa por minuto.
- Exclusões e arquivamentos pedem confirmação explícita na interface.
- Auditoria somente inserção (`audit_logs`, gatilho bloqueia UPDATE/DELETE).

## CSRF e cabeçalhos

- Server Actions: verificação de origem do próprio Next.js.
- Route Handlers que alteram estado (`/api/media`, `/api/contents/:id/preview`) exigem cabeçalho `Origin` igual ao host da aplicação ou `APP_URL`.
- Cabeçalhos globais: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.

## Arquivos

- Permissão verificada **antes** de ler o corpo do envio; `Content-Length` obrigatório e limitado.
- Tipo detectado pelos **bytes iniciais** (PNG, JPEG, GIF, SVG, PDF, MP4, MOV); extensão e Content-Type do navegador são ignorados. WebP é recusado com mensagem clara porque o renderizador das peças não o decodifica (a foto sumiria do PNG exportado).
- SVG com `<script>`, manipuladores `on*`, `javascript:`, `foreignObject`, `iframe`/`embed`/`object` ou referências externas é recusado; SVGs aceitos são servidos com CSP `sandbox`.
- Limite de tamanho (`MAX_UPLOAD_MB`) e de dimensões (12.000 px).
- Chaves de armazenamento geradas pelo servidor e validadas contra *path traversal*; download somente por rota autenticada com RLS.

## Injeção de prompt (seção 20)

- Tudo que vem de usuários — perfil, memória, contexto global, briefing, título da pauta, títulos recentes e a peça enviada para revisão — vai para a IA dentro de blocos delimitados (`<contexto_do_cliente>`, `<memoria_do_cliente>`, `<briefing>`, `<pauta>`, `<titulos_recentes>`, `<peca_para_revisao>`…), todos declarados nas regras como **dados**, nunca instruções.
- Sequências que pareçam marcação dentro desses dados (ex.: `</briefing>`) são neutralizadas antes do envio, para que nenhum texto feche um bloco e "fale" como instrução.
- As skills **não têm ferramentas**: a IA só devolve dados estruturados validados por esquema. Nenhum conteúdo externo pode disparar publicação, gasto ou alteração de permissões.
- A saída passa por validação de esquema, limites de campo e pelo controle de qualidade antes de chegar ao usuário.

## Segredos

- Somente variáveis de ambiente (`.env` fora do Git; `.env.example` sem valores reais).
- A chave da IA nunca chega ao navegador; a interface mostra apenas se há provedor configurado.
- Erros inesperados são registrados no servidor e o usuário recebe mensagem genérica.

## LGPD

- Dados pessoais armazenados: nome e e-mail de usuários, IP e user-agent de sessões e tentativas de login (o e-mail das tentativas é guardado como hash), contatos/responsáveis informados no perfil do cliente.
- Finalidade: autenticação, auditoria e operação dos serviços contratados pela agência.
- Exclusão: memórias são excluíveis pela interface. A exclusão completa de um cliente usa `ON DELETE CASCADE` e exige `app.allow_purge = 'on'` para remover versões e auditoria (procedimento em [OPERATIONS.md](OPERATIONS.md)). Ainda não há tela de exclusão completa de cliente.
- Recomenda-se definir a política de retenção de `login_attempts`, `sessions` e `audit_logs` com o encarregado (DPO) da agência.
- Provedor de IA: o contexto do cliente é enviado à API da Anthropic para gerar conteúdo. Verifique os termos de retenção de dados da conta antes de usar dados sensíveis.

## Dependências

`npm audit` reporta `braces` (ReDoS) via `eslint-config-next`, ferramenta **apenas de desenvolvimento**, sem correção publicada no momento. O `fflate` usado pelo Satori foi fixado em 0.8.3 (corrige GHSA-px8p-9vwx-vf98) via `overrides`.
