import { loadDotEnv } from "./load-env";

loadDotEnv();

const { env } = await import("../src/server/env");
const { runWorkerLoop } = await import("../src/server/jobs/worker");
const { closePool } = await import("../src/server/db/pool");

const controller = new AbortController();
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(JSON.stringify({ level: "info", msg: "worker.shutdown_requested", signal: sig }));
    controller.abort();
  });
}

await runWorkerLoop({ pollMs: env().WORKER_POLL_MS, lockTimeoutMs: env().JOB_LOCK_TIMEOUT_MS, signal: controller.signal });
await closePool();
