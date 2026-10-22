/**
 * Identificação do tipo real do arquivo pelos bytes iniciais (não confiamos na
 * extensão nem no Content-Type enviado pelo navegador) e leitura das dimensões
 * de imagens sem dependências nativas.
 */

export type SniffedType =
  | { mime: "image/png"; ext: "png"; category: "image" }
  | { mime: "image/jpeg"; ext: "jpg"; category: "image" }
  | { mime: "image/webp"; ext: "webp"; category: "image" }
  | { mime: "image/gif"; ext: "gif"; category: "image" }
  | { mime: "image/svg+xml"; ext: "svg"; category: "image" }
  | { mime: "application/pdf"; ext: "pdf"; category: "document" }
  | { mime: "video/mp4"; ext: "mp4"; category: "video" }
  | { mime: "video/quicktime"; ext: "mov"; category: "video" };

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

export function sniffType(buf: Buffer): SniffedType | null {
  if (buf.length < 12) return null;
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png", category: "image" };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg", category: "image" };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp", category: "image" };
  const head6 = buf.toString("ascii", 0, 6);
  if (head6 === "GIF87a" || head6 === "GIF89a") return { mime: "image/gif", ext: "gif", category: "image" };
  if (buf.toString("ascii", 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf", category: "document" };
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "qt  ") return { mime: "video/quicktime", ext: "mov", category: "video" };
    return { mime: "video/mp4", ext: "mp4", category: "video" };
  }
  const text = buf.toString("utf8", 0, Math.min(buf.length, 4096)).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text)) {
    return { mime: "image/svg+xml", ext: "svg", category: "image" };
  }
  return null;
}

/** SVG com script, objetos externos ou manipuladores de evento é recusado. */
export function isUnsafeSvg(buf: Buffer): boolean {
  const s = buf.toString("utf8").toLowerCase();
  return /<script|javascript:|<foreignobject|\son[a-z]+\s*=|<iframe|<embed|<object|xlink:href\s*=\s*["']https?:|href\s*=\s*["']https?:/.test(s);
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Dimensões como a imagem é EXIBIDA (JPEG com orientação EXIF 5–8 tem largura e altura trocadas). */
export function imageSize(buf: Buffer, mime: string): ImageSize | null {
  try {
    switch (mime) {
      case "image/png":
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
      case "image/gif":
        return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
      case "image/jpeg": {
        const size = jpegSize(buf);
        if (size && jpegOrientation(buf) >= 5) return { width: size.height, height: size.width };
        return size;
      }
      case "image/webp":
        return webpSize(buf);
      case "image/svg+xml":
        return svgSize(buf);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function jpegSize(buf: Buffer): ImageSize | null {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  return null;
}

/** Orientação EXIF (tag 0x0112) de um JPEG; 1 quando ausente ou inválida. */
export function jpegOrientation(buf: Buffer): number {
  try {
    let offset = 2;
    while (offset + 4 < buf.length && buf[offset] === 0xff) {
      const marker = buf[offset + 1]!;
      if (marker === 0xda || marker === 0xd9) break;
      const length = buf.readUInt16BE(offset + 2);
      if (marker === 0xe1 && buf.toString("ascii", offset + 4, offset + 10) === "Exif\0\0") {
        const tiff = offset + 10;
        const little = buf.toString("ascii", tiff, tiff + 2) === "II";
        const u16 = (o: number) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
        const u32 = (o: number) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
        const ifd = tiff + u32(tiff + 4);
        const entries = u16(ifd);
        for (let i = 0; i < entries; i++) {
          const entry = ifd + 2 + i * 12;
          if (u16(entry) === 0x0112) {
            const value = u16(entry + 8);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
        return 1;
      }
      offset += 2 + length;
    }
  } catch {
    // EXIF malformado: trata como orientação normal.
  }
  return 1;
}

function webpSize(buf: Buffer): ImageSize | null {
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const b0 = buf[21]!, b1 = buf[22]!, b2 = buf[23]!, b3 = buf[24]!;
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  return null;
}

function svgSize(buf: Buffer): ImageSize | null {
  const s = buf.toString("utf8", 0, Math.min(buf.length, 8192));
  const tag = /<svg[^>]*>/i.exec(s)?.[0];
  if (!tag) return null;
  const num = (attr: string) => {
    const m = new RegExp(`\\s${attr}\\s*=\\s*["']\\s*([0-9.]+)(px)?\\s*["']`, "i").exec(tag);
    return m ? Number(m[1]) : null;
  };
  const w = num("width");
  const h = num("height");
  if (w && h) return { width: Math.round(w), height: Math.round(h) };
  const vb = /viewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/i.exec(tag);
  if (vb) return { width: Math.round(Number(vb[1])), height: Math.round(Number(vb[2])) };
  return null;
}
