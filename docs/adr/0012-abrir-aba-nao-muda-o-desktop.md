# ADR-0012 — Abrir uma aba não muda o desktop; o app informa a aba que exibe (`view-tab`)

**Status:** Aceito em 2026-11-20 — implementado em 2026-11-20 (verificado por teste automatizado em Node; contra o Porecatu real e em aparelho, dívida no [roadmap](../roadmap.md))
**Data:** 2026-11-20
**Relacionados:** [PRD-000](../prd/prd-000-visao-de-produto.md), [PRD-002](../prd/prd-002-navegacao-do-workspace.md), [PRD-003](../prd/prd-003-terminal.md) RF-3.1 e RF-3.26, [PRD-004](../prd/prd-004-gestao-de-abas.md), [ADR-0004](0004-criptografia-em-js-puro.md), [anatomia](../design/proposta-de-anatomia.md) §4.6, §4.12 e §4.13; no protocolo, o [ADR-0011](https://github.com/porecatu/protocol/blob/main/docs/adr/0011-cliente-nao-muda-a-aba-ativa-e-view-tab.md) e a [§4.4 e §7 de 03 — Mensagens](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md); no Porecatu, o [ADR-0111](https://github.com/porecatu/terminal/blob/main/docs/adr/0111-o-celular-nao-muda-a-aba-ativa-do-desktop.md) e o [ADR-0112](https://github.com/porecatu/terminal/blob/main/docs/adr/0112-indicador-de-aba-vista-pelo-celular.md)

## Contexto

Desde a especificação 0.4 do protocolo, o app manda `activate-tab` sozinho ao abrir uma aba no terminal (`activateOnce` em `src/controllers/terminalSession.ts`, [PRD-003](../prd/prd-003-terminal.md) RF-3.26), e o desktop troca a aba ativa da janela. As ações pedidas pelo usuário (`new-tab`, expandir grupo, mover para janela, `start-pane`) também ativavam a aba no desktop, porque o host seguia o gesto local por inteiro.

O dono do produto desfez a decisão em 2026-11-20. Olhar uma aba no celular trocava a aba de quem estava no computador, e nenhuma ação remota volta a ativar aba. O protocolo foi para a **especificação 0.5** ([ADR-0011 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0011-cliente-nao-muda-a-aba-ativa-e-view-tab.md)):

- `activate-tab` saiu;
- as ações voltaram a não ativar;
- entrou a mensagem `view-tab`, pela qual o cliente diz ao host a aba que exibe.

O desktop usa essa informação para marcar a aba na barra ([ADR-0112 do Porecatu](https://github.com/porecatu/terminal/blob/main/docs/adr/0112-indicador-de-aba-vista-pelo-celular.md)), sem mudar nada.

## Decisão

**O app nunca muda a aba ativa do desktop. Ao exibir uma aba no terminal, ele manda `view-tab { tab }`, e ao deixar de exibi-la, `view-tab { tab: null }`.**

1. **Sai a ativação.**
   - Sai `activateOnce()` de `src/controllers/terminalSession.ts`, com as chamadas em `open()` e em `onSessionChange`.
   - Sai o construtor `activateTab` de `src/session/actions.ts`.
   - O app deixa de mandar `activate-tab`, que não existe mais no fio.
   - `isBackgroundAction`, `targetsOf` e o caminho `failure.silent` de `src/session/requests.ts` existiam só para essa ação. Saem junto, a menos que outra ação de fundo exista na hora da implementação, e então ficam sem o caso de `activate-tab`.
2. **`view-tab` no controlador do terminal.**
   - `open()` manda `view-tab { tab }` quando a sessão está `ready` e a aba está na árvore.
   - Manda de novo a **cada** `ready` depois de uma reconexão, porque o estado é da sessão e morre com ela.
   - `close()` manda `view-tab { tab: null }` antes do `unsubscribe` de tudo.
   - Trocar de painel no seletor (`selectPane()`) não manda nada, porque a aba é a mesma.
   - Ir para segundo plano não precisa de mensagem: o sistema derruba o WebSocket e a sessão termina. Se a sessão sobreviver ao segundo plano, o app **pode** mandar `null`, e a escolha fica para a implementação.
   - `view-tab` não é ação. Não tem `request-id`, não marca pendência nem gera aviso. Um `error { unknown-tab }` em resposta a ele é ignorado, porque a aba fechou e o `workspace` seguinte leva a tela ao estado de "aba fechada" que já existe.
3. **As ações não ativam.**
   - Depois de `new-tab`, o app continua abrindo a aba nova **no próprio terminal** (RF-4.1). No desktop ela nasce sem ativar, e o desktop a marca como vista quando o `view-tab` chega.
   - Expandir grupo, mover para janela e `start-pane` mudam o desktop só no que pedem.
   - A escada de foco por remoção da aba ativa continua sendo do desktop.
4. **A lista do workspace não muda.** O destaque da linha da aba (`bg.selected`, `TabRow.tsx`, `tab.active`) continua mostrando a aba **ativa no desktop**, que agora pode ser diferente da que o app acabou de abrir. A anatomia já o define assim ("aba ativa no desktop", §2).
5. **Protocolo.** O `vendor/porecatu-protocol-*.tgz` é regerado a partir do commit da 0.5, quando o pacote TypeScript a implementar. O app sobe junto com o host e o relay: o fio continua `[0, 1]` e não distingue a 0.4 da 0.5, então um app 0.5 diante de um host 0.4 passa no handshake e cai com erro de protocolo no primeiro `view-tab`.

> **Nota de implementação (2026-11-20).**
> - `activateOnce` deu lugar a `reportView` em `src/controllers/terminalSession.ts`, que manda o `view-tab` por `session.send` (já público; não houve método novo). A marca `viewReported` zera a cada saída do `ready`, e por isso o `view-tab` sai de novo depois de toda reconexão e nunca duas vezes na mesma sessão. `close()` manda `null` só se um `view-tab` com aba saiu naquela sessão e ela ainda está `ready`.
> - Saíram `activateTab`, `isBackgroundAction` e o caso de `targetsOf` (`src/session/actions.ts`), e o ramo de ação de fundo de `src/session/requests.ts`. O campo `failure.silent` **ficou**, porque também vale para `cancelled`.
> - **Segundo plano (item 2):** o `lifecycle.enterBackground` não derruba a sessão na hora: ele a mantém por `BACKGROUND_CLOSE_MS` (30 s) e só então a fecha com `goodbye`. O app **não** manda `null` ao ir para segundo plano (o item 2 o deixa opcional, e mandar exigiria o ciclo de vida conhecer a aba exibida): nesses 30 s o desktop continua marcando a aba, e a marca some quando a sessão fecha.
> - O desktop falso (`tools/fake-host/host.ts`) guarda o último `view-tab` por canal e responde `unknown-tab` a aba desconhecida, como a §4.4 da especificação; `ScenarioHost.viewedTabs()` o expõe aos testes.
> - O tarball `vendor/porecatu-protocol-0.1.0.tgz` foi regerado do commit `4ce7e4f` do protocolo, com o mesmo nome e versão.
> - `test/real-host/realHost.check.ts` passou a conferir que abrir a aba, `new-tab`, `move-tab-to-window` e `start-pane` **não** mudam o `active`; ainda não rodou contra um Porecatu 0.5.

## Alternativas consideradas

### Só parar de mandar `activate-tab` ao abrir

Mudaria só este repositório. Recusada pelo dono: o desktop continuaria ativando abas nas ações pedidas pelo celular, e ninguém no computador saberia em que aba o celular está.

### Manter um item "Mostrar no computador" no menu da aba

Seria um `activate-tab` explícito, a pedido. Recusada: a ação saiu do protocolo, e o indicador no desktop resolve o "onde o celular está" sem mudar a tela de ninguém.

## Consequências

### Positivas

- Abrir uma aba no app é só olhar: nada muda no computador.
- O app fica mais simples: sem ação de fundo e sem falha silenciosa.

### Negativas

- Quem volta ao computador não encontra ativa a aba em que trabalhou pelo celular. Ela está marcada na barra, mas é preciso clicar.
- O destaque "ativa no desktop" na lista pode não ser a aba que o usuário acabou de ver no app, e isso pode confundir no começo.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Esquecer o `view-tab` depois da reconexão, e o desktop parar de marcar a aba | Média | Baixo | Teste do controlador: `ready` → `view-tab`, queda, `ready` de novo → `view-tab` outra vez; e o `pnpm real-host` confere o ícone no desktop |
| `view-tab null` não sair ao fechar a tela (desmontagem abrupta) | Baixa | Baixo | O desktop limpa o estado no fim da sessão; teste de `close()` |
| App 0.5 com desktop 0.4 (o fio `[0, 1]` não os distingue) | Média | Médio | A sessão cai com erro de protocolo no primeiro `view-tab`, sem efeito no desktop; app, host e relay sobem juntos para o mesmo commit do protocolo |
