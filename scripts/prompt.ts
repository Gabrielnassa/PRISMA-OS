import readline from "node:readline";

/** Pergunta no terminal (resposta sem espaços nas pontas; repete se vazia). */
export async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let answer = "";
  while (!answer) answer = (await new Promise<string>((resolve) => rl.question(question, resolve))).trim();
  rl.close();
  return answer;
}

/** Pergunta no terminal sem mostrar o que é digitado. */
export async function askHidden(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const anyRl = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  anyRl._writeToOutput = (s: string) => {
    if (s.includes(question)) anyRl.output.write(s);
  };
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
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
