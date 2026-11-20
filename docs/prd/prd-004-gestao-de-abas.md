# PRD-004 — Gestão de abas

**Status:** Aprovado
**Data:** 2026-11-15
**Relacionados:** [PRD-000](prd-000-visao-de-produto.md), [PRD-002](prd-002-navegacao-do-workspace.md), [PRD-003](prd-003-terminal.md), [mensagens §7](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)

## Problema

Acompanhar não basta: o usuário quer **abrir uma aba** para rodar um comando, **fechar** a que terminou e **arrumar** o workspace — tirar a aba do grupo errado, mandar um grupo para a outra janela — sem esperar voltar ao computador. Cada uma dessas ações já existe no desktop, com regras próprias (onde a aba nova nasce, quando fechar pede confirmação). O app não inventa regra: pede, e o desktop executa pelo caminho do gesto local.

## O que já existe e não muda

- Toda ação é um `action` com `request-id`, respondido por `action-result` (sucesso, com `created` quando cria algo, ou `error-code`).
- As ações seguem o **gesto local por inteiro, inclusive a ativação de aba** ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)): `new-tab` deixa a aba criada ativa na janela dela, como o `tab.new`; expandir um grupo no desktop ativa o que o desktop ativa ao expandir; mover uma aba ou um grupo para outra janela o deixa ativo na janela de destino; `start-pane` deixa ativa a aba do painel. O desktop **nunca** levanta nem dá foco a uma janela do sistema operacional por causa de uma ação remota, e o painel focado de uma aba não muda.
- Fechar com processo em primeiro plano ou com conexão SSH aberta gera `confirm-request` **para o celular que pediu**, respondido com `confirm`; sem resposta em 60 s, a ação expira. Fechar uma **aba fixada** (por `close-tab`, ou por `close-pane` no último painel dela) **sempre** gera `confirm-request` e a desafixa; uma fixada sem nada vivo chega com `kind = running-process` e a lista de processos vazia.

  > **Revisão (2026-11-17, especificação 0.4):** a versão aprovada dizia que o desktop não muda o foco por causa de uma ação remota e que a aba criada pelo celular nascia sem roubar o foco. A decisão do dono de 2026-11-17 e o ADR-0010 do protocolo a substituem; a confirmação da fixada é uma correção de texto da mesma especificação.

  > **Revisão (2026-11-20, especificação 0.5, implementada no mesmo dia):** o dono desfez a decisão de 2026-11-17 ([ADR-0011 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0011-cliente-nao-muda-a-aba-ativa-e-view-tab.md), [ADR-0012](../adr/0012-abrir-aba-nao-muda-o-desktop.md)). O app **nunca** muda a aba ativa do desktop: `activate-tab` saiu do protocolo e as ações não ativam mais. Ao exibir uma aba no terminal, o app manda `view-tab`, e o desktop só marca a aba como vista na barra, sem mudar nada. `new-tab` cria a aba sem ativar, expandir grupo e mover para janela não ativam, e `start-pane` não ativa a aba do painel; só a remoção da aba ativa (fechar, mover, colapsar o grupo dela) a move, pela regra do desktop. A confirmação da fixada continua.
- O app atualiza a árvore pelo `workspace` que vem depois da ação, **não** por conta própria: o resultado visível é sempre o estado do desktop.

## Requisitos

### Abas

