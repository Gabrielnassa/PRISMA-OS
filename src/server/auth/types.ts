import type { Role } from "../authz/permissions";

/** Usuário autenticado com a organização ativa da sessão. */
export interface AuthContext {
  sessionId: string;
  userId: string;
  userName: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: Role;
  mustChangePassword: boolean;
}
