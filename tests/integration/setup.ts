import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach } from "vitest";
import { resetEnvCache } from "../../src/server/env";
import { closePool } from "../../src/server/db/pool";
import { setProviderOverride } from "../../src/server/ai/gateway";
import { setStorageDriver } from "../../src/server/storage";

const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-os-test-"));
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://prisma_app_login:prisma_app_dev@localhost:5432/prisma_os_test";
process.env.STORAGE_LOCAL_DIR = storageDir;
process.env.AI_PROVIDER = "demo";
process.env.APP_SECRET_KEY = "chave-de-teste-com-mais-de-32-caracteres-0123456789";
process.env.APP_URL = "https://prisma.teste.example";
resetEnvCache();
setStorageDriver(undefined);

beforeEach(() => {
  setProviderOverride(undefined);
});

afterAll(async () => {
  await closePool();
  fs.rmSync(storageDir, { recursive: true, force: true });
});
