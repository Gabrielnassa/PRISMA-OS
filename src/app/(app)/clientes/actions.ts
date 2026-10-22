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

export async function memoryStatusAction(form: FormData): Promise<void> {
  const auth = await requireAuth();
  const op = str(form, "op");
  if (op === "delete") await deleteMemory(auth, str(form, "clientId"), str(form, "memoryId"));
  else await setMemoryStatus(auth, str(form, "clientId"), str(form, "memoryId"), op === "archive" ? "archived" : "active");
  refresh();
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
