/**
 * Erros de domínio com mensagem segura para exibição ao usuário (pt-BR).
 * Detalhes técnicos ficam em `cause` e nos logs, nunca na interface.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly fieldErrors: Record<string, string> = {}) {
    super("validation_error", message, 400);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Sessão expirada ou inexistente. Entre novamente.") {
    super("unauthenticated", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para esta ação.") {
    super("forbidden", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Registro não encontrado.") {
    super("not_found", message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("conflict", message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Muitas tentativas. Aguarde alguns minutos e tente novamente.") {
    super("rate_limited", message, 429);
  }
}

export class BudgetExceededError extends AppError {
  constructor(message: string) {
    super("budget_exceeded", message, 402);
  }
}

export class ProviderNotConfiguredError extends AppError {
  constructor(message = "Nenhum provedor de IA configurado. Defina ANTHROPIC_API_KEY (veja Integrações).") {
    super("provider_not_configured", message, 503);
  }
}

export class IntegrationError extends AppError {
  constructor(
    message: string,
    public readonly retryable: boolean,
    options?: { cause?: unknown; providerCode?: string },
  ) {
    super(options?.providerCode ?? "integration_error", message, 502, options);
  }
}

export function toUserMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return "Erro inesperado. A falha foi registrada; tente novamente.";
}
