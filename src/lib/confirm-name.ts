/** Confere o nome digitado para confirmar uma exclusão, sem exigir maiúsculas nem espaços idênticos. */
export function confirmsName(typed: string, name: string): boolean {
  const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return norm(typed) !== "" && norm(typed) === norm(name);
}
