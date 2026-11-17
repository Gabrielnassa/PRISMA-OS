/**
 * Dados de demonstração para desenvolvimento, capturas de tela e testes
 * visuais: a "Agência Demonstração", separada de qualquer agência real, com
 * 8 clientes e cerca de 60 peças em todos os estados, linhas editoriais,
 * aprovações (da equipe e do cliente), publicações com métricas, custos de
 * IA, responsáveis, prazos e avisos.
 *
 * Uso: npm run seed:demo           (banco de desenvolvimento, do .env)
 *      DEMO_PASSWORD=... npm run seed:demo
 *
 * Tudo passa pelos serviços do próprio sistema. A IA é um provedor local
 * deste script (textos tirados do briefing, sem chamar API nenhuma), com
 * consumo de tokens fixo para os custos aparecerem. Recusa rodar em produção
 * e se a agência de demonstração já existir.
 */
import { loadDotEnv } from "./load-env";

loadDotEnv();

if (process.env.NODE_ENV === "production") {
  console.error("seed:demo não roda em produção.");
  process.exit(1);
}
// Sem nenhuma chamada externa: o provedor de IA é o deste script.
process.env.AI_PROVIDER = "none";
// O limite de gerações por minuto protege o uso real; aqui são dezenas de uma vez.
process.env.GENERATION_RATE_PER_MINUTE = "600";

const DEMO_ORG = "Agência Demonstração";
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@prisma.local";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demonstracao-123";

const { createOrganizationWithOwner } = await import("../src/server/services/organizations");
const { login, resolveSession } = await import("../src/server/auth/service");
const { inviteMember, updateMember } = await import("../src/server/services/users");
const { createClient, getClient, updateBrandProfile } = await import("../src/server/services/clients");
const { setPackage } = await import("../src/server/services/packages");
const { proposeEditorialPlan, approveEditorialPlan, currentMonth, shiftMonth } =
  await import("../src/server/services/editorial");
const content = await import("../src/server/services/content");
const { setAssignment } = await import("../src/server/services/tasks");
const { setProviderOverride } = await import("../src/server/ai/gateway");
const { processNextJob } = await import("../src/server/jobs/worker");
const { withTx, systemCtx, maybeOne, one } = await import("../src/server/db");
const { closePool } = await import("../src/server/db/pool");
type AiProvider = import("../src/server/ai/types").AiProvider;
type StructuredRequest<T> = import("../src/server/ai/types").StructuredRequest<T>;

/** IA local do seed: o texto vem do briefing; o consumo é fixo para gerar custos. */
class SeedProvider implements AiProvider {
  readonly id = "anthropic" as const;
  readonly label = "Dados de demonstração";
  readonly model = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
  readonly isDemo = false;
  async generateStructured<T>(req: StructuredRequest<T>) {
    if (!req.demo) throw new Error("skill sem saída de demonstração");
    const usage = { inputTokens: 3200, outputTokens: 1400, cacheReadTokens: 2600, cacheWriteTokens: 0 };
    return {
      data: req.schema.parse(req.demo()),
      usage,
      usageByModel: [{ model: this.model, usage }],
      model: this.model,
      provider: this.id,
      isDemo: false,
      stopReason: "end_turn",
      durationMs: 1800,
    };
  }
  async ping() {
    return { ok: true, detail: "Provedor local do seed." };
  }
}

async function drain() {
  while (await processNextJob("seed-demo")) {
    // processa a fila
  }
}

async function authFor(email: string, password: string) {
  const { token } = await login({ email, password, ip: "127.0.0.1" });
  const auth = await resolveSession(token);
  if (!auth) throw new Error(`Sessão não resolvida para ${email}`);
  return auth;
}

