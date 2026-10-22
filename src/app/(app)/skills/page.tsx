import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { PLANNED_SKILLS, SKILLS } from "@/server/skills/registry";
import { getCostSummary } from "@/server/services/costs";
import { can } from "@/server/authz/permissions";
import { Badge, Card, CardHeader, PageHeader, formatUsd } from "@/components/ui";

export const metadata: Metadata = { title: "Agentes e skills" };

export default async function SkillsPage() {
  const auth = await requireAuth();
  const usage = can(auth.role, "costs.view") ? (await getCostSummary(auth)).bySkill : [];
  return (
    <>
      <PageHeader
        title="Agentes e skills"
        description="Cada skill é um módulo versionado com esquemas de entrada e saída, critérios de qualidade e testes. Só o orquestrador decide o que executa; nenhuma skill publica ou gasta sem autorização."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {SKILLS.map((s) => {
          const u = usage.find((x) => x.skillId === s.id);
          return (
            <Card key={s.id}>
              <CardHeader
                title={s.name}
                description={`${s.id} · v${s.version} · seção ${s.specSection}`}
                actions={<Badge tone={s.kind === "ai" ? "accent" : "teal"}>{s.kind === "ai" ? "IA" : "Regras"}</Badge>}
              />
              <div className="space-y-3 p-5 text-sm">
                <p className="text-ink-200">{s.description}</p>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Critérios de qualidade</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-300">
                    {s.qualityCriteria.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-ink-400">
                  <span className="font-semibold text-ink-300">Ferramentas autorizadas:</span> {s.allowedTools.length ? s.allowedTools.join(", ") : "nenhuma (somente gera dados estruturados)"}
                </p>
                <p className="text-xs text-ink-400">
                  <span className="font-semibold text-ink-300">Tratamento de erros:</span> {s.errorHandling}
                </p>
                {u ? (
                  <p className="text-xs text-ink-400">
                    Este mês: {u.runs} execução(ões) · {formatUsd(u.costUsd, 4)}
                    {u.avgDurationMs ? ` · média ${(u.avgDurationMs / 1000).toFixed(1)} s` : ""}
                  </p>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="mt-6">
        <CardHeader title="Skills previstas" description="Definidas na especificação e ainda não implementadas." />
        <ul className="divide-y divide-ink-800">
          {PLANNED_SKILLS.map((s) => (
            <li key={s.name} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span className="flex-1 text-ink-200">{s.name}</span>
              <span className="text-xs text-ink-500">seção {s.specSection}</span>
              <Badge>{s.phase}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
