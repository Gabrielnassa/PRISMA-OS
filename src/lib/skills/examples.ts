/**
 * Modelos de partida para criar uma skill (o usuário edita antes de salvar).
 * São exemplos de instruções, não conteúdo de clientes.
 */
export const SKILL_EXAMPLES: Array<{ id: string; name: string; description: string; effort: "low" | "medium" | "high"; instructions: string }> = [
  {
    id: "roteiro-reels",
    name: "Roteiro de Reels",
    description: "Roteiro de vídeo curto (até 60 s) com gancho, cenas, falas e legenda.",
    effort: "medium",
    instructions: `Crie um roteiro de Reels de 30 a 60 segundos a partir do pedido.

Entregue, nesta ordem:
1. **Gancho (0–3 s):** a primeira frase falada e o texto na tela. Precisa prender sem clickbait.
2. **Cenas:** uma lista numerada. Para cada cena: o que aparece, a fala (curta, como se fala de verdade) e o texto na tela, se houver.
3. **Fechamento:** chamada para ação coerente com o objetivo do pedido.
4. **Legenda do post:** até 3 parágrafos curtos e no máximo 5 hashtags relevantes.
5. **Dicas de gravação:** 3 a 5 dicas práticas (luz, enquadramento, ritmo) para quem vai gravar com o celular.

Use o tom de voz da marca. Prefira falas curtas, uma ideia por cena.`,
  },
  {
    id: "legenda-instagram",
    name: "Legendas para Instagram",
    description: "Três opções de legenda para um post, em tons diferentes, com hashtags.",
    effort: "low",
    instructions: `Escreva 3 opções de legenda para o post descrito no pedido.

- Opção 1: direta e informativa.
- Opção 2: mais próxima e conversada.
- Opção 3: com uma pergunta para gerar comentários.

Cada opção: até 600 caracteres, primeira linha forte (é o que aparece antes do "mais"), chamada para ação no fim e de 3 a 5 hashtags específicas do segmento (nada de hashtags genéricas como #love ou #instagood).`,
  },
  {
    id: "respostas-comentarios",
    name: "Respostas a comentários e directs",
    description: "Sugere respostas para comentários ou mensagens de clientes, no tom da marca.",
    effort: "low",
    instructions: `O pedido traz um ou mais comentários ou mensagens recebidos nas redes do cliente.

Para cada mensagem:
1. Classifique: dúvida, elogio, reclamação, interesse de compra ou outro.
2. Sugira uma resposta curta e humana, no tom da marca.
3. Se for reclamação ou envolver dado que você não tem (preço, prazo, estoque), sugira levar a conversa para o privado e indique o que a equipe precisa confirmar antes de responder.

Nunca prometa prazos, descontos ou condições que não estejam no perfil da marca ou no pedido.`,
  },
];
