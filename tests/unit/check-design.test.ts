import { describe, expect, it } from "vitest";
// @ts-expect-error script em JavaScript puro, sem tipos
import { checkSource } from "../../scripts/check-design.mjs";

const errs = (src: string) => (checkSource(src) as Array<{ line: number; msg: string }>).map((e) => e.msg);

describe("check-design", () => {
  it("aceita classes do sistema", () => {
    expect(errs('<p className="text-base text-muted rounded-sm border-line bg-surface-2 font-mono" />')).toEqual([]);
    expect(errs('<span className="size-1.5 rounded-full bg-ok" />')).toEqual([]);
  });

  it("recusa tamanho avulso e tamanhos fora dos cinco", () => {
    expect(errs('<p className="text-[13px]" />')).toHaveLength(1);
    expect(errs('<p className="md:text-2xl" />')).toHaveLength(1);
  });

  it("recusa fonte de vitrine, pílula e raio fora do sistema", () => {
    expect(errs('<h1 className="font-display" />')).toHaveLength(1);
    expect(errs('<a className="rounded-full px-3" />')[0]).toMatch(/pílula/);
    expect(errs('<div className="rounded-lg" />')).toHaveLength(1);
    expect(errs('<div className="rounded-[10px]" />')).toHaveLength(1);
  });

  it("recusa cor direta e hexadecimal em classe", () => {
    expect(errs('<p className="text-red-300" />')).toHaveLength(1);
    expect(errs('<p className="hover:bg-emerald-400/10" />')).toHaveLength(1);
    expect(errs('<p className="bg-[#ff0000]" />')).toHaveLength(1);
    expect(errs('<p className="text-ink-400" />')).toHaveLength(1);
  });

  it("ignora comentários e aponta a linha", () => {
    expect(errs("// text-[13px] era o tamanho antigo")).toEqual([]);
    expect(checkSource('a\n<p className="text-[9px]" />')[0].line).toBe(2);
  });
});
