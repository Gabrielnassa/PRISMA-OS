/**
 * Ambiente de desenvolvimento: sobe o Next.js e o worker de tarefas juntos.
 * Encerrar (Ctrl+C) finaliza os dois processos.
 */
import { spawn } from "node:child_process";

const procs = [
  ["web", "npx", ["next", "dev"]],
  ["worker", "npx", ["tsx", "--conditions=react-server", "scripts/worker.ts"]],
].map(([name, cmd, args]) => {
  const child = spawn(cmd, args, { stdio: ["inherit", "pipe", "pipe"], env: process.env });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split("\n")
      .filter(Boolean)
      .map((line) => `[${name}] ${line}`)
      .join("\n") + "\n";
  child.stdout.on("data", (c) => process.stdout.write(prefix(c)));
  child.stderr.on("data", (c) => process.stderr.write(prefix(c)));
  child.on("exit", (code) => {
    console.log(`[${name}] encerrado (código ${code ?? "?"})`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (p.exitCode === null) p.kill("SIGTERM");
  setTimeout(() => process.exit(code), 1500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