const CLIENTS = [
  {
    name: "Coli Loterias",
    segment: "Loterias",
    tone: "Próximo e animado, sem prometer ganhos.",
    colors: ["#1d4ed8", "#facc15"],
    pkg: { posts: 2, carousels: 2, stories: 0, videos: 4 },
    plan: "approve",
  },
  {
    name: "Clínica Bem Viver",
    segment: "Saúde",
    tone: "Acolhedor, claro, sem jargão técnico.",
    colors: ["#0f766e", "#99f6e4"],
    pkg: { posts: 3, carousels: 3, stories: 2, videos: 0 },
    plan: "approve",
  },
  {
    name: "Padaria Trigo & Mel",
    segment: "Alimentação",
    tone: "Caseiro e afetivo.",
    colors: ["#92400e", "#fde68a"],
    pkg: { posts: 4, carousels: 2, stories: 2, videos: 0 },
    plan: "approve",
  },
  {
    name: "Café da Esquina",
    segment: "Cafeteria",
    tone: "Descontraído, frases curtas.",
    colors: ["#3f2a1d", "#f5e6d3"],
    pkg: { posts: 3, carousels: 3, stories: 0, videos: 2 },
    plan: "approve",
  },
  {
    name: "Studio Arco",
    segment: "Arquitetura",
    tone: "Elegante e técnico na medida.",
    colors: ["#111827", "#d1d5db"],
    pkg: { posts: 2, carousels: 4, stories: 0, videos: 0 },
    plan: "approve",
  },
  {
    name: "Ótica Clara",
    segment: "Varejo",
    tone: "Direto e simpático.",
    colors: ["#7c3aed", "#ede9fe"],
    pkg: { posts: 4, carousels: 0, stories: 0, videos: 0 },
    plan: "draft",
  },
  {
    name: "Academia Movimento",
    segment: "Fitness",
    tone: "Energia alta, frases de ação.",
    colors: ["#dc2626", "#fee2e2"],
    pkg: null,
    plan: "none",
  },
  {
    name: "Pet Amigo",
    segment: "Pet shop",
    tone: "Divertido e carinhoso.",
    colors: ["#ea580c", "#ffedd5"],
    pkg: null,
    plan: "none",
  },
] as const;

const EXTRA = [
  ["Academia Movimento", "Treino de 20 minutos para a semana", "post"],
  ["Academia Movimento", "Mitos sobre musculação", "carousel"],
  ["Academia Movimento", "Horários de feriado", "story"],
  ["Pet Amigo", "Banho e tosa: o que está incluso", "carousel"],
  ["Pet Amigo", "Vacinas do primeiro ano", "carousel"],
  ["Pet Amigo", "Promoção de ração na sexta", "post"],
  ["Ótica Clara", "Exame de vista gratuito no sábado", "post"],
  ["Ótica Clara", "Como escolher a armação", "carousel"],
  ["Ótica Clara", "Lentes para quem usa tela o dia todo", "carousel"],
  ["Academia Movimento", "Aula experimental grátis", "post"],
  ["Academia Movimento", "Alongamento antes da corrida", "carousel"],
  ["Pet Amigo", "Cuidados com o calor", "carousel"],
  ["Pet Amigo", "Conheça a equipe", "post"],
  ["Café da Esquina", "Novo blend da casa", "post"],
  ["Studio Arco", "Projeto da semana: cozinha integrada", "carousel"],
  ["Clínica Bem Viver", "Check-up anual: o que pedir", "carousel"],
  ["Padaria Trigo & Mel", "Encomendas de fim de ano", "post"],
  ["Coli Loterias", "Resultado do bolão da semana", "post"],
  ["Coli Loterias", "Como funciona a cota de bolão", "carousel"],
  ["Clínica Bem Viver", "Vacinação de adultos", "post"],
] as const;

