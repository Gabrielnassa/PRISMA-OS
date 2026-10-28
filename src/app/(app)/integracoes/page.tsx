import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { healthChecks } from "@/server/services/health";
import { providerStatus } from "@/server/ai/gateway";
import { can } from "@/server/authz/permissions";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { TestProviderForm } from "./test-form";

export const metadata: Metadata = { title: "Integrações" };

const PLANNED = [
  { name: "Instagram e Facebook (Graph API oficial)", phase: "Fase 4", note: "Publicação autorizada e métricas. Exige app Meta aprovado, OAuth e permissões da conta." },
  { name: "Meta Ads", phase: "Fase 6", note: "Preparação e consulta de campanhas; alterações de orçamento sempre com confirmação explícita." },
  { name: "Google Ads", phase: "Fase 6", note: "Campanhas e métricas via API oficial com OAuth." },
  { name: "Google Analytics e Search Console", phase: "Fase 4", note: "Métricas reais para relatórios." },
  { name: "Geração e edição de vídeo", phase: "Fase 5", note: "Arquitetura multiprovedor; nada é marcado como renderizado sem arquivo final verificável." },
  { name: "n8n / automações", phase: "Fase 3", note: "Workflows com gatilhos, logs e reprocessamento." },
  { name: "Armazenamento S3 / Supabase Storage", phase: "Fase 3", note: "A interface de armazenamento já é desacoplada; hoje o driver ativo é local." },
  { name: "E-mail e notificações", phase: "Fase 3", note: "Convites e avisos de aprovação." },
];

export default async function IntegrationsPage() {
  const auth = await requireAuth();
  const [{ checks }, provider] = [await healthChecks(), providerStatus()];
  return (
    <>
      <PageHeader title="Integrações" description="Status verificado em tempo real. Integrações não conectadas aparecem como pendentes — nunca simuladas." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Provedor de IA"
            actions={provider.configured ? provider.isDemo ? <Badge tone="warning">Demonstração</Badge> : <Badge tone="success">Configurado</Badge> : <Badge tone="danger">Não configurado</Badge>}
          />
          <div className="space-y-3 p-5 text-sm">
            <p className="text-ink-200">{provider.label}</p>
            <p className="text-ink-400">{provider.detail}</p>
            {provider.configured && can(auth.role, "integrations.test") ? <TestProviderForm disabled={false} /> : null}
            {!provider.configured ? (
              <ol className="list-decimal space-y-1 pl-5 text-ink-300">
                <li>Crie uma chave em console.anthropic.com.</li>
                <li>Defina <code className="rounded-[4px] bg-ink-800 px-1 font-mono text-[12.5px] text-ink-100">ANTHROPIC_API_KEY</code> no ambiente do servidor e do worker (nunca no código).</li>
                <li>Reinicie a aplicação e o worker e use “Testar conexão”.</li>
              </ol>
            ) : null}
          </div>
        </Card>
        <Card>
          <CardHeader title="Saúde do sistema" />
          <ul className="divide-y divide-ink-800">
            {checks.map((c) => (
              <li key={c.name} className="flex items-start gap-3 px-5 py-3 text-sm">
                <Badge tone={c.ok ? "success" : c.name === "Provedor de IA" ? "warning" : "danger"}>{c.ok ? "OK" : "Atenção"}</Badge>
                <div>
                  <div className="font-medium text-ink-100">{c.name}</div>
                  <div className="text-xs text-ink-400">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Próximas integrações" description="Cada integração será implementada sobre a documentação oficial vigente, com OAuth, tokens protegidos e status verificável." />
        <ul className="divide-y divide-ink-800">
          {PLANNED.map((p) => (
            <li key={p.name} className="flex flex-wrap items-start gap-3 px-5 py-3 text-sm">
              <Badge>{p.phase}</Badge>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink-100">{p.name}</div>
                <div className="text-xs text-ink-400">{p.note}</div>
              </div>
              <Badge tone="neutral">Não conectado</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
