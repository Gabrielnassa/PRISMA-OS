"use client";

import { ActionForm, SubmitButton } from "@/components/form";
import { Field, Input, Select } from "@/components/ui";
import { useToastAction } from "@/components/toast";
import { assignAction } from "./actions";

export function AssignmentForm({
  contentId,
  members,
  assigneeId,
  dueDate,
  canEdit,
}: {
  contentId: string;
  members: Array<{ id: string; name: string }>;
  assigneeId: string | null;
  dueDate: string | null;
  canEdit: boolean;
}) {
  const [state, action] = useToastAction(assignAction);
  return (
    <ActionForm
      action={action}
      state={state}
      className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-end"
    >
      <input type="hidden" name="contentId" value={contentId} />
      <Field label="Responsável" htmlFor="assignee">
        <Select id="assignee" name="assigneeId" defaultValue={assigneeId ?? ""} disabled={!canEdit}>
          <option value="">Ninguém</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Prazo" htmlFor="due">
        <Input id="due" name="dueDate" type="date" defaultValue={dueDate ?? ""} disabled={!canEdit} />
      </Field>
      {canEdit ? (
        <SubmitButton size="sm" variant="secondary" className="sm:mb-[2px]">
          Salvar
        </SubmitButton>
      ) : null}
      {state.status === "error" ? <p className="text-[12.5px] text-red-300 sm:col-span-3">{state.message}</p> : null}
    </ActionForm>
  );
}
