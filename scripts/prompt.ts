import readline from "node:readline";
import { Writable } from "node:stream";

/**
 * Lê uma linha do terminal. Com `hidden`, a saída do readline vai para um
 * destino mudo: nada do que é digitado aparece, nem quando o readline redesenha
 * a linha (Backspace, por exemplo). Ctrl+C e Ctrl+D encerram sem alterar nada.
 */
function readLine(question: string, hidden: boolean): Promise<string> {
  if (hidden) process.stdout.write(question);
  const output = hidden ? new Writable({ write: (_chunk, _encoding, done) => done() }) : process.stdout;
  const rl = readline.createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
  return new Promise((resolve) => {
    let answered = false;
    rl.on("SIGINT", () => {
      process.stdout.write("\n");
      process.exit(130);
    });
    rl.on("close", () => {
      if (answered) return;
      process.stdout.write("\n");
      process.exit(1);
    });
    rl.question(hidden ? "" : question, (answer) => {
      answered = true;
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

/** Pergunta no terminal (resposta sem espaços nas pontas; repete se vazia). */
export async function ask(question: string): Promise<string> {
  let answer = "";
  while (!answer) answer = (await readLine(question, false)).trim();
  return answer;
}

/** Pergunta no terminal sem mostrar o que é digitado. */
export function askHidden(question: string): Promise<string> {
  return readLine(question, true);
}

/** Pede uma senha nova duas vezes; encerra o processo se não conferirem. */
export async function askNewPassword(): Promise<string> {
  const password = await askHidden("Senha (mín. 10 caracteres, letras e números): ");
  if ((await askHidden("Repita a senha: ")) !== password) {
    console.error("As senhas não conferem. Nada foi alterado.");
    process.exit(1);
  }
  return password;
}
