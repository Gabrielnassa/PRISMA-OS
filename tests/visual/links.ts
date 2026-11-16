/**
 * Cria, nos dados de demonstração, um link de aprovação do mês e um link de
 * relatório, e imprime os dois caminhos em JSON. Usado pelo global-setup das
 * capturas para fotografar as páginas que o cliente abre.
 */
import { login, resolveSession } from "../../src/server/auth/service";
import { listClients } from "../../src/server/services/clients";
import { createClientApprovalLink } from "../../src/server/services/approval-links";
import { createReportLink } from "../../src/server/services/reports";

const { token } = await login({ email: "demo@prisma.local", password: "demonstracao-123", ip: "127.0.0.1" });
const auth = await resolveSession(token);
if (!auth) throw new Error("Sessão de demonstração não resolvida.");

const clients = (await listClients(auth, {})).sort((a, b) => (a.name < b.name ? -1 : 1));
let aprovar: string | null = null;
for (const c of clients) {
  try {
    aprovar = new URL((await createClientApprovalLink(auth, c.id)).url).pathname;
    break;
  } catch {
    // cliente sem nada aguardando aprovação: tenta o próximo
  }
}
if (!aprovar) throw new Error("Nenhum cliente com peças aguardando aprovação no seed.");
const month = new Date().toISOString().slice(0, 7);
const first = clients[0];
if (!first) throw new Error("Seed sem clientes.");
const relatorio = new URL((await createReportLink(auth, first.id, month)).url).pathname;

console.log(JSON.stringify({ aprovar, relatorio }));
process.exit(0);
