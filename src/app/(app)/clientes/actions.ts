"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireAuth } from "@/server/auth/next";
import { bool, runAction, str, type ActionState } from "@/server/actions";
import {
  addMemory,
  createClient,
  deleteMemory,
  setMemoryStatus,
  updateBrandProfile,
  updateClient,
  type MemoryKind,
} from "@/server/services/clients";
import { setClientBudget } from "@/server/services/costs";
import type { BrandProfile, TemplateFamily } from "@/lib/brand";
import { suggestColorsFromInstagram, suggestColorsFromMedia, type InstagramColors } from "@/server/services/brand-colors";
import { deleteClient } from "@/server/services/deletion";
import { setPackage } from "@/server/services/packages";
import { approveEditorialPlan, proposeEditorialPlan, setEditorialItemStatus, updateEditorialItem } from "@/server/services/editorial";
import { importFromDrive, setDriveFolder } from "@/server/services/drive";
import type { EditorialFormat } from "@/server/skills/editorial";
import type { Objective } from "@/lib/content/document";
import type { PaletteSuggestion } from "@/server/brand/palette";

export async function createClientAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  let id = "";
  const result = await runAction(async () => {
    id = (await createClient(auth, { name: str(form, "name"), segment: str(form, "segment") })).id;
  });
  if (result.status === "ok") redirect(`/clientes/${id}?aba=marca&novo=1`);
  return result;
}

export async function updateClientAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await updateClient(auth, str(form, "clientId"), {
      name: str(form, "name"),
      segment: str(form, "segment"),
      status: str(form, "status") as "active" | "paused" | "archived",
    });
    refresh();
    return { message: "Dados do cliente atualizados." };
  });
}

export async function deleteClientAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await deleteClient(auth, str(form, "clientId"), str(form, "confirmation"));
    redirect("/clientes?excluido=1");
  });
}

const terms = (v: string) =>
  v
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 100);

export async function saveBrandAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const families = form.getAll("visual.preferredFamilies").map(String) as TemplateFamily[];
    const profile: BrandProfile = {
      business: {
        companyName: str(form, "business.companyName"),
        segment: str(form, "business.segment"),
        products: str(form, "business.products"),
        services: str(form, "business.services"),
        region: str(form, "business.region"),
        goals: str(form, "business.goals"),
      },
      audience: {
        targetAudience: str(form, "audience.targetAudience"),
        personas: str(form, "audience.personas"),
        valueProposition: str(form, "audience.valueProposition"),
        differentiators: str(form, "audience.differentiators"),
      },
      voice: {
        tone: str(form, "voice.tone"),
        restrictions: str(form, "voice.restrictions"),
        preferredTerms: terms(str(form, "voice.preferredTerms")),
        forbiddenTerms: terms(str(form, "voice.forbiddenTerms")),
      },
      visual: {
        colors: {
          primary: str(form, "visual.colors.primary"),
          secondary: str(form, "visual.colors.secondary"),
          accent: str(form, "visual.colors.accent"),
          background: str(form, "visual.colors.background"),
          text: str(form, "visual.colors.text"),
        },
        headingFont: str(form, "visual.headingFont") as BrandProfile["visual"]["headingFont"],
        bodyFont: str(form, "visual.bodyFont") as BrandProfile["visual"]["bodyFont"],
        logoAssetId: str(form, "visual.logoAssetId") || null,
        photoStyle: str(form, "visual.photoStyle"),
        iconStyle: str(form, "visual.iconStyle"),
        imageTreatment: str(form, "visual.imageTreatment"),
        titleCtaStyle: str(form, "visual.titleCtaStyle"),
        approvedReferences: str(form, "visual.approvedReferences"),
        restrictedElements: str(form, "visual.restrictedElements"),
        preferredFamilies: families,
        configured: bool(form, "visual.configured"),
      },
      channels: {
        instagram: str(form, "channels.instagram"),
        facebook: str(form, "channels.facebook"),
        linkedin: str(form, "channels.linkedin"),
        tiktok: str(form, "channels.tiktok"),
        website: str(form, "channels.website"),
        frequency: str(form, "channels.frequency"),
        confirmedOffers: str(form, "channels.confirmedOffers"),
      },
      references: {
        competitors: str(form, "references.competitors"),
        referenceUrls: str(form, "references.referenceUrls"),
        responsibles: str(form, "references.responsibles"),
      },
    };
    const revision = Number(str(form, "revision"));
    await updateBrandProfile(auth, str(form, "clientId"), profile, Number.isFinite(revision) ? revision : undefined);
    refresh();
    return { message: "Perfil da marca salvo." };
  });
}

export async function addMemoryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await addMemory(auth, str(form, "clientId"), { kind: str(form, "kind") as MemoryKind, content: str(form, "content") });
    refresh();
    return { message: "Informação registrada." };
  });
}

