"use client";

import { useActionState, useMemo, useState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "./form";
import { Field, Input, Select, Textarea, cx } from "./ui";
import { useToastAction } from "./toast";
import { scheduleAction, tiktokOptionsAction } from "@/app/(app)/publicacoes/actions";

export interface PublishAccount {
  id: string;
  network: "instagram" | "facebook" | "tiktok" | "youtube";
  networkLabel: string;
  label: string;
  /** Motivo de não poder publicar nesta conta (formato, conexão, endereço público). */
  blocked: string | null;
  privacyOptions: string[];
}

const PRIVACY: Record<string, string> = { PUBLIC_TO_EVERYONE: "Público", MUTUAL_FOLLOW_FRIENDS: "Amigos", FOLLOWER_OF_CREATOR: "Seguidores", SELF_ONLY: "Só eu" };

/** Agora em Brasília, no formato do campo datetime-local. */
function nowLocal(offsetMin = 0): string {
  const d = new Date(Date.now() + offsetMin * 60_000 - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/**
 * Publicar ou agendar: escolha das contas, horário, legenda e as opções que
 * TikTok e YouTube exigem. Sempre com confirmação antes de enviar.
 */
export function PublishForm({
  target,
  accounts,
  defaultCaption,
  defaultTitle,
  isVideo,
}: {
  target: { contentId?: string; mediaAssetId?: string };
  accounts: PublishAccount[];
  defaultCaption: string;
  defaultTitle: string;
  isVideo: boolean;
}) {
  const [state, action] = useToastAction(scheduleAction);
  const [selected, setSelected] = useState<string[]>(accounts.filter((a) => !a.blocked).map((a) => a.id));
  const [when, setWhen] = useState<"now" | "later">("now");
  const [caption, setCaption] = useState(defaultCaption);
  const [tiktok, loadTikTok, loadingTikTok] = useActionState(tiktokOptionsAction, { status: "idle" });
  const chosen = accounts.filter((a) => selected.includes(a.id));
  const tiktokAccount = chosen.find((a) => a.network === "tiktok");
  const hasYouTube = chosen.some((a) => a.network === "youtube");
  const privacyOptions = tiktok.status === "ok" && tiktok.data ? tiktok.data.privacyOptions : (tiktokAccount?.privacyOptions ?? []);
  const confirm = useMemo(() => {
    const names = chosen.map((a) => `${a.networkLabel} (${a.label})`).join(", ");
    return when === "now" ? `Publicar agora em ${names}? Depois de publicado, só dá para apagar direto na rede.` : `Agendar a publicação em ${names}?`;
  }, [chosen, when]);

  if (accounts.length === 0) return <p className="text-[13.5px] text-ink-400">Nenhuma conta conectada para este cliente. Conecte na aba Redes do cliente.</p>;

  return (
    <ActionForm action={action} state={state} confirmMessage={confirm} confirmLabel={when === "now" ? "Publicar" : "Agendar"} className="flex flex-col gap-4">
      {target.contentId ? <input type="hidden" name="contentId" value={target.contentId} /> : null}
      {target.mediaAssetId ? <input type="hidden" name="mediaAssetId" value={target.mediaAssetId} /> : null}
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-200">Onde publicar</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {accounts.map((a) => (
            <label
              key={a.id}
              className={cx(
                "flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-[13px]",
                a.blocked ? "cursor-not-allowed border-ink-800 opacity-60" : "cursor-pointer border-ink-700 has-[:checked]:border-iris-400 has-[:checked]:bg-iris-400/[0.06]",
              )}
            >
              <input
                type="checkbox"
                name="accountIds"
                value={a.id}
                className="mt-0.5"
                disabled={Boolean(a.blocked)}
                checked={selected.includes(a.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))}
              />
              <span className="min-w-0">
                <span className="block font-medium text-ink-50">{a.networkLabel}</span>
                <span className="block truncate text-ink-400">{a.label}</span>
                {a.blocked ? <span className="mt-0.5 block text-[12px] text-amber-300">{a.blocked}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-wrap items-end gap-4">
        <legend className="mb-2 text-[13px] font-medium text-ink-200">Quando</legend>
        <label className="flex items-center gap-2 text-[13px] text-ink-200">
          <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} /> Agora
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-200">
          <input type="radio" name="when" value="later" checked={when === "later"} onChange={() => setWhen("later")} /> Agendar
        </label>
        {when === "later" ? (
          <Input type="datetime-local" name="scheduledAt" aria-label="Data e hora (Brasília)" min={nowLocal()} defaultValue={nowLocal(60)} required className="w-auto" />
        ) : null}
      </fieldset>

      {isVideo || hasYouTube || tiktokAccount ? (
        <Field label="Título" htmlFor="pub-title" hint={hasYouTube ? "Obrigatório no YouTube (até 100 caracteres)." : "Usado no TikTok (até 90 caracteres)."}>
          <Input id="pub-title" name="title" maxLength={100} defaultValue={defaultTitle} />
        </Field>
      ) : null}

      <Field label={`Legenda (${caption.length}/2200)`} htmlFor="pub-caption">
        <Textarea id="pub-caption" name="caption" value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 2200))} className="min-h-28" />
      </Field>

      {tiktokAccount ? (
        <div className="rounded-[10px] border border-ink-700 p-3">
          <div className="text-[13px] font-medium text-ink-100">TikTok · {tiktok.status === "ok" && tiktok.data?.nickname ? tiktok.data.nickname : tiktokAccount.label}</div>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <Field label="Quem pode ver" htmlFor="pub-tt-privacy">
              <Select id="pub-tt-privacy" name="tiktokPrivacy" defaultValue="" required>
                <option value="" disabled>
                  Escolha...
                </option>
                {(privacyOptions.length ? privacyOptions : ["SELF_ONLY"]).map((p) => (
                  <option key={p} value={p}>
                    {PRIVACY[p] ?? p}
                  </option>
                ))}
              </Select>
            </Field>
            <button
              type="button"
              className="mb-2 text-[12.5px] text-iris-300 hover:underline disabled:opacity-60"
              disabled={loadingTikTok}
              onClick={() => {
                const fd = new FormData();
                fd.set("accountId", tiktokAccount.id);
                loadTikTok(fd);
              }}
            >
              {loadingTikTok ? "Consultando..." : "Atualizar opções da conta"}
            </button>
          </div>
          {tiktok.status === "error" ? <p className="mt-1 text-[12.5px] text-red-300">{tiktok.message}</p> : null}
          <label className="mt-3 flex items-start gap-2 text-[12.5px] text-ink-300">
            <input type="checkbox" name="tiktokConsent" className="mt-0.5" required />
            Ao publicar, concordo com a Confirmação de Uso de Música da TikTok.
          </label>
        </div>
      ) : null}

      {hasYouTube ? (
        <div className="flex flex-wrap items-end gap-4 rounded-[10px] border border-ink-700 p-3">
          <Field label="Visibilidade no YouTube" htmlFor="pub-yt">
            <Select id="pub-yt" name="youtubePrivacy" defaultValue="private">
              <option value="private">Privado</option>
              <option value="unlisted">Não listado</option>
              <option value="public">Público</option>
            </Select>
          </Field>
          <label className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-300">
            <input type="checkbox" name="madeForKids" /> Conteúdo feito para crianças
          </label>
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-[13px] text-ink-200">
        <input type="checkbox" name="allowComments" defaultChecked /> Permitir comentários
      </label>

      <FormMessage state={state.status === "error" ? state : { status: "idle" }} />
      <div>
        <SubmitButton disabled={chosen.length === 0} pendingText={when === "now" ? "Publicando..." : "Agendando..."}>
          {when === "now" ? "Publicar agora" : "Agendar"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
