# Sistema visual do PRISMA OS

A interface é uma ferramenta de trabalho, não uma vitrine: densa, calma e previsível. Este documento substitui o antigo
`DESIGN-referencia.md`. A origem das regras é o briefing (`docs/briefing-melhorias.pdf`, seção 3).

`npm run lint` roda `scripts/check-design.mjs`, que recusa em `src/app` e `src/components` tudo o que sai destas regras.

## Sete regras

1. A tipografia faz a hierarquia. Caixa com borda só quando separa objetos de verdade.
2. Cinco tamanhos de fonte. Fora deles, o CI recusa.
3. Cor é sinal. Neutro por padrão; vermelho e âmbar só para o que pede ação; um acento só.
4. Retângulos discretos: raio de 4 px (6 px em menu e diálogo), linha fina, sem sombra, sem degradê, sem pílula.
5. Tabela e lista antes de cartão. Linha de 34 px, número alinhado à direita.
6. Dado em fonte mono: datas, quantidades, valores, versões e identificadores.
7. Toda tela começa pelo que precisa de ação. Contador vem depois, em uma linha.

## Tipografia

IBM Plex Sans na interface (`font-sans`) e IBM Plex Mono nos dados (`font-mono`). As fontes das peças não mudam.

| Classe      | Tamanho / linha | Peso                             | Uso                                                      |
| ----------- | --------------- | -------------------------------- | -------------------------------------------------------- |
| `text-xs`   | 11 / 16 px      | 500, maiúsculas, +0,05em         | cabeçalho de tabela, rótulo de grupo                     |
| `text-sm`   | 12 / 16 px      | 400                              | texto secundário, dica, estado                           |
| `text-base` | 13 / 20 px      | 400 e 500; 600 em título de seção | corpo: tabelas, formulários, navegação                   |
| `text-md`   | 15 / 22 px      | 600                              | título da página (na barra de topo) e de diálogo         |
| `text-lg`   | 20 / 28 px      | 600                              | só onde não há barra de topo: login e páginas do cliente |

Não existem `text-xl` em diante nem tamanhos entre colchetes (`text-[13px]`).

## Cores

Tokens com nome de função, sempre em par. Classes: `bg-bg`, `bg-surface`, `bg-surface-2`, `border-line`,
`border-control`, `text-fg`, `text-muted`, `text-faint`, `text-accent`, `text-danger`, `text-warn`, `text-ok` (e os
mesmos nomes com `bg-`, `border-`, `ring-`, `divide-`).

| Token              | Escuro    | Claro     | Uso                                              |
| ------------------ | --------- | --------- | ------------------------------------------------ |
| `bg`               | `#0f1011` | `#ffffff` | fundo da página                                  |
| `surface`          | `#151618` | `#f6f6f7` | barra lateral, linha em foco                     |
| `surface-2`        | `#1c1d20` | `#eeeef0` | hover, item ativo                                |
| `line` (border)    | `#26282c` | `#e2e3e6` | linhas e divisórias                              |
| `control`          | `#62656c` | `#878a91` | contorno de campo e de botão secundário          |
| `fg` (text)        | `#e8e9eb` | `#17181a` | texto                                            |
| `muted`            | `#9b9ea4` | `#5d6067` | texto secundário, rótulos                        |
| `faint`            | `#6f7278` | `#8a8d94` | só placeholder, desativado e ícone decorativo    |
| `accent`           | `#8fb0ee` | `#2f56b0` | link, foco, seleção                              |
| `danger`           | `#f2686c` | `#c62f36` | falha                                            |
| `warn`             | `#e2a336` | `#8f5f00` | atraso, pendência antiga                         |
| `ok`               | `#4cb782` | `#1c7a4f` | ponto de estado e barra completa                 |

As cores diretas do Tailwind (`red-300`, `emerald-400`, `zinc-500`…) e hexadecimais em classe são recusadas. O íris e o
coral ficam só no logotipo.

### Temas

O app segue a preferência do sistema operacional (`prefers-color-scheme`). `data-theme="light"` ou `data-theme="dark"`
num elemento força o tema daquele trecho; o relatório do cliente usa o claro. Os valores ficam em `src/app/globals.css`.

## Forma e espaço

- **Raio:**
  - `rounded-sm` (4 px) em botão, campo, etiqueta e item de navegação;
  - `rounded-md` (6 px) em menu, diálogo, aviso de resultado e bloco com borda;
  - `rounded-full` só em elemento quadrado (`size-*`): avatar, ponto de estado e interruptor.
- **Altura de controle:** 28 px em barras e tabelas (`size="sm"`), 32 px em formulários; no celular, 44 px.
- **Tabela:** linha de 34 px, 10 px nas laterais, divisória de 1 px, sem moldura.
- **Estrutura:**
  - grade de 4 px;
  - barra lateral de 216 px (linhas de 28 px);
  - barra de topo de 48 px;
  - margem de página de 28 px.
- **Sombra:** só em menu, diálogo e aviso de resultado.

## Componentes (`src/components/ui/`)

Importe sempre de `@/components/ui`.

| Componente                    | Regra                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Button`, `LinkButton`        | Principal neutro invertido, um por tela. Secundário com contorno. Fantasma para ação de linha. Perigo só no diálogo de confirmação. |
| `Input`, `Textarea`, `Select` | Contorno `control`, raio de 4 px, seta própria no `Select`.                                              |
| `Dot`, `Badge`                | Ponto de 6 px e texto, sem fundo colorido. Neutro para o que é normal; `warning` e `danger` só para atraso e falha; `success` só no concluído. |
| `Alert`                       | Uma linha, sem cartão e sem barra lateral.                                                               |
| `Table`, `Th`, `Td`           | Sem moldura e sem largura mínima fixa.                                                                   |
| `PageHeader`                  | Barra de topo de 48 px, fixa, com contexto, título e ações; a descrição vem logo abaixo.                 |
| `Stat`, `StatGroup`           | Rótulo e valor em linha, valor em mono.                                                                  |
| `EmptyState`                  | Uma linha de texto com a ação, sem caixa.                                                                |
| `Card`, `CardHeader`          | Raio de 6 px, linha fina, sem fundo próprio. Use só quando separa objetos.                               |
| `TabLinks`                    | Abas com sublinhado.                                                                                     |
| `ListSkeleton`, `FormSkeleton`, `PieceSkeleton` | Um esqueleto de carregamento por tipo de tela.                                         |

## O que não fazer

- Título de página grande no corpo da página: o título vai na barra de topo (`PageHeader`).
- Animação de entrada, brilho no hover, degradê.
- Contadores gigantes.
- Caixa tracejada de "nada aqui".
- Repetir um estado permanente (como "IA não conectada") fora do rodapé da barra lateral.