- **RF-4.1** **Nova aba**: a partir de uma janela ou de um grupo, o usuário escolhe o **perfil** (lista de `profiles`, com o padrão marcado e no topo) e confirma. Sem grupo, a aba nasce onde o `tab.new` do desktop a criaria; com grupo, no fim dele. Criada, o app abre a aba nova no terminal (pelo `created`); no desktop ela já nasce ativa na janela dela, como no `tab.new`.
- **RF-4.2** **Fechar aba** e **fechar painel**: pedem a ação direto. Se vier `confirm-request`, o app mostra um diálogo com o motivo (processo rodando ou conexão SSH aberta) e a lista de processos, com **Fechar** e **Cancelar**; a resposta vai como `confirm`. Em aba fixada (ou num painel dela), o diálogo traz também a nota de que a aba será desafixada no computador; fixada sem processos vivos mostra só a nota. O diálogo some sozinho ao expirar, com o aviso de que nada foi fechado.
- **RF-4.3** **Renomear aba**: campo com o título atual; salvar manda `rename-tab` com o título, e **Restaurar título automático** manda `null` (só aparece quando `custom = true`).
- **RF-4.4** **Mover para grupo**: lista os grupos da mesma janela e "Sem grupo"; manda `move-tab-to-group`.
- **RF-4.5** **Mover para janela**: lista as outras janelas do desktop (identificadas pela aba ativa de cada uma, como o "Mover para janela…" do desktop); manda `move-tab-to-window`. Não há "janela nova" no v1.
- **RF-4.6** As ações de aba ficam num **menu da aba**, aberto por toque longo na árvore e por um botão na tela do terminal. Abas fixadas mostram só **Fechar** e **Renomear**; fixar e desafixar não existem no v1. Fechar uma fixada **não tem confirmação própria do app**: o desktop sempre pede a confirmação, e o diálogo dela (RF-4.2) avisa da desafixação.

  > **Revisão (2026-11-17, especificação 0.4):** a [anatomia](../design/proposta-de-anatomia.md) aprovada previa um diálogo do app antes de fechar uma fixada (§7, item 6), porque a spec não descrevia a desafixação. A especificação 0.4 passou a dizer que fechar uma fixada sempre pede `confirm-request` e a desafixa; o dono decidiu tirar o diálogo próprio e pôr a nota no diálogo do desktop (chave `confirm_close.pinned_note`). Implementado em `ui/session/ConfirmCloseDialog.tsx` e `ui/sheets/menus/TabMenuSheet.tsx`.

### Grupos

- **RF-4.7** **Novo grupo**: a partir do menu de uma aba ("Novo grupo com esta aba"), com nome e cor escolhida da paleta `group_colors` do `theme`; manda `new-group`.
- **RF-4.8** No menu de um grupo: **Renomear** (`rename-group`), **Cor** (`set-group-color`, mesma paleta), **Colapsar/Expandir no desktop** (`collapse-group`), **Mover para janela** (`move-group-to-window`) e **Desfazer grupo** (`ungroup`, com confirmação no app porque o gesto é difícil de reverter).

### Sessões salvas

