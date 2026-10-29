/** "1 peça", "3 peças". Evita o "peça(s)" nos textos da interface. */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
}
