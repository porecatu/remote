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
- **RF-3.26** Abrir uma aba no terminal do app a torna a **aba ativa** da janela dela no desktop, com a ação `activate-tab` ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)): o desktop passa a mostrar a mesma aba. O envio é automático (sem item de menu nem opção), **uma vez por abertura**, no primeiro momento em que a sessão está pronta com a aba na árvore, e só quando ela ainda não é a ativa da janela; trocar de painel no seletor não manda de novo. A falha é **silenciosa**: nenhum aviso e nenhum indicador de pendência. O app **nunca** muda o painel focado da aba nem a janela do sistema operacional.

  > **Decidido pelo dono em 2026-11-17** (especificação 0.4). Implementado em `src/controllers/terminalSession.ts` (`activateOnce`), `src/session/actions.ts` (`activateTab`, e `isBackgroundAction`, que marca a ação como de fundo) e `src/session/requests.ts` (falha ou perda de ação de fundo não vira aviso).
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
- **RF-3.12** Enquanto o usuário está no histórico, a grade viva continua sendo atualizada embaixo; o app corrige o deslocamento quando o `history` cresce, para o texto que o usuário lê não "andar". Um item "Voltar ao fim" do menu da aba (`ellipsis-vertical`) leva ao fundo; fica esmaecido enquanto o usuário já está nele.
- **RF-3.13** Na tela alternativa (`alt = true`, TUIs como `vim`, `htop`), não há histórico, e o gesto de rolar vertical vira rolagem da grade quando ela é mais alta que a tela.

### Input

- **RF-3.14** Tocar na grade abre o teclado do sistema. O texto digitado (inclusive acentos, composição de IME e ditado) vai como `text-input` (nome da mensagem na spec).
- **RF-3.15** Acima do teclado, uma **barra de teclas especiais** numa linha só, toda rolável na horizontal: `Esc`, `Tab`, `Shift`, `Ctrl`, `Alt`, as setas, `Home`/`End`, `PgUp`/`PgDn`, `Colar` e `F1`–`F12` (sempre à mão, sem tecla que as abra). As teclas nomeadas vão como `key` com o `named-key` da spec.
- **RF-3.16** `Shift`, `Ctrl` e `Alt` são **modificadores com trava**: um toque vale para a próxima tecla, dois toques travam até um terceiro. Enquanto um está ligado (armado ou travado), a barra o **fixa à esquerda**, em destaque, e um toque nessa tecla fixada o desliga na hora. `Ctrl` + uma letra do teclado do sistema vai como `key { key: "c", mods: Ctrl }`, não como texto; `Shift` + uma letra vai como `key` com a letra em maiúscula e `mods: Shift`.
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

## Implementação (2026-11-17)

A tela segue a [anatomia](../design/proposta-de-anatomia.md) §4.6 a §4.11. Implementada e coberta por testes automatizados em Node; **nada foi rodado num aparelho**. A grade é desenhada com Skia como o [ADR-0002](../adr/0002-render-da-grade-com-skia.md) propõe, e ele continua **Proposto** até a medição em aparelho; nenhum requisito está verificado no sentido do [roadmap](../roadmap.md).

| Requisitos | Onde |
|---|---|
| RF-3.1 a RF-3.3, RF-3.26 | rota `app/desktop/[id]/tab/[tab].tsx`; `ui/screens/terminal/` (`TerminalScreen`, `useTerminalSession`); controlador `src/controllers/terminalSession.ts` sobre `src/session/subscription.ts` |
| RF-3.4, RF-3.5 | grade em `ui/terminal/grid/` (motor em `gridEngine.ts`, uma gravação por linha, box-drawing e blocos como formas em `boxDrawing.ts`), cores de `src/grid/colorMath.ts`, fonte de `ui/theme/fonts.ts` |
| RF-3.6 a RF-3.13 | contas de zoom, rolagem, cursor e histórico em `src/terminal/viewport.ts`; gestos em `ui/terminal/grid/useGridGestures.ts`; `ui/terminal/ZoomChip.tsx`; os itens "Caber a largura", "Seguir o cursor" e "Voltar ao fim" no menu da aba (`ui/sheets/menus/TabMenuSheet.tsx`) |
| RF-3.14 a RF-3.19, RF-3.25 | campo de captura `ui/terminal/CaptureInput.tsx`; barra de teclas `ui/terminal/KeyBar.tsx` e `KeyBarKey.tsx`; colar em `ui/terminal/PasteDialog.tsx`; envio em `src/input/` |
| RF-3.20 a RF-3.23 | `ui/terminal/PaneStateCard.tsx` e `TerminalBar.tsx` |
| RF-3.24 | regra de todas as camadas: nenhum log de conteúdo (`src/log.ts`) |

Decisões tomadas na implementação:

- **Botão "Caber a largura" (RF-3.7).** Aparece quando o zoom não é o de caber e aplica caber a largura, mesmo numa grade larga, que abre na leitura de 12 pt: o rótulo do botão vence o "volta ao padrão" da anatomia. O chip de zoom mede 100% no caber. Grade estreita, cujo caber passaria de 24 pt, fica em 24 pt. *Padrão do orquestrador, a confirmar com o dono.*
- **Redimensionamento (RF-3.10).** O zoom guarda a mesma razão sobre o caber anterior (`rescaleOnResize`).
- **`Esc` da barra (RF-3.16)** sai sem modificadores e mantém o armado para a próxima tecla (anatomia §4.8: "`Esc` e `Fn` não consomem o armado"), por `pressNamed(pane, key, { keepModifiers })` em `src/input/send.ts`. *Padrão do orquestrador, a confirmar com o dono.*
- **Quebra de linha vinda do teclado (RF-3.14, RF-3.17).** Digitação nunca traz quebra de linha (o Enter chega pelo envio do campo); texto do campo de captura com quebra veio de uma colagem pela faixa do próprio teclado (Gboard, iOS) e vai pelo fluxo de **colar**, com confirmação, não como `text-input`.
- **Colar (RF-3.17).** Na prévia, o tab aparece como espaço (não `^I`) e o C1 aparece como o escape de 7 bits que ele representa; o rodapé mostra só "M caracteres" quando nenhuma linha ficou de fora; erro ao ler a área de transferência conta como vazia.
- **Estados (RF-3.18, RF-3.20 a RF-3.22).** Fora de `ready`, a grade fica a 60% e em somente leitura (a anatomia só fixava isso para a árvore). Durante a reconexão o seletor de painéis continua aberto ao toque, e o menu da aba fica bloqueado.
- **Campainha (RF-3.23).** O `bell` da barra acende e esmaece linear em 2 s, sem cadência de piscar (com reduzir movimento, aceso fixo por 2 s); a vibração usa o háptico de notificação de aviso. "Vibrar na campainha" aparece sempre em Configurações: os serviços não sabem se o aparelho vibra.
- **Paisagem** imersiva esconde a barra de status do sistema.
- **Aba que some (RF-2.11)**, inclusive quando o Porecatu reinicia: a tela volta à árvore com o aviso "A aba foi fechada no desktop.".

Ficam para o aparelho: desempenho da grade 200×60, alinhamento da fonte e fallback de emoji e CJK, sensação dos gestos, barra de teclas grudada no teclado, teclado físico, IME e aspas inteligentes do iOS, colar pela faixa do Gboard e o "Permitir colar" do iOS, `FLAG_SECURE`, vibração, paisagem, pilha restaurada no terminal e leitor de tela ([roadmap](../roadmap.md)).

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
