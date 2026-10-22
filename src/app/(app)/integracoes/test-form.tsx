"use client";

import { useActionState } from "react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { testProviderAction } from "./actions";

export function TestProviderForm({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState(testProviderAction, { status: "idle" });
  return (
    <ActionForm action={action} state={state} className="flex flex-col gap-3">
      <div>
        <SubmitButton variant="secondary" size="sm" disabled={disabled} pendingText="Testando...">
          Testar conexão
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </ActionForm>
  );
}
