import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AppError, ValidationError, toUserMessage } from "./errors";

/** Resultado padronizado de Server Actions para formulários. */
export type ActionState<T = undefined> =
  | { status: "idle" }
  | { status: "ok"; message?: string; data?: T }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export const idle: ActionState = { status: "idle" };

export async function runAction<T>(fn: () => Promise<{ message?: string; data?: T } | void>): Promise<ActionState<T>> {
  try {
    const r = await fn();
    return { status: "ok", ...(r ?? {}) };
  } catch (err) {
    // redirect()/notFound() do Next usam exceções próprias que precisam seguir adiante.
    unstable_rethrow(err);
    if (!(err instanceof AppError)) {
      console.error(JSON.stringify({ level: "error", msg: "action.unexpected_error", error: (err as Error)?.message, stack: (err as Error)?.stack }));
    }
    return {
      status: "error",
      message: toUserMessage(err),
      fieldErrors: err instanceof ValidationError ? err.fieldErrors : undefined,
    };
  }
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}
