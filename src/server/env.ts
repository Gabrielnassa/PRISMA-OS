import { z } from "zod";

/**
 * Configuração lida exclusivamente de variáveis de ambiente.
 * Segredos nunca são versionados: veja `.env.example`.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(72),
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(200).default(15),
  AI_PROVIDER: z.enum(["anthropic", "openai", "demo", "none"]).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
  // Opcional: substitui o esforço definido por skill (ideias "low", textos e revisão "medium").
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  ANTHROPIC_FALLBACKS: z.enum(["default", "off"]).default("default"),
  // OpenAI (chave da API em platform.openai.com; a assinatura do ChatGPT não inclui API).
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-6.1-sol"),
  OPENAI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(600_000).default(180_000),
  GENERATION_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(10),
  WORKER_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  JOB_LOCK_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(600_000),
  // Instagram (API oficial da Meta, "Business Discovery"): consulta perfis comerciais pelo @.
  // Integração opcional: valores inválidos não derrubam o sistema; a tela de
  // Integrações explica o problema (veja integrations/instagram.ts).
  META_ACCESS_TOKEN: z.string().trim().optional(),
  META_IG_USER_ID: z.string().trim().optional(),
  META_GRAPH_VERSION: z.string().trim().regex(/^v\d+\.\d+$/).catch("v23.0").default("v23.0"),
  // Google Drive (conta de serviço): importa fotos e vídeos da pasta de cada cliente.
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  // Limite por arquivo importado do Drive (vídeos costumam passar do limite de envio pela tela).
  DRIVE_IMPORT_MAX_MB: z.coerce.number().min(1).max(500).catch(100).default(100),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    // Variáveis vazias (ex.: `AI_PROVIDER=` copiado do .env.example) valem como não definidas.
    const defined = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
    const parsed = EnvSchema.safeParse(defined);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Configuração inválida: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Usado pelos testes para recarregar a configuração após alterar process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
