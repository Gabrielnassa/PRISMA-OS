import { z } from "zod";
import { CHANNELS, CONTENT_FORMATS, OBJECTIVES } from "./document";

export const BriefingSchema = z.object({
  text: z.string().trim().min(10, "Descreva o briefing com pelo menos 10 caracteres.").max(6000),
  audience: z.string().trim().max(1000).default(""),
  keyMessages: z.string().trim().max(3000).default(""),
  offer: z.string().trim().max(1000).default(""),
  cta: z.string().trim().max(300).default(""),
});
export type Briefing = z.infer<typeof BriefingSchema>;

export const CreateContentSchema = z.object({
  clientId: z.string().uuid("Selecione um cliente."),
  title: z.string().trim().min(2, "Informe um título interno para a pauta.").max(200),
  channel: z.enum(CHANNELS),
  format: z.enum(CONTENT_FORMATS),
  aspect: z.enum(["1:1", "4:5", "9:16"]).optional(),
  objective: z.enum(OBJECTIVES),
  briefing: BriefingSchema,
  // Post e story têm uma lâmina; o carrossel precisa de 2 a 10 (validado abaixo).
  slideCount: z.coerce.number().int().min(1).max(10).default(5),
  templatePreference: z.string().max(60).default("auto"),
  imageAssetIds: z.array(z.string().uuid()).max(10).default([]),
  mode: z.enum(["ai", "manual"]),
  requestId: z.string().uuid(),
}).superRefine((v, ctx) => {
  if (v.format === "carousel" && v.slideCount < 2) {
    ctx.addIssue({ code: "custom", path: ["slideCount"], message: "O carrossel precisa de pelo menos 2 lâminas." });
  }
});
export type CreateContentInput = z.input<typeof CreateContentSchema>;
