"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { choosePageAction } from "../actions";

/** Escolha da Página do Facebook quando o login da Meta trouxe mais de uma. */
export function ChoosePageForm({ stateId, pages }: { stateId: string; pages: Array<{ pageId: string; name: string; pictureUrl: string | null; instagram: string | null }> }) {
  const [state, action] = useActionState(choosePageAction, { status: "idle" });
  return (
    <ActionForm action={action} state={state} className="flex flex-col gap-3 p-5">
      <input type="hidden" name="stateId" value={stateId} />
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-[13.5px] text-ink-300">O login liberou mais de uma Página. Qual é a deste cliente?</legend>
        {pages.map((p, i) => (
          <label key={p.pageId} className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-ink-700 px-3 py-2.5 has-[:checked]:border-iris-400 has-[:checked]:bg-iris-400/[0.06]">
            <input type="radio" name="pageId" value={p.pageId} defaultChecked={i === 0} required />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.pictureUrl ? <img src={p.pictureUrl} alt="" className="size-8 rounded-full object-cover" /> : <span className="size-8 rounded-full bg-ink-800" />}
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-medium text-ink-50">{p.name}</span>
              <span className="block truncate text-[12px] text-ink-400">{p.instagram ? `Instagram @${p.instagram}` : "Sem Instagram profissional ligado"}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <SubmitButton pendingText="Conectando...">Conectar esta Página</SubmitButton>
      </div>
      <FormMessage state={state} />
    </ActionForm>
  );
}
