import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireAuth } from "@/server/auth/next";
import { healthChecks } from "@/server/services/health";
import { providerStatus } from "@/server/ai/gateway";
import { instagramStatus } from "@/server/integrations/instagram";
import { driveStatus } from "@/server/integrations/google-drive";
import { can } from "@/server/authz/permissions";
import { secretsConfigured } from "@/server/crypto/secrets";
import { APP_PROVIDER_INFO, listAppStatus, type AppProvider, type AppStatus } from "@/server/services/integration-apps";
import { publicUrlProblem } from "@/server/services/publications";
import { getSmtpStatus } from "@/server/services/email";
import { listWebhooks, WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS } from "@/server/services/webhooks";
import { Alert, Badge, Card, CardHeader, PageHeader, SectionTitle, formatDateTime } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { InlineAction } from "@/components/inline-action";
import { TestProviderForm } from "./test-form";
import { AppKeysForm, SmtpForm, SmtpTestButton, WebhookForm } from "./forms";
import { removeAppAction, removeSmtpAction, webhookOpAction } from "./actions";

export const metadata: Metadata = { title: "Integrações" };

const code = (t: string) => <code className="rounded-[4px] bg-ink-800 px-1 font-mono text-[12.5px] text-ink-100">{t}</code>;

const APP_STEPS: Record<AppProvider, ReactNode[]> = {
  meta: [
    <>Em developers.facebook.com, crie um app do tipo Empresa com os produtos Login do Facebook para Empresas e API do Instagram.</>,
    <>Em Login do Facebook, Configurações, cole o endereço de retorno abaixo em URIs de redirecionamento do OAuth válidos.</>,
    <>Em Configurações, Básico, copie o ID do app e a Chave secreta do app e salve aqui.</>,
    <>
      Peça a revisão das permissões {code("pages_manage_posts")}, {code("instagram_content_publish")}, {code("pages_read_engagement")}, {code("pages_show_list")}, {code("instagram_basic")},{" "}
      {code("instagram_manage_insights")} e {code("business_management")}. Até a aprovação, só conectam as contas com papel no app.
    </>,
  ],
  tiktok: [
    <>Em developers.tiktok.com, crie um app com Login Kit e Content Posting API (ative o Direct Post).</>,
    <>Em Login Kit, cadastre o endereço de retorno abaixo como Redirect URI.</>,
    <>Em URL properties, verifique o domínio do sistema: a TikTok só baixa fotos de domínios verificados.</>,
    <>Copie o Client key e o Client secret. Até a auditoria da TikTok, os posts saem privados (só o dono da conta vê).</>,
  ],
  google: [
    <>No Google Cloud (console.cloud.google.com), crie um projeto e ative a YouTube Data API v3.</>,
    <>Configure a tela de consentimento OAuth (Externo) e, enquanto o app estiver em teste, adicione as contas Google dos clientes como testadoras.</>,
    <>Em Credenciais, crie um ID do cliente OAuth do tipo Aplicativo da Web com o endereço de retorno abaixo.</>,
    <>Copie o ID do cliente e a chave secreta. Até a auditoria da API do YouTube, os vídeos sobem como privados.</>,
  ],
};

function StatusBadge({ ok, demo }: { ok: boolean; demo?: boolean }) {
  if (demo) return <Badge tone="warning">Demonstração</Badge>;
  return ok ? <Badge tone="success">Conectado</Badge> : <Badge>Não conectado</Badge>;
}

