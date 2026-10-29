"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EditorialItem } from "@/server/services/editorial";
import { OBJECTIVES, OBJECTIVE_LABELS } from "@/lib/content/document";
import { EDITORIAL_FORMATS, EDITORIAL_FORMAT_LABELS } from "@/lib/content/editorial";
import { STATUS_LABELS, type ContentStatus } from "@/lib/content/status";
import { Badge, Button, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { ActionForm, FormMessage, SubmitButton } from "@/components/form";
import { useToastAction } from "@/components/toast";
import { approveEditorialAction, editorialItemStatusAction, packageAction, proposeEditorialAction, updateEditorialItemAction } from "../actions";


export function PackageForm({ clientId, pkg }: { clientId: string; pkg: { posts: number; carousels: number; stories: number; videos: number; notes: string } }) {
  const [state, action] = useToastAction(packageAction);
  const fields: Array<[keyof typeof pkg, string]> = [
    ["carousels", "Carrosséis"],
    ["posts", "Posts"],
    ["stories", "Stories"],
    ["videos", "Vídeos"],
  ];
  return (
    <ActionForm action={action} state={state} className="grid gap-4 p-5">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {fields.map(([k, label]) => (
          <Field key={k} label={label} htmlFor={`pkg-${k}`} error={state.status === "error" ? state.fieldErrors?.[k] : undefined}>
            <Input id={`pkg-${k}`} name={k} type="number" min={0} max={200} defaultValue={pkg[k] as number} inputMode="numeric" />
          </Field>
        ))}
      </div>
      <Field label="Observações do contrato" htmlFor="pkg-notes" hint="Ex.: 8 posts por mês, entrega até o dia 25.">
        <Input id="pkg-notes" name="notes" maxLength={1000} defaultValue={pkg.notes} />
      </Field>
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <div>
        <SubmitButton variant="secondary">Salvar pacote</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ProposeForm({ clientId, month, hasPlan, aiReady }: { clientId: string; month: string; hasPlan: boolean; aiReady: boolean }) {
  const [state, action] = useToastAction(proposeEditorialAction);
  return (
    <ActionForm
      action={action}
      state={state}
      className="grid gap-4 p-5"
      confirmMessage={hasPlan ? "Refazer a proposta? As pautas do rascunho atual serão substituídas." : undefined}
      confirmLabel="Refazer"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="month" value={month} />
      <Field label="Tema ou pedidos do mês (opcional)" htmlFor="ed-theme" hint="Datas, campanhas, produtos em destaque, o que evitar.">
        <Textarea id="ed-theme" name="theme" rows={3} maxLength={3000} placeholder="Ex.: Bolão da Mega da Virada a partir do dia 10. Mostrar a equipe da loja." />
      </Field>
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="mode" value="ai" disabled={!aiReady} pendingText="Montando pautas...">
          {hasPlan ? "Refazer com IA" : "Propor pautas com IA"}
        </SubmitButton>
        <SubmitButton name="mode" value="manual" variant="secondary" pendingText="Criando...">
          Montar manualmente
        </SubmitButton>
      </div>
      {!aiReady ? <p className="text-[12.5px] text-ink-400">IA não configurada: monte sem IA e escreva as pautas, ou configure a chave em Integrações.</p> : null}
    </ActionForm>
  );
}

const STATUS_TEXT: Record<EditorialItem["status"], { label: string; tone: "neutral" | "accent" | "success" | "warning" }> = {
  planned: { label: "Planejada", tone: "neutral" },
  in_production: { label: "Virou peça", tone: "accent" },
  done: { label: "Feito", tone: "success" },
  skipped: { label: "Fora do mês", tone: "warning" },
};

function shortDate(d: string | null) {
  if (!d) return "Sem data";
  const [, m, day] = d.split("-");
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)).replace(".", "");
  return `${weekday} ${day}/${m}`;
}

function StatusButton({ itemId, status, label }: { itemId: string; status: "planned" | "done" | "skipped"; label: string }) {
  const [state, action] = useToastAction(editorialItemStatusAction);
  return (
    <ActionForm action={action} state={state}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant="ghost" size="sm" pendingText="...">
        {label}
      </SubmitButton>
      {state.status === "error" ? <p className="text-[12px] text-red-300">{state.message}</p> : null}
    </ActionForm>
  );
}

function ItemEditor({ item, month, onDone }: { item: EditorialItem; month: string; onDone: () => void }) {
  const [state, action] = useToastAction(updateEditorialItemAction);
  useEffect(() => {
    if (state.status === "ok") onDone();
  }, [state, onDone]);
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k] : undefined);
  return (
    <ActionForm action={action} state={state} className="grid gap-3 md:grid-cols-[1fr_150px_150px_170px]">
      <input type="hidden" name="itemId" value={item.id} />
      <Field label="Título" htmlFor={`t-${item.id}`} error={err("title")}>
        <Input id={`t-${item.id}`} name="title" defaultValue={item.title === "Pauta a definir" ? "" : item.title} required minLength={2} maxLength={200} />
      </Field>
      <Field label="Data" htmlFor={`d-${item.id}`} error={err("plannedDate")}>
        <Input id={`d-${item.id}`} name="plannedDate" type="date" min={`${month}-01`} max={`${month}-31`} defaultValue={item.plannedDate ?? ""} />
      </Field>
      <Field label="Formato" htmlFor={`f-${item.id}`}>
        <Select id={`f-${item.id}`} name="format" defaultValue={item.format}>
          {EDITORIAL_FORMATS.map((f) => (
            <option key={f} value={f}>
              {EDITORIAL_FORMAT_LABELS[f]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Objetivo" htmlFor={`o-${item.id}`}>
        <Select id={`o-${item.id}`} name="objective" defaultValue={item.objective}>
          {OBJECTIVES.map((o) => (
            <option key={o} value={o}>
              {OBJECTIVE_LABELS[o]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Briefing" htmlFor={`b-${item.id}`} className="md:col-span-3" error={err("brief")}>
        <Textarea id={`b-${item.id}`} name="brief" rows={3} maxLength={4000} defaultValue={item.brief} placeholder="O que dizer, para quem, mensagem principal e informações confirmadas." />
      </Field>
      <Field label="Chamada (CTA)" htmlFor={`c-${item.id}`}>
        <Input id={`c-${item.id}`} name="cta" maxLength={300} defaultValue={item.cta} />
      </Field>
      {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
      <div className="flex gap-2 md:col-span-4">
        <SubmitButton size="sm">Salvar pauta</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </ActionForm>
  );
}

export function EditorialItems({ items, month, canEdit }: { items: EditorialItem[]; month: string; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <ol className="divide-y divide-ink-800">
      {items.map((it) => (
        <li key={it.id} className={cx("px-5 py-4", editing === it.id && "bg-ink-850/60")}>
          {editing === it.id ? (
            <ItemEditor item={it} month={month} onDone={() => setEditing(null)} />
          ) : (
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="w-[76px] shrink-0 pt-0.5 text-[12.5px] text-ink-400">{shortDate(it.plannedDate)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={it.format === "video" ? "ember" : "neutral"}>{EDITORIAL_FORMAT_LABELS[it.format]}</Badge>
                  <span className={cx("font-medium", it.title === "Pauta a definir" ? "text-ink-400 italic" : "text-ink-50")}>{it.title}</span>
                </div>
                {it.brief ? <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-300">{it.brief}</p> : null}
                <div className="mt-1.5 text-[12px] text-ink-400">
                  {OBJECTIVE_LABELS[it.objective]}
                  {it.cta ? ` · CTA: ${it.cta}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Badge tone={STATUS_TEXT[it.status].tone}>{STATUS_TEXT[it.status].label}</Badge>
                {it.contentItemId ? (
                  <Link href={`/conteudos/${it.contentItemId}`} className="text-[12.5px] text-iris-300 hover:underline">
                    {it.contentStatus ? STATUS_LABELS[it.contentStatus as ContentStatus] ?? "Abrir peça" : "Abrir peça"} →
                  </Link>
                ) : null}
                {canEdit && (it.status === "planned" || it.status === "skipped") ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(it.id)}>
                    Editar
                  </Button>
                ) : null}
                {canEdit && it.format === "video" && it.status === "planned" ? <StatusButton itemId={it.id} status="done" label="Marcar feito" /> : null}
                {canEdit && it.status === "done" && it.format === "video" ? <StatusButton itemId={it.id} status="planned" label="Desfazer" /> : null}
              </div>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ApproveForm({ planId, approved, pending, blank }: { planId: string; approved: boolean; pending: number; blank: number }) {
  const [state, action] = useToastAction(approveEditorialAction);
  return (
    <ActionForm
      action={action}
      state={state}
      className="flex flex-wrap items-center gap-3"
      confirmMessage={
        approved
          ? `Criar ${pending === 1 ? "a peça que falta" : `as ${pending} peças que faltam`}?`
          : `Aprovar a linha editorial e criar ${pending === 1 ? "1 peça" : `${pending} peças`}? Os vídeos ficam na lista para marcar quando estiverem prontos.`
      }
      confirmLabel={approved ? "Criar peças" : "Aprovar e criar"}
    >
      <input type="hidden" name="planId" value={planId} />
      {approved && pending === 0 ? (
        <span className="text-[13px] text-ink-400">Todas as pautas do mês já viraram peça (vídeos são marcados à mão).</span>
      ) : (
        <SubmitButton disabled={blank > 0 || pending === 0} pendingText="Criando peças...">
          {approved ? `Criar peças pendentes (${pending})` : "Aprovar e criar peças"}
        </SubmitButton>
      )}
      {blank > 0 ? <span className="text-[12.5px] text-amber-300">Complete {blank === 1 ? "1 pauta" : `${blank} pautas`} para aprovar.</span> : null}
      {state.status === "error" ? <FormMessage state={state} /> : null}
    </ActionForm>
  );
}
