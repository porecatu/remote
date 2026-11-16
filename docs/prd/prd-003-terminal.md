# PRD-003 — Terminal

**Status:** Aprovado
**Data:** 2026-11-15
**Relacionados:** [PRD-000](prd-000-visao-de-produto.md), [PRD-002](prd-002-navegacao-do-workspace.md), [PRD-004](prd-004-gestao-de-abas.md), [ADR-0002](../adr/0002-render-da-grade-com-skia.md), [mensagens §5 e §6](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)

## Problema

A tela do terminal é onde o app entrega valor: ler a saída de um build, ver o erro do servidor, digitar um comando. Três coisas tornam isso difícil num celular:

1. **O tamanho é do desktop.** Uma aba de 200 colunas não cabe numa tela de 400 pontos; e o app não pode encolher o terminal sem estragar o que está na tela do computador.
2. **O teclado virtual não tem `Ctrl`, `Esc`, `Tab` nem setas** em lugar acessível, e é exatamente o que um terminal pede.
3. **A rede do celular é instável**: a tela tem de mostrar o estado mais recente, não uma fila atrasada.

## O que já existe e não muda

- A grade chega como `grid-snapshot` seguido de `grid-diff`, com cores não resolvidas, resolvidas pelo `theme` ([mensagens §5](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)).
- O desktop controla o fluxo: no máximo 2 mensagens de grade sem `grid-ack` por assinatura, e no máximo 30 por segundo.
- O input vai **semântico** (tecla nomeada + modificadores, texto, colar); quem codifica em bytes é o desktop.
- Perguntas do SSH são respondidas só no desktop no v1.

## Requisitos

### Grade ao vivo

- **RF-3.1** Abrir uma aba assina o painel focado (`subscribe`) e mostra a grade quando chega o `grid-snapshot`. Sair da tela cancela a assinatura (`unsubscribe`).
- **RF-3.2** O app aplica cada `grid-diff` sobre o estado anterior, confere a sequência (`seq`) e confirma com `grid-ack` **depois** de aplicar. Sequência quebrada é tratada como dessincronia: o app assina de novo o painel, o que traz um snapshot novo.

  > **Revisão (2026-11-16, alinhamento com a spec):** a [spec §5.3](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md) diz que um `seq` fora de sequência só acontece por defeito de implementação e é **erro de protocolo**: o cliente manda `error { protocol }`, a sessão fecha e o cliente **não** tenta se recuperar por conta própria. A spec é normativa, e o app segue ela: `grid-diff` sem snapshot antes, com `seq` diferente de anterior + 1 ou malformado faz o app mandar `error { protocol }` e encerrar a sessão (`src/session/subscription.ts`, `src/grid/gridModel.ts`), sem assinar de novo. Assinar de novo continua sendo o jeito de pedir o estado completo quando o app quer, não a reação a uma lacuna. O `seq` **não** reinicia no snapshot: snapshots e diffs dividem a mesma sequência da assinatura.
- **RF-3.3** O app respeita `max_subscriptions` do `welcome`. No v1 ele usa **uma** assinatura por vez (o painel na tela); o limite só importa para a miniatura de painéis, que não mostra grade.
- **RF-3.4** A grade é desenhada com o `theme` do desktop: cores padrão, indexadas (0–15 da paleta, 16–255 pela tabela do xterm) e diretas; negrito, itálico, sublinhado, inverso, esmaecido, riscado e oculto; caracteres de largura dupla em duas células; cursor na forma (bloco, sublinhado, barra) e visibilidade que vieram.

  > **Decidido pelo dono em 2026-11-16:** o **esmaecido** (`dim`) mistura a cor de frente com a de fundo com o fator **0,66** (peso da frente: `frente' = fundo + (frente − fundo) × 0,66`, por canal, arredondado), o fator do terminal Alacritty. O desktop marca a célula esmaecida no snapshot da grade, mas hoje não a pinta esmaecida. A ordem é: resolver as duas cores, trocar para `inverse`, esmaecer para `dim`, e `hidden` vence `dim` (frente = fundo). Implementado em `src/grid/colorMath.ts` (`DIM_FACTOR`, `resolveCellColors`).
- **RF-3.5** A fonte da grade é monoespaçada, embutida no app, com cobertura de box-drawing e blocos desenhados como formas (não pela fonte), para não haver costura entre células.

### Tamanho, zoom e rolagem

- **RF-3.6** O tamanho em colunas × linhas é **sempre o do desktop**. O app nunca pede outro tamanho.
- **RF-3.7** **Zoom por pinça**, entre "caber a largura toda na tela" e um tamanho legível de leitura; o padrão ao abrir é **caber a largura**, se o resultado for legível (corpo de fonte ≥ 8 pt), senão o tamanho de leitura com rolagem horizontal.
- **RF-3.8** Com a grade mais larga que a tela, **rolagem horizontal** livre, e um botão "seguir o cursor" que enquadra a coluna do cursor e passa a acompanhá-lo enquanto o usuário digita.
- **RF-3.9** O zoom escolhido é lembrado **por aba** durante a sessão do app.
- **RF-3.10** Mudança de tamanho no desktop (novo `grid-snapshot` com outras dimensões) mantém o zoom relativo e reposiciona a rolagem no cursor.

### Histórico