export async function memoryStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const op = str(form, "op");
    if (op === "delete") await deleteMemory(auth, str(form, "clientId"), str(form, "memoryId"));
    else await setMemoryStatus(auth, str(form, "clientId"), str(form, "memoryId"), op === "archive" ? "archived" : "active");
    refresh();
  });
}

export async function budgetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const limit = str(form, "monthlyLimitUsd").replace(",", ".");
    if (!limit) {
      await setClientBudget(auth, str(form, "clientId"), null);
      refresh();
      return { message: "Limite removido." };
    }
    await setClientBudget(auth, str(form, "clientId"), {
      monthlyLimitUsd: Number(limit),
      alertThresholdPct: Number(str(form, "alertThresholdPct") || 80),
      hardStop: bool(form, "hardStop"),
    });
    refresh();
    return { message: "Limite de consumo salvo." };
  });
}

// --- Sugestão de cores da marca (chamadas diretas do formulário do perfil) ---

export async function suggestColorsFromMediaAction(clientId: string, mediaIds: string[]): Promise<ActionState<PaletteSuggestion>> {
  const auth = await requireAuth();
  return runAction(async () => ({ data: await suggestColorsFromMedia(auth, String(clientId), Array.isArray(mediaIds) ? mediaIds.map(String) : []) }));
}

export async function suggestColorsFromInstagramAction(clientId: string, handle: string, saveProfilePicture: boolean): Promise<ActionState<InstagramColors>> {
  const auth = await requireAuth();
  return runAction(async () => {
    const data = await suggestColorsFromInstagram(auth, String(clientId), String(handle ?? ""), { saveProfilePicture: saveProfilePicture === true });
    if (data.savedLogoId) refresh();
    return { data };
  });
}

// --- Pacote mensal, linha editorial e Google Drive ---

export async function packageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await setPackage(auth, str(form, "clientId"), {
      posts: str(form, "posts") || "0",
      carousels: str(form, "carousels") || "0",
      stories: str(form, "stories") || "0",
      videos: str(form, "videos") || "0",
      notes: str(form, "notes"),
    });
    refresh();
    return { message: "Pacote salvo." };
  });
}

export async function proposeEditorialAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const useAi = str(form, "mode") === "ai";
    const r = await proposeEditorialPlan(auth, str(form, "clientId"), { month: str(form, "month"), theme: str(form, "theme"), useAi });
    refresh();
    return {
      message: useAi
        ? `${r.items} pautas propostas${r.isDemo ? " em modo de demonstração" : ""}. Revise e aprove.`
        : `${r.items} espaços criados pelo pacote. Preencha as pautas e aprove.`,
    };
  });
}

export async function updateEditorialItemAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    await updateEditorialItem(auth, str(form, "itemId"), {
      title: str(form, "title"),
      brief: str(form, "brief"),
      cta: str(form, "cta"),
      objective: str(form, "objective") as Objective,
      format: str(form, "format") as EditorialFormat,
      plannedDate: str(form, "plannedDate") || null,
    });
    refresh();
    return { message: "Pauta salva." };
  });
}

export async function editorialItemStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const status = str(form, "status");
    await setEditorialItemStatus(auth, str(form, "itemId"), status === "done" ? "done" : status === "skipped" ? "skipped" : "planned");
    refresh();
    return { message: status === "done" ? "Marcado como feito." : status === "skipped" ? "Fora deste mês." : "Pauta de volta à lista." };
  });
}

export async function approveEditorialAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const r = await approveEditorialPlan(auth, str(form, "planId"));
    refresh();
    const parts = [r.created === 1 ? "1 peça enviada para criação." : `${r.created} peças enviadas para criação.`];
    if (r.videos) parts.push(r.videos === 1 ? "1 vídeo fica para marcar quando feito." : `${r.videos} vídeos ficam para marcar quando feitos.`);
    if (r.stoppedBecause) parts.push(`Parou antes de terminar: ${r.stoppedBecause} Clique de novo para criar as ${r.pending} restantes.`);
    return { message: parts.join(" ") };
  });
}

export async function driveFolderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const r = await setDriveFolder(auth, str(form, "clientId"), str(form, "folder"));
    refresh();
    return { message: str(form, "folder") ? (r.folderName ? `Pasta ligada: ${r.folderName}.` : "Pasta salva.") : "Pasta desligada." };
  });
}

export async function driveImportAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const auth = await requireAuth();
  return runAction(async () => {
    const r = await importFromDrive(auth, str(form, "clientId"));
    refresh();
    const parts = [r.imported === 1 ? "1 arquivo importado." : `${r.imported} arquivos importados.`];
    if (r.failed.length) parts.push(`${r.failed.length === 1 ? "1 recusado" : `${r.failed.length} recusados`}: ${r.failed.slice(0, 3).join("; ")}${r.failed.length > 3 ? "..." : ""}`);
    if (r.remaining) parts.push(`Faltam ${r.remaining}: clique de novo para continuar.`);
    return { message: parts.join(" ") };
  });
}
