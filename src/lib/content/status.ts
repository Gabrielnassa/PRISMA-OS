export const CONTENT_STATUSES = [
  "draft",
  "generating",
  "in_review",
  "awaiting_approval",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "failed",
  "archived",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Estados exigidos pela seção 14. */
export const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Rascunho",
  generating: "Em geração",
  in_review: "Em revisão",
  awaiting_approval: "Aguardando aprovação",
  approved: "Aprovado",
  scheduled: "Agendado",
  published: "Publicado",
  rejected: "Reprovado",
  failed: "Falhou",
  archived: "Arquivado",
};

export const STATUS_TONE: Record<ContentStatus, "neutral" | "info" | "warning" | "success" | "danger" | "accent"> = {
  draft: "neutral",
  generating: "info",
  in_review: "accent",
  awaiting_approval: "warning",
  approved: "success",
  scheduled: "info",
  published: "success",
  rejected: "danger",
  failed: "danger",
  archived: "neutral",
};