> **Acrescentado em 2026-11-20** (especificação 0.6 do protocolo, [ADR-0012 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0012-sessoes-nomeadas-pelo-cliente.md); no desktop, [ADR-0113](https://github.com/porecatu/terminal/blob/main/docs/adr/0113-restaurar-sessao-nomeada-pelo-celular.md)). **Implementado em 2026-11-20**, verificado só por teste automatizado em Node. O dono decidiu quatro coisas: o destino segue a preferência do desktop; a janela nova nasce sem foco; nada é ativado nem fechado; e o app só lista e restaura, sem salvar nem excluir. A anatomia da folha está na [§4.12.10](../design/proposta-de-anatomia.md), aprovada pelo dono em 2026-11-20.

- **RF-4.12** **Sessões salvas**: um botão na barra do workspace, ao lado da busca, abre a folha "Sessões salvas". A folha pede a lista ao desktop (`list-sessions`) **cada vez que abre** e mostra as sessões na ordem do desktop, a salva mais recentemente primeiro. O app não guarda a lista entre aberturas nem entre sessões: o `session-id` só vale com o mesmo `host_instance`.
- **RF-4.13** Enquanto a resposta não chega, a folha mostra um indicador de carregamento. Sem resposta em 10 s, mostra uma falha com **Tentar de novo**. Lista vazia é um estado próprio ("Nenhuma sessão salva no desktop"), não erro. Uma sessão com `readable: false` aparece esmaecida, com a nota de que não pode ser restaurada, e não aceita toque.
- **RF-4.14** **Restaurar** é o toque numa sessão. O que acontece depende de `sessions.mode`, que a folha também mostra numa linha de contexto:
  - **`new-window`**: o app manda `restore-session { session }` na hora. O desktop abre uma janela nova, que não toma o foco do computador.
  - **`append`**: a folha passa a um segundo passo, "Em qual janela?", com **todas** as janelas do desktop, identificadas como no "Mover para janela" (título da aba ativa e contagem de abas). Escolhida a janela, o app manda `restore-session { session, window }`. O desktop acrescenta os grupos e as abas da sessão ao fim dela.

  Nos dois casos o desktop não ativa aba nenhuma e não fecha nada. O app **não** abre nada no terminal depois: o resultado aparece na árvore pelo `workspace`.
- **RF-4.15** Depois do toque, a linha mostra a pendência (RF-4.9) até o `action-result`, e as outras linhas ficam desabilitadas. Com sucesso, a folha fecha. Com erro, a folha fecha e o aviso do catálogo aparece (RF-4.10), com dois códigos novos:
  - `unknown-session`: a sessão não existe mais no desktop. O aviso sugere abrir a lista de novo;
  - `session-unreadable`: o desktop não conseguiu ler a sessão.

  Um `invalid-argument` em resposta a um `restore-session` sem janela significa que a preferência mudou no desktop depois da lista. O aviso é o genérico, e a próxima abertura da folha já traz o `mode` novo.
- **RF-4.16** **Salvar** a janela como sessão e **excluir** uma sessão salva **não** existem no app: são gestos só do desktop.

### Resultado e erros

- **RF-4.9** Enquanto a ação não tem `action-result`, o item afetado mostra um indicador de pendência e não aceita outra ação.
- **RF-4.10** Erros viram mensagens do catálogo pelo código: `unknown-*` ("isso não existe mais no desktop", e a árvore é atualizada), `busy` ("o desktop está com um diálogo aberto; tente de novo"), `confirm-timeout`, `cancelled` (sem mensagem: o próprio usuário cancelou), `unknown-profile`, `invalid-argument` e `unsupported` (mensagem genérica com o código, para relatório).
- **RF-4.11** **Última aba**: fechar a última aba da última janela do desktop (por **Fechar aba**, ou por **Fechar painel** no último painel dela) é recusado pelo desktop com `last-tab` ([mensagens §7 e §9](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)), porque encerraria o Porecatu. O app mostra a mensagem do catálogo para esse código (a aba é a última do desktop e não pode ser fechada), não fecha nada e não trata a árvore como desatualizada. Como todo resultado de ação, a recusa chega em `action-result`, e o item deixa de estar pendente. Implementado: o código tem a chave `error.last-tab` nos dois idiomas (`src/i18n/protocolMessages.ts`) e é classificado como falha visível, sem `staleTree`, em `src/session/requests.ts`.

## Implementação (2026-11-17)

As folhas, os menus e o diálogo seguem a [anatomia](../design/proposta-de-anatomia.md) §4.12 a §4.14. Implementados e cobertos por testes automatizados em Node; **nada foi rodado num aparelho**, e nenhum requisito está verificado no sentido do [roadmap](../roadmap.md).

| Requisitos | Onde |
|---|---|
| RF-4.1 | `ui/sheets/NewTabSheet.tsx`; a abertura da aba criada em `ui/session/SessionOverlays.tsx` |
| RF-4.2 | `ui/session/ConfirmCloseDialog.tsx` e `ui/session/SessionOverlays.tsx`, sobre `src/session/confirm.ts` |
| RF-4.3 a RF-4.5, RF-4.7, RF-4.8 (formulários) | `ui/sheets/forms/` (`RenameTabSheet`, `RenameGroupSheet`, `MoveTabToGroupSheet`, `MoveToWindowSheet`, `NewGroupSheet`, `GroupColorSheet`) |
| RF-4.6, RF-4.8 (menus) | `ui/sheets/menus/` (`TabMenuSheet`, `GroupMenuSheet`), abertos pela árvore e pela barra do terminal (`ui/sheets/openers.ts`) |
| RF-4.9 | pendência por item em `src/session/requests.ts` (`targetsOf` em `src/session/actions.ts`); linhas a `opacity.pending` com spinner |
| RF-4.10, RF-4.11 | `ui/session/actionMessages.ts` sobre `src/i18n/protocolMessages.ts` |
| RF-4.12 a RF-4.16 (2026-11-20) | `ui/sheets/forms/SavedSessionsSheet.tsx`, aberta pelo `bookmark` de `ui/screens/workspace/WorkspaceScreen.tsx` (`openSavedSessionsFor` em `ui/sheets/openers.ts`), sobre `src/controllers/savedSessions.ts` e `restoreSession` em `src/session/actions.ts`; escolhas da implementação no §9.2 da anatomia |

Decisões tomadas na implementação:

- **Severidade dos avisos (RF-4.10):** falha de ação é erro; `confirm-timeout` é informação; ações perdidas na queda da sessão e aba nova que não aparece na árvore são aviso; as recusas antes do fio são informação (`busy`, outra ação em andamento), aviso (desktop não conectado) ou erro (falha de envio).
- **Ação recusada** mantém a folha aberta, com o aviso. Com uma ação pendente, os outros itens da mesma aba ou do mesmo grupo ficam desabilitados, sem nota.
- **Formulários:** nomes sem espaços nas pontas; a folha fecha sem enviar quando nada mudou; salvar um título igual ao automático o torna personalizado. "Mover para janela" mostra a nota de janela única se as outras janelas fecharem com a folha aberta.
- **Subtítulo do menu da aba:** "No grupo G · Janela N", "No grupo G", "Janela N" ou nenhum, conforme o grupo e o número de janelas; N é a posição em `workspace.windows`.
- **Aba fixada:** sem diálogo próprio (revisão do RF-4.6); a nota de desafixar fica no diálogo do desktop, a `dialog.gap` do motivo.
- **Desktop reiniciado:** as folhas e os diálogos da sessão fecham, porque os ids antigos mudam de sentido.
- **Ativação (especificação 0.4):** as ações não pedem `activate-tab`; quem ativa é o desktop, ao seguir o gesto local. O `activate-tab` que o terminal manda ao abrir a aba ([PRD-003](prd-003-terminal.md) RF-3.26) é uma ação de fundo: não marca pendência e não gera aviso.
  *Revisão (2026-11-20, especificação 0.5):* nenhuma ação ativa aba no desktop, e o `activate-tab` sai; o terminal manda `view-tab`, que não é ação ([ADR-0012](../adr/0012-abrir-aba-nao-muda-o-desktop.md)).

## Fora de escopo

- Fixar e desafixar, salvar e excluir sessões nomeadas, destacar aba numa janela nova, abrir janela vazia. (Restaurar uma sessão nomeada entrou em 2026-11-20, RF-4.12 a RF-4.16, e é o único jeito de o app fazer o desktop abrir uma janela.)
- Reordenar abas e grupos por arraste dentro da trilha.
- Seleção múltipla de abas.
- Mudar o painel focado de uma aba ou dar foco a uma janela do sistema do desktop. (A aba ativa mudou na especificação 0.4, pelas ações e ao abrir uma aba no terminal; desde a 0.5 volta a ficar fora: [ADR-0012](../adr/0012-abrir-aba-nao-muda-o-desktop.md).)

## Riscos

| Risco | Mitigação |
|---|---|
| Usuário fechar sem querer uma aba com trabalho no desktop | O desktop pede confirmação quando há processo; o app ainda não fecha nada por gesto de deslizar no v1 |
| Ação remota surpreender quem está no desktop | A ação faz o que o gesto local faria, e nada além: nunca levanta a janela do sistema nem muda o painel focado; desde a especificação 0.5 a ação também não troca a aba ativa ([ADR-0011 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0011-cliente-nao-muda-a-aba-ativa-e-view-tab.md)); a aba que o celular vê é marcada na barra do desktop; o indicador de celular conectado está visível no desktop |
