import { ForbiddenError } from "../errors";

export const ROLES = ["owner", "admin", "editor", "reviewer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  editor: "Criação",
  reviewer: "Aprovador",
  viewer: "Leitura",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Controle total da organização, usuários, custos e clientes.",
  admin: "Gerencia clientes, usuários (exceto proprietários), custos e configurações.",
  editor: "Cria e edita conteúdos, marcas e arquivos dos clientes atribuídos.",
  reviewer: "Revisa, comenta, aprova ou reprova conteúdos dos clientes atribuídos.",
  viewer: "Consulta conteúdos e históricos dos clientes atribuídos.",
};

const MATRIX = {
  "org.manage": ["owner", "admin"],
  "users.manage": ["owner", "admin"],
  "costs.manage": ["owner", "admin"],
  "costs.view": ["owner", "admin"],
  "client.create": ["owner", "admin"],
  "client.archive": ["owner", "admin"],
  "client.delete": ["owner", "admin"],
  "client.package": ["owner", "admin"],
  "client.update": ["owner", "admin", "editor"],
  "memory.manage": ["owner", "admin", "editor"],
  "media.upload": ["owner", "admin", "editor"],
  "media.delete": ["owner", "admin", "editor"],
  "content.create": ["owner", "admin", "editor"],
  "content.edit": ["owner", "admin", "editor"],
  "content.submit": ["owner", "admin", "editor"],
  "content.approve": ["owner", "admin", "reviewer"],
  "content.comment": ["owner", "admin", "editor", "reviewer"],
  "content.archive": ["owner", "admin", "editor"],
  "content.delete": ["owner", "admin"],
  "content.export": ["owner", "admin", "editor", "reviewer", "viewer"],
  "integrations.test": ["owner", "admin"],
  "skills.manage": ["owner", "admin"],
  "skills.run": ["owner", "admin", "editor"],
  "audit.view": ["owner", "admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export function can(role: Role, permission: Permission): boolean {
  return (MATRIX[permission] as readonly Role[]).includes(role);
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError();
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(MATRIX) as Permission[]).filter((p) => can(role, p));
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
