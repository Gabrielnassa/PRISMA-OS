import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { listClients } from "@/server/services/clients";
import { can } from "@/server/authz/permissions";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th, cx } from "@/components/ui";
import { monthByClient } from "@/server/services/month";
import { currentMonth } from "@/server/services/editorial";
import { CreateClientForm } from "./create-client-form";

export const metadata: Metadata = { title: "Clientes" };

const STATUS = { active: { label: "Ativo", tone: "success" }, paused: { label: "Pausado", tone: "warning" }, archived: { label: "Arquivado", tone: "neutral" } } as const;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ arquivados?: string; excluido?: string }> }) {
  const auth = await requireAuth();
  const { arquivados, excluido } = await searchParams;
  const [clients, months] = await Promise.all([listClients(auth, { includeArchived: arquivados === "1" }), monthByClient(auth, currentMonth())]);
  const month = new Map(months.map((m) => [m.clientId, m]));
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cada cliente tem dados, marca, arquivos e histórico isolados. Usuários só veem os clientes aos quais têm acesso."
        actions={
          <Link href={arquivados === "1" ? "/clientes" : "/clientes?arquivados=1"} className="text-sm text-ink-300 hover:text-ink-50">
            {arquivados === "1" ? "Ocultar arquivados" : "Mostrar arquivados"}
          </Link>
        }
      />
      {excluido === "1" ? (
        <div className="mb-6">
          <Alert tone="success" title="Cliente excluído">
            O cliente, seus conteúdos, arquivos e memória foram apagados. O consumo de IA continua nos totais de Custos.
          </Alert>
        </div>
      ) : null}
      {can(auth.role, "client.create") ? (
        <Card className="mb-6">
          <CardHeader title="Novo cliente" description="Depois do cadastro você será levado ao perfil da marca." />
          <CreateClientForm />
        </Card>
      ) : null}
      {clients.length === 0 ? (
        <EmptyState
          title="Nenhum cliente disponível"
          description={can(auth.role, "client.create") ? "Cadastre o primeiro cliente acima." : "Peça a um administrador para liberar o acesso aos clientes com os quais você trabalha."}
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Segmento</Th>
                <Th>Situação</Th>
                <Th className="text-right">Conteúdos</Th>
                <Th className="text-right">Aguardando aprovação</Th>
                <Th>Pacote do mês</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-ink-850/50">
                  <Td>
                    <Link href={`/clientes/${c.id}`} className="font-medium text-ink-50 underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                  </Td>
                  <Td>{c.segment || <span className="text-ink-400">—</span>}</Td>
                  <Td>
                    <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                  </Td>
                  <Td className="text-right">{c.contentCount}</Td>
                  <Td className="text-right">{c.pendingApprovals}</Td>
                  <Td className="min-w-[150px]">
                    {(() => {
                      const m = month.get(c.id);
                      if (!m || m.contracted === 0) return <Link href={`/clientes/${c.id}?aba=editorial`} className="text-[12.5px] text-ink-400 hover:text-ink-100">Definir pacote</Link>;
                      const pct = Math.min(100, Math.round((m.produced / m.contracted) * 100));
                      return (
                        <Link href={`/clientes/${c.id}?aba=editorial`} className="block" title={m.plan === "approved" ? "Linha editorial aprovada" : m.plan === "draft" ? "Linha editorial em rascunho" : "Sem linha editorial no mês"}>
                          <span className="tabular text-[12.5px] text-ink-100">
                            {m.produced} de {m.contracted}
                          </span>
                          <span className="mt-1 block h-[3px] rounded-full bg-ink-800">
                            <span className={cx("block h-[3px] rounded-full", pct >= 100 ? "bg-emerald-400" : "bg-iris-400")} style={{ width: `${pct}%` }} />
                          </span>
                        </Link>
                      );
                    })()}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
