import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

/**
 * Armazenamento de arquivos desacoplado. O driver local grava em disco; um
 * driver compatível com S3/Supabase Storage pode implementar a mesma interface.
 */
export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}

const KEY_RE = /^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]{2,5}$/;

export function assertSafeKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error(`Chave de armazenamento inválida: ${key}`);
  }
}

export class LocalStorageDriver implements StorageDriver {
  readonly name = "local";
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const root = path.resolve(this.root);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Caminho fora do diretório de armazenamento");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const tmp = `${full}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data, { mode: 0o640 });
    await fs.rename(tmp, full);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const root = path.resolve(this.root);
      await fs.mkdir(root, { recursive: true });
      const probe = path.join(root, `.health-${process.pid}`);
      await fs.writeFile(probe, "ok");
      await fs.rm(probe, { force: true });
      return { ok: true, detail: `Diretório gravável: ${root}` };
    } catch (err) {
      return { ok: false, detail: `Falha ao gravar no diretório de armazenamento: ${(err as Error).message}` };
    }
  }
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  driver ??= new LocalStorageDriver(env().STORAGE_LOCAL_DIR);
  return driver;
}

/** Usado nos testes para apontar para um diretório temporário. */
export function setStorageDriver(d: StorageDriver | undefined): void {
  driver = d;
}