function AppCard({ s, canManage }: { s: AppStatus; canManage: boolean }) {
  const info = APP_PROVIDER_INFO[s.provider];
  return (
    <Card>
      <CardHeader title={`${info.label}: ${info.networks}`} actions={<StatusBadge ok={s.configured} />} />
      <div className="space-y-4 p-5 text-sm">
        {s.source === "env" ? (
          <p className="text-ink-300">
            Chaves definidas na configuração do servidor ({code(info.env[0])}). App {code(s.publicId ?? "")}.
          </p>
        ) : canManage ? (
          <AppKeysForm provider={s.provider} publicLabel={info.publicLabel} secretLabel={info.secretLabel} publicId={s.publicId} secretHint={s.secretHint} />
        ) : null}
        {s.redirectUri ? (
          <div>
            <div className="text-[12.5px] font-medium text-ink-300">Endereço de retorno do login</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="select-all break-all rounded-[4px] bg-ink-950 px-2 py-1 font-mono text-[12px] text-ink-100 ring-1 ring-ink-700">{s.redirectUri}</code>
              <CopyButton text={s.redirectUri} />
            </div>
          </div>
        ) : null}
        <details className="group">
          <summary className="cursor-pointer text-[13px] text-iris-300 hover:underline">Como criar o app</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-300">
            {APP_STEPS[s.provider].map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </details>
        {canManage && s.source === "saved" ? (
          <div className="border-t border-ink-800 pt-3">
            <InlineAction
              action={removeAppAction}
              fields={{ provider: s.provider }}
              label="Remover chaves"
              tone="danger"
              confirmMessage={`Remover as chaves da ${info.label}? As contas já conectadas param de renovar o acesso e as publicações agendadas nessa plataforma vão falhar.`}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default async function IntegrationsPage() {
  const auth = await requireAuth();
  const canManage = can(auth.role, "integrations.manage");
  const [{ checks }, provider, instagram, drive] = [await healthChecks(), providerStatus(), instagramStatus(), driveStatus()];
  const [apps, smtp, webhooks] = canManage ? await Promise.all([listAppStatus(auth), getSmtpStatus(auth), listWebhooks(auth)]) : [null, null, null];
  const urlProblem = publicUrlProblem();
  const vault = secretsConfigured();
  return (
    <>
      <PageHeader title="Integrações" description="Chaves dos apps, redes sociais, e-mail e avisos automáticos" />

      {!vault && canManage ? (
        <div className="mb-6">
          <Alert tone="danger" title="Falta a chave de criptografia do servidor">
            As chaves dos apps, as conexões dos clientes e a senha do e-mail ficam criptografadas com {code("APP_SECRET_KEY")}. Defina esse valor (32 caracteres aleatórios ou mais; gere com{" "}
            {code("openssl rand -base64 32")}) na configuração do servidor e reinicie. Os scripts de instalação já fazem isso sozinhos.
          </Alert>
        </div>
      ) : null}
      {urlProblem && canManage ? (
        <div className="mb-6">
          <Alert tone="info" title="Publicação no Instagram e no TikTok">
            {urlProblem} Facebook e YouTube recebem o arquivo direto e funcionam assim que as contas forem conectadas.
          </Alert>
        </div>
      ) : null}

      <SectionTitle>Redes sociais</SectionTitle>
      {apps ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {apps.map((s) => (
            <AppCard key={s.provider} s={s} canManage={canManage} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-400">As chaves dos apps são gerenciadas pela administração. As contas de cada cliente são conectadas na aba Redes do cliente.</p>
      )}
      <p className="mt-3 text-[13px] text-ink-400">Depois de salvar as chaves, conecte as contas de cada cliente na página do cliente, aba Redes.</p>

      <SectionTitle className="mt-10">Produção</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Inteligência artificial" actions={<StatusBadge ok={provider.configured} demo={provider.configured && provider.isDemo} />} />
          <div className="space-y-3 p-5 text-sm">
            <p className="text-ink-200">{provider.label}</p>
            <p className="text-ink-400">{provider.detail}</p>
            {provider.configured && can(auth.role, "integrations.test") ? <TestProviderForm disabled={false} /> : null}
            {!provider.configured ? (
              <ol className="list-decimal space-y-1 pl-5 text-ink-300">
                <li>Crie uma chave em console.anthropic.com (Claude) ou platform.openai.com (ChatGPT). A assinatura do ChatGPT não inclui a chave; o uso da API é cobrado à parte.</li>
                <li>
                  Defina {code("ANTHROPIC_API_KEY")} ou {code("OPENAI_API_KEY")} na configuração do servidor. Com as duas, {code("AI_PROVIDER")} escolhe qual usar.
                </li>
                <li>Reinicie o sistema e use Testar conexão.</li>
              </ol>
            ) : null}
          </div>
        </Card>
        <Card>
          <CardHeader title="Google Drive" description="Fotos e vídeos das pastas dos clientes, só leitura" actions={<StatusBadge ok={drive.configured} />} />
          <div className="space-y-3 p-5 text-sm">
            <p className="text-ink-400">{drive.detail}</p>
            {!drive.configured ? (
              <ol className="list-decimal space-y-1 pl-5 text-ink-300">
                <li>No Google Cloud, ative a API do Google Drive e crie uma conta de serviço.</li>
                <li>Gere a chave JSON da conta de serviço e defina o conteúdo em {code("GOOGLE_SERVICE_ACCOUNT_JSON")} na configuração do servidor.</li>
                <li>Compartilhe a pasta de cada cliente com o e-mail da conta de serviço, como Leitor.</li>
                <li>Na página do cliente, aba Arquivos, cole o link da pasta e use Importar agora.</li>
              </ol>
            ) : null}
          </div>
        </Card>
        <Card>
          <CardHeader title="Cores pelo @ do Instagram" description="Consulta de perfis comerciais para sugerir as cores da marca" actions={<StatusBadge ok={instagram.configured} />} />
          <div className="space-y-3 p-5 text-sm">
            <p className="text-ink-400">{instagram.detail}</p>
            {!instagram.configured ? <p className="text-ink-300">Sem isso, use as imagens do cliente no perfil da marca.</p> : null}
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

      {canManage && smtp && webhooks ? (
        <>
          <SectionTitle className="mt-10">Avisos</SectionTitle>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="E-mail" description="Pedidos de aprovação, decisões e publicações com falha" actions={<StatusBadge ok={smtp.configured} />} />
              <div className="space-y-4 p-5">
                <SmtpForm initial={smtp} />
                {smtp.configured ? (
                  <div className="flex flex-wrap items-start justify-between gap-3 border-t border-ink-800 pt-3">
                    <SmtpTestButton />
                    <InlineAction action={removeSmtpAction} fields={{}} label="Desligar e-mail" tone="danger" confirmMessage="Desligar o envio de e-mails? Os avisos deixam de sair." />
                  </div>
                ) : null}
              </div>
            </Card>
            <Card>
              <CardHeader title="Webhooks" description="Para automações no n8n, Zapier ou Make" />
              <div className="space-y-4 p-5">
                {webhooks.length ? (
                  <ul className="divide-y divide-ink-800 rounded-[10px] border border-ink-800">
                    {webhooks.map((w) => (
                      <li key={w.id} className="space-y-1 px-4 py-3 text-[13px]">
                        <div className="break-all font-medium text-ink-100">{w.url}</div>
                        <div className="text-ink-400">{w.events.map((e) => WEBHOOK_EVENT_LABELS[e]).join(" · ")}</div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                          {w.lastAt ? (
                            <span className={w.lastError ? "text-red-300" : "text-emerald-300"}>
                              {w.lastError ? `Falhou (${w.lastError})` : `Entregue (HTTP ${w.lastStatus})`} · {formatDateTime(w.lastAt)}
                            </span>
                          ) : (
                            <span className="text-ink-400">Nenhum envio ainda</span>
                          )}
                          <InlineAction action={webhookOpAction} fields={{ id: w.id, op: "test" }} label="Enviar teste" pendingText="Enviando..." />
                          <InlineAction action={webhookOpAction} fields={{ id: w.id, op: "delete" }} label="Remover" tone="danger" confirmMessage="Remover este webhook?" />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <WebhookForm events={WEBHOOK_EVENTS.map((e) => [e, WEBHOOK_EVENT_LABELS[e]])} />
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