async function main() {
  const exists = await withTx(systemCtx("seed.check"), (tx) =>
    maybeOne(tx, "SELECT 1 FROM organizations WHERE name = $1", [DEMO_ORG]),
  );
  if (exists) {
    console.error(
      `A "${DEMO_ORG}" já existe neste banco. Use um banco vazio (ex.: recrie o de desenvolvimento) para popular de novo.`,
    );
    process.exitCode = 1;
    return;
  }
  setProviderOverride(new SeedProvider());
  await createOrganizationWithOwner({
    organizationName: DEMO_ORG,
    ownerName: "Gabriel Demonstração",
    ownerEmail: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  const owner = await authFor(DEMO_EMAIL, DEMO_PASSWORD);
  const ana = await inviteMember(owner, { name: "Ana Criação", email: "ana@prisma.local", role: "editor" });
  const bruno = await inviteMember(owner, { name: "Bruno Aprovação", email: "bruno@prisma.local", role: "reviewer" });

  const month = currentMonth();
  const ids = new Map<string, string>();
  for (const c of CLIENTS) {
    const { id } = await createClient(owner, { name: c.name, segment: c.segment });
    ids.set(c.name, id);
    const { brand } = await getClient(owner, id);
    brand.business.companyName = c.name;
    brand.audience.targetAudience = "Clientes do bairro e da região";
    brand.voice.tone = c.tone;
    brand.visual = {
      ...brand.visual,
      configured: true,
      colors: { ...brand.visual.colors, primary: c.colors[0], secondary: c.colors[1] },
    };
    await updateBrandProfile(owner, id, brand);
    if (c.pkg) await setPackage(owner, id, c.pkg);
    if (c.plan !== "none") {
      const r = await proposeEditorialPlan(owner, id, {
        month,
        useAi: true,
        theme: `Destaques de ${c.segment.toLowerCase()} do mês`,
      });
      if (c.plan === "approve") await approveEditorialPlan(owner, r.planId);
    }
  }
  const all = [...ids.values()];
  await updateMember(owner, ana.userId, { role: "editor", isActive: true, clientIds: all });
  await updateMember(owner, bruno.userId, { role: "reviewer", isActive: true, clientIds: all });

  for (const [client, title, format] of EXTRA) {
    await content.createContent(owner, {
      clientId: ids.get(client)!,
      title,
      channel: "instagram",
      format,
      objective: "engagement",
      briefing: {
        text: `${title}. Texto claro, com informações confirmadas pelo cliente e chamada para o WhatsApp.`,
        cta: "Fale com a gente",
      },
      slideCount: format === "carousel" ? 4 : 1,
      mode: "ai",
      requestId: crypto.randomUUID(),
    });
  }
  await drain();

  // Estados: aprovada, aguardando, reprovada, em revisão, arquivada.
  const pieces = await withTx(
    systemCtx("seed.list"),
    async (tx) =>
      (
        await tx.query<{ id: string; client_id: string; title: string; current_version_id: string }>(
          // Ordem estável entre execuções e entre bancos (nome do cliente em ordem de bytes, não o id
          // aleatório nem a collation do banco): as capturas dependem dela.
          'SELECT ci.id, ci.client_id, ci.title, ci.current_version_id FROM content_items ci JOIN clients c ON c.id = ci.client_id WHERE ci.organization_id = $1 AND ci.status = \'in_review\' ORDER BY c.name COLLATE "C", ci.created_at, ci.title COLLATE "C"',
          [owner.organizationId],
        )
      ).rows,
  );
  const byClient = new Map<string, typeof pieces>();
  for (const p of pieces) byClient.set(p.client_id, [...(byClient.get(p.client_id) ?? []), p]);
  const approved: Array<{ id: string; clientId: string; versionId: string; title: string }> = [];
  let k = 0;
  for (const [clientId, list] of byClient) {
    for (const [i, p] of list.entries()) {
      const slot = (i + k) % 6;
      if (slot === 0 || slot === 3) {
        const { approvalId } = await content.submitForApproval(owner, p.id, { versionId: p.current_version_id });
        await content.decideApproval(owner, approvalId, { decision: "approved", note: "Pode publicar." });
        approved.push({ id: p.id, clientId, versionId: p.current_version_id, title: p.title });
      } else if (slot === 1) {
        await content.submitForApproval(owner, p.id, {
          versionId: p.current_version_id,
          note: "Confere os horários, por favor.",
        });
      } else if (slot === 2) {
        const { approvalId } = await content.submitForApproval(owner, p.id, { versionId: p.current_version_id });
        await content.decideApproval(owner, approvalId, {
          decision: "rejected",
          note: "Trocar a foto da capa e encurtar o título.",
        });
      } else if (slot === 4) {
        await setAssignment(owner, p.id, { assigneeId: ana.userId, dueDate: shiftDay(-2) });
      } else {
        await setAssignment(owner, p.id, { assigneeId: owner.userId, dueDate: shiftDay(3) });
      }
    }
    k++;
  }
  const archive = pieces.at(-1);
  if (archive) await content.archiveContent(owner, archive.id);

  // Publicações: as aprovadas foram ao ar (métricas lidas da rede) ou estão agendadas.
  await withTx(systemCtx("seed.publications"), async (tx) => {
    for (const [i, a] of approved.entries()) {
      const network = i % 3 === 2 ? "facebook" : "instagram";
      const label = `@${(await one<{ name: string }>(tx, "SELECT name FROM clients WHERE id = $1", [a.clientId])).name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
      if (i % 2 === 0) {
        await tx.query(
          `INSERT INTO publications (organization_id, client_id, content_item_id, content_version_id, network, account_label, kind, title, status, scheduled_at, published_at, external_url, metrics, metrics_at, requested_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'image', $7, 'published', now() - make_interval(days => $8), now() - make_interval(days => $8), NULL, $9, now(), $10)`,
          [
            owner.organizationId,
            a.clientId,
            a.id,
            a.versionId,
            network,
            label,
            a.title,
            (i % 9) + 1,
            JSON.stringify({ likes: 40 + i * 13, comments: 3 + (i % 7), reach: 800 + i * 210, saves: i % 5 }),
            owner.userId,
          ],
        );
      } else {
        await tx.query(
          `INSERT INTO publications (organization_id, client_id, content_item_id, content_version_id, network, account_label, kind, title, status, scheduled_at, requested_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'image', $7, 'scheduled', now() + make_interval(hours => $8), $9)`,
          [owner.organizationId, a.clientId, a.id, a.versionId, network, label, a.title, 20 + i * 9, owner.userId],
        );
      }
    }
    // Uma publicação que falhou, para a tela mostrar o caso.
    const f = approved[1];
    if (f) {
      await tx.query(
        `INSERT INTO publications (organization_id, client_id, content_item_id, content_version_id, network, account_label, kind, title, status, scheduled_at, error, requested_by)
         VALUES ($1, $2, $3, $4, 'instagram', '@demonstracao', 'image', $5, 'failed', now() - interval '40 minutes', 'A conexão com a Meta expirou ou foi removida. Conecte a conta de novo na aba Redes do cliente.', $6)`,
        [owner.organizationId, f.clientId, f.id, f.versionId, f.title, owner.userId],
      );
    }
  });

  // Falhas de geração e peças ainda gerando.
  for (const [i, [client, title]] of (
    [
      ["Café da Esquina", "Cardápio de verão"],
      ["Studio Arco", "Antes e depois da reforma"],
      ["Pet Amigo", "Adoção responsável"],
      ["Coli Loterias", "Bolão da Mega da Virada"],
    ] as const
  ).entries()) {
    const r = await content.createContent(owner, {
      clientId: ids.get(client)!,
      title,
      channel: "instagram",
      format: "carousel",
      objective: "awareness",
      briefing: { text: `${title}. Informações confirmadas pelo cliente.` },
      slideCount: 4,
      mode: "ai",
      requestId: crypto.randomUUID(),
    });
    if (i < 2) {
      await withTx(systemCtx("seed.failed"), async (tx) => {
        await tx.query("UPDATE jobs SET status = 'failed', last_error = $2, finished_at = now() WHERE id = $1", [
          r.jobId,
          "Tempo esgotado ao falar com a IA.",
        ]);
        await content.markGenerationFailed(tx, r.contentId, "Tempo esgotado ao falar com a IA. Tente de novo.");
      });
    } else {
      // Ficam "em geração": a tarefa é adiada para depois de amanhã.
      await withTx(systemCtx("seed.generating"), (tx) =>
        tx.query("UPDATE jobs SET run_after = now() + interval '2 days' WHERE id = $1", [r.jobId]),
      );
    }
  }

  // Rascunhos montados à mão (sem IA), ainda sem texto.
  for (const [client, title] of [
    ["Studio Arco", "Rascunho: lançamento do portfólio"],
    ["Padaria Trigo & Mel", "Rascunho: café da manhã de domingo"],
  ] as const) {
    await content.createContent(owner, {
      clientId: ids.get(client)!,
      title,
      channel: "instagram",
      format: "post",
      objective: "awareness",
      briefing: { text: `${title}. A definir com o cliente.` },
      slideCount: 1,
      mode: "manual",
      requestId: crypto.randomUUID(),
    });
  }

  const n = await withTx(systemCtx("seed.count"), (tx) =>
    one<{ pieces: number; pubs: number }>(
      tx,
      "SELECT (SELECT count(*)::int FROM content_items WHERE organization_id = $1) AS pieces, (SELECT count(*)::int FROM publications WHERE organization_id = $1) AS pubs",
      [owner.organizationId],
    ),
  );
  console.log(
    `Pronto: ${DEMO_ORG}, ${CLIENTS.length} clientes, ${n.pieces} peças, ${n.pubs} publicações (${shiftMonth(month, 0)}).`,
  );
  console.log(`Entrar: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(
    `Equipe (senha temporária, troca no primeiro acesso): ana@prisma.local ${ana.temporaryPassword} · bruno@prisma.local ${bruno.temporaryPassword}`,
  );
}

/** Data (AAAA-MM-DD) daqui a `days` dias, no horário de Brasília. */
function shiftDay(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

try {
  await main();
} catch (err) {
  console.error(`Falhou: ${(err as Error).stack ?? err}`);
  process.exitCode = 1;
} finally {
  setProviderOverride(undefined);
  await closePool();
}
