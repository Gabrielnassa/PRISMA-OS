import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/server/auth/next";
import { SKILLS } from "@/server/skills/registry";
import { plural } from "@/lib/text";
import { getCostSummary } from "@/server/services/costs";
import { listCustomSkills } from "@/server/services/custom-skills";
import { can } from "@/server/authz/permissions";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, SectionTitle, formatUsd } from "@/components/ui";

export const metadata: Metadata = { title: "Skills" };

export default async function SkillsPage({ searchParams }: { searchParams: Promise<{ arquivadas?: string }> }) {
  const auth = await requireAuth();
  const { arquivadas } = await searchParams;
  const showArchived = arquivadas === "1";
  const usage = can(auth.role, "costs.view") ? (await getCostSummary(auth)).bySkill : [];
  const custom = await listCustomSkills(auth, { includeArchived: showArchived });
  const canManage = can(auth.role, "skills.manage");
  return (
    <>
      <PageHeader
        title="Skills"
        description="Instruções que a IA segue em tarefas recorrentes da agência. O contexto de cada cliente entra automaticamente."
        actions={canManage ? <LinkButton href="/skills/nova">Nova skill</LinkButton> : null}
      />

      <section className="mb-12">
        <SectionTitle
          aside={
            <Link href={showArchived ? "/skills" : "/skills?arquivadas=1"} className="hover:text-ink-100">
              {showArchived ? "Ocultar arquivadas" : "Mostrar arquivadas"}
            </Link>
          }
        >
          Skills da agência
        </SectionTitle>
        {custom.length === 0 ? (
          <EmptyState
            title="Nenhuma skill da agência ainda"
            description="Crie uma para tarefas que vocês repetem (roteiros, legendas, respostas) ou importe um arquivo SKILL.md."
            action={canManage ? <LinkButton href="/skills/nova">Criar a primeira skill</LinkButton> : undefined}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {custom.map((s) => (
              <Link key={s.id} href={`/skills/${s.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-ink-600 group-hover:bg-ink-850/40">
                  <div className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-ink-50">{s.name}</h3>
                      <Badge tone="accent">v{s.version}</Badge>
                    </div>
                    <p className="line-clamp-3 text-sm text-ink-300">{s.description || "Sem descrição."}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{s.clientName ? `Só ${s.clientName}` : "Todos os clientes"}</Badge>
                      {s.source === "skill_md" ? <Badge tone="ember">SKILL.md</Badge> : null}
                      {s.status === "archived" ? <Badge tone="warning">arquivada</Badge> : null}
                      {s.runsThisMonth ? <Badge tone="info">{s.runsThisMonth} uso(s) no mês</Badge> : null}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <SectionTitle>Skills do sistema</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        {SKILLS.map((s) => {
          const u = usage.find((x) => x.skillId === s.id);
          return (
            <Card key={s.id}>
              <CardHeader
                title={s.name}
                description={`Versão ${s.version}`}
                actions={<Badge tone={s.kind === "ai" ? "accent" : "ember"}>{s.kind === "ai" ? "IA" : "Regras"}</Badge>}
              />
              <div className="space-y-3 p-5 text-sm">
                <p className="text-ink-200">{s.description}</p>
                <div>
                  <div className="text-[12px] font-medium text-ink-400">Critérios de qualidade</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-300">
                    {s.qualityCriteria.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
                {u ? (
                  <p className="text-xs text-ink-400">
                    Este mês: {plural(u.runs, "execução", "execuções")} · {formatUsd(u.costUsd, 2)}
                    {u.avgDurationMs ? ` · média ${(u.avgDurationMs / 1000).toFixed(1)} s` : ""}
                  </p>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