- **RF-3.11** Rolar para cima além do topo da tela pede páginas de scrollback (`scrollback-request`, até 500 linhas por pedido) conforme o usuário avança, e as mostra acima da grade viva. Rolar no app **não** move a rolagem do desktop.
- **RF-3.12** Enquanto o usuário está no histórico, a grade viva continua sendo atualizada embaixo; o app corrige o deslocamento quando o `history` cresce, para o texto que o usuário lê não "andar". Um botão "voltar ao fim" aparece enquanto ele está fora do fundo.
- **RF-3.13** Na tela alternativa (`alt = true`, TUIs como `vim`, `htop`), não há histórico, e o gesto de rolar vertical vira rolagem da grade quando ela é mais alta que a tela.

### Input

- **RF-3.14** Tocar na grade abre o teclado do sistema. O texto digitado (inclusive acentos, composição de IME e ditado) vai como `text-input` (nome da mensagem na spec).
- **RF-3.15** Acima do teclado, uma **barra de teclas especiais**: `Esc`, `Tab`, `Ctrl`, `Alt`, setas, `Home`/`End`, `PgUp`/`PgDn` e um acesso a `F1`–`F12`. As teclas nomeadas vão como `key` com o `named-key` da spec.
- **RF-3.16** `Ctrl` e `Alt` são **modificadores com trava**: um toque vale para a próxima tecla, dois toques travam até um terceiro. `Ctrl` + uma letra do teclado do sistema vai como `key { key: "c", mods: Ctrl }`, não como texto.
- **RF-3.17** **Colar** (menu do sistema ou botão na barra) vai como `paste`; o desktop aplica bracketed paste e as regras do colar local. Colar mais de uma linha pede confirmação no app, mostrando as primeiras linhas.

  > **Decidido pelo dono em 2026-11-16:** a confirmação aparece **sempre que o texto colado tiver qualquer quebra de linha** (`\n`, `\r` ou `\r\n`), inclusive uma só no fim (`ls\n` rodaria o comando ao colar). A prévia mostra até **5 linhas**, cada uma cortada em **120 caracteres** (contados por code point), e diz quantas linhas ficaram de fora. Implementado em `src/input/paste.ts` (`DEFAULT_PREVIEW_LINES`, `DEFAULT_PREVIEW_LINE_CHARS`, `analyzePaste`) e `src/input/send.ts`; nada é mandado antes da confirmação.
- **RF-3.18** O app manda input só a painel `running` e assinado. Painel em outro estado não abre o teclado.
- **RF-3.19** Atalhos do Porecatu **não** são disparados pelo app: toda tecla vai ao terminal. Ações sobre abas são do [PRD-004](prd-004-gestao-de-abas.md).
- **RF-3.25** Um envio de texto (`text-input` ou `paste`) tem no máximo **1 MiB** (1 048 576 bytes em UTF-8). Acima disso o app recusa o envio antes do fio, sem mandar nada, em vez de deixar uma mensagem gigante derrubar a sessão. Texto vazio e texto que não é Unicode válido (surrogate solto) também são recusados antes do fio.

  > **Decidido pelo dono em 2026-11-16.** Implementado em `src/input/send.ts` (`MAX_INPUT_TEXT_BYTES`, recusa `too-large`). O protocolo fecha a sessão com mensagem remontada acima de 16 MiB ([handshake e pareamento](https://github.com/porecatu/protocol/blob/main/docs/especificacao/02-handshake-e-pareamento.md)); o teto de 1 MiB é uma guarda do app, bem abaixo disso.

### Estados do painel

- **RF-3.20** Painel `not-started` (aba restaurada não iniciada ou SSH dormente): a grade vem vazia, e o app mostra um botão **Iniciar** (ação `start-pane`).
- **RF-3.21** Painel `connecting` ou `reconnecting` de aba SSH: o app mostra que a conexão está em andamento. Painel `awaiting-desktop`: o app diz que a conexão **espera uma resposta no desktop** (senha, passphrase ou confirmação de chave do servidor), que não pode ser dada pelo celular.
- **RF-3.22** Painel `exited`: a grade final continua visível, com o código de saída; `disconnected`: a grade fica, com o aviso e a ação **Iniciar** quando o desktop a permitir.
- **RF-3.23** **Campainha** (`bell`) no painel visível dá uma vibração curta (se o sistema permitir e o usuário não desligou); em outro painel, só o indicador da árvore muda.

### Privacidade

- **RF-3.24** Grade, histórico e texto colado nunca vão para log, relatório de crash ou analytics, e o app não tem analytics no v1.

## Fora de escopo

- Seleção e cópia de texto da grade (primeira candidata para depois do v1).
- Mouse em TUIs, hyperlinks OSC 8, busca no scrollback.
- Mais de um painel na tela ao mesmo tempo.
- Redimensionar o terminal para o celular.

## Riscos

| Risco | Mitigação |
|---|---|
| Render de grade grande travar em Android intermediário | Spike do M1 com critério de aceite numérico ([ADR-0002](../adr/0002-render-da-grade-com-skia.md)) |
| Teclados de terceiros (SwiftKey, Gboard) mandarem texto de formas diferentes (autocorreção, previsão) | Campo de captura com autocorreção e previsão desligadas; teste nos teclados mais comuns no M3 |
| Rede lenta empilhar diffs | O controle de fluxo da spec já entrega só o estado mais recente; o app confirma rápido e nunca enfileira |
