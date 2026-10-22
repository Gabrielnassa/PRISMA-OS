declare module "@shuding/opentype.js" {
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    getAdvanceWidth(text: string, fontSize: number, options?: { kerning?: boolean }): number;
    charToGlyphIndex(char: string): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
