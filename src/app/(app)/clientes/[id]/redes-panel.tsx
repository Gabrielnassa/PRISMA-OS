"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { choosePageAction } from "../actions";

/** Escolha da Página do Facebook quando o login da Meta trouxe mais de uma. */
export function ChoosePageForm({
  stateId,
  pages,
}: {
  stateId: string;
  pages: Array<{ pageId: string; name: string; pictureUrl: string | null; instagram: string | null }>;
}) {
  const [state, action] = useActionState(choosePageAction, { status: "idle" });
  return (
    <ActionForm action={action} state={state} className="flex flex-col gap-3 p-5">
      <input type="hidden" name="stateId" value={stateId} />
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-base text-muted">
          O login liberou mais de uma Página. Qual é a deste cliente?
        </legend>
        {pages.map((p, i) => (
          <label
            key={p.pageId}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-line px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
          >
            <input type="radio" name="pageId" value={p.pageId} defaultChecked={i === 0} required />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.pictureUrl ? (
              <img src={p.pictureUrl} alt="" className="size-8 rounded-full object-cover" />
            ) : (
              <span className="size-8 rounded-full bg-surface-2" />
            )}
            <span className="min-w-0">
              <span className="block truncate text-base font-medium text-fg">{p.name}</span>
              <span className="block truncate text-sm text-muted">
                {p.instagram ? `Instagram @${p.instagram}` : "Sem Instagram profissional ligado"}
              </span>
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
