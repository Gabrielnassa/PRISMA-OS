import fs from "node:fs";
import path from "node:path";

export default async function globalTeardown(): Promise<void> {
  const pidFile = path.resolve(".e2e-worker.pid");
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // já encerrado
      }
    }
    fs.rmSync(pidFile, { force: true });
  }
}
