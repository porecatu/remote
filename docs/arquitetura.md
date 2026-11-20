# Arquitetura

Documento técnico central do app. Os ADRs justificam *por que* cada peça foi escolhida; este documento descreve *como* elas se encaixam. **Estado (2026-11-17):** a camada de lógica e as telas dos PRDs [001](prd/prd-001-desktops-e-pareamento.md) a [004](prd/prd-004-gestao-de-abas.md) estão implementadas e verificadas **só em Node** (`pnpm test`, com `jest-expo` e `@testing-library/react-native`); **nada foi rodado num aparelho**. As telas seguem a [anatomia das telas](design/proposta-de-anatomia.md), aprovada pelo dono em 2026-11-16, com as peças dos ADRs [0008](adr/0008-icones-lucide-em-svg.md) a [0011](adr/0011-folhas-dialogos-e-avisos-proprios.md) instaladas. A grade do terminal é desenhada com Skia, como o [ADR-0002](adr/0002-render-da-grade-com-skia.md) propõe, e o ADR continua Proposto até a medição em aparelho. O app segue a **especificação 0.4** do protocolo (fio `[0, 1]`). Onde o código diverge do escrito, há um bloco **Na implementação** dizendo o quê e por quê, como no Porecatu.

O protocolo é especificado fora daqui, no [porecatu/protocol](https://github.com/porecatu/protocol/blob/main/docs/especificacao/00-visao-geral.md); este documento cita as seções dele quando depende delas.

---

## 1. Camadas

```
+---------------------------------------------------------------------+
|  Telas (rotas finas em app/, componentes em ui/)                    |
|  lista de desktops · pareamento · workspace · terminal · folhas     |
+-------------------------------+-------------------------------------+
                                |  lê estado, chama ações
+-------------------------------v-------------------------------------+
|  Controladores (src/controllers/, zustand/vanilla, sem React)       |
|  appShell · desktops · settings · pairing · terminalSession ·       |
|  overlay                                                            |
+-------------------------------+-------------------------------------+
                                |  liga as peças de src/ ao store
+-------------------------------v-------------------------------------+
|  Stores de sessão (um por desktop aberto)                           |
|  conexão · workspace · profiles · theme · pedidos pendentes         |
|  +---------------------------------------------------------------+  |
|  |  Modelo da grade (um por assinatura)                          |  |
|  |  linhas + estilos · seq · cursor · alt · history · sujeira    |  |
|  +---------------------------------------------------------------+  |
+-------------------------------+-------------------------------------+
                                |  mensagens tipadas
+-------------------------------v-------------------------------------+
|  Cliente do protocolo — pacote @porecatu/protocol (JS puro)         |
|  envelope · Noise XX/IK · registros · CBOR · tipos das mensagens    |
+-------------------------------+-------------------------------------+
                                |  quadros binários (bytes opacos)
+-------------------------------v-------------------------------------+
|  Socket do relay — do app (src/net/relaySocket.ts)                  |
|  WebSocket do React Native · um envelope por quadro · close codes   |
+-------------------------------+-------------------------------------+
                                |  wss://
                         Porecatu Relay  ---->  Porecatu desktop

Ao lado, sem depender das camadas acima:
  Render da grade (Skia, ADR-0002) — lê o modelo da grade, desenha (ui/terminal/grid/)
  Armazenamento seguro (ADR-0003) — chave do aparelho, lista de desktops, configurações
  Catálogo de textos (ADR-0005)   — todo texto de interface
```

O **WebSocket é do app**, não do pacote: `src/net/relaySocket.ts` adapta o WebSocket do React Native (só quadros binários, quadro de texto recusado com 1003, códigos de fechamento mapeados para motivos tipados) e entrega bytes opacos ao `ClientSession` do pacote, que cuida de envelope, Noise e CBOR. O construtor do WebSocket é injetável, e os testes usam o relay em memória do kit de teste do pacote.

### Onde está cada parte no código

Lógica (`src/`, importada como `@/`):

| Pasta | O quê |
|---|---|
| `src/protocol/` | Único ponto de re-export do `@porecatu/protocol` (`index.ts`) e do kit de teste dele (`testing.ts`) |
| `src/net/` | Socket do relay, consulta de presença (`presence.ts`, a cada 30 s), o calendário de reconexão (`backoff.ts`) e os *handlers* trocáveis (`socketHandoff.ts`), com que o socket do pareamento passa ao ciclo da sessão (§2) |
| `src/session/` | Ciclo da conexão (`lifecycle.ts`), store por desktop (`sessionStore.ts`, `zustand/vanilla`), registro de stores abertos (`registry.ts`), assinaturas de grade (`subscription.ts`), ações e pedidos pendentes (`actions.ts`, `requests.ts`), confirmações (`confirm.ts`) |
| `src/controllers/` | Os controladores que as telas usam, cada um com um store `zustand/vanilla` e ações, sem React (tabela abaixo) |
| `src/terminal/` | `viewport.ts`: a matemática da vista do terminal — tamanho da fonte e zoom, "caber a largura", limites de rolagem, seguir o cursor, trava de eixo do arrasto, âncora da rolagem enquanto o histórico cresce e o zoom por aba (`ZoomMemory`, só em memória). As funções que os gestos chamam são *worklets* ([ADR-0010](adr/0010-gestos-animacao-e-teclado.md)); no Node, funções comuns |
| `src/workspace/` | Seletores da árvore, busca, disposição dos painéis em miniatura e expansão local de grupos |
| `src/grid/` | Modelo da grade, scrollback, resolução de cor e tabela do xterm |
| `src/input/` | Modificadores com trava, barra de teclas, colar e envio de input |
| `src/pairing/` | Fluxo de pareamento (máquina de estados pura) e *deep link* |
| `src/storage/` | Secure Store, lista de desktops, configurações e identidade do aparelho |
| `src/security/` | Bloqueio do app e o invólucro do `expo-local-authentication` |
| `src/i18n/`, `locales/` | Catálogo tipado, escolha de idioma, plural, tempo relativo (`relativeTime.ts`) e o mapa dos códigos do protocolo |
| `src/log.ts`, `src/polyfills.ts` | Logger único (só eventos) e a aleatoriedade instalada antes do pacote |
| `tools/fake-host/` | O desktop falso (§8) |
| `test/real-host/` | A verificação contra o Porecatu e o relay reais (`pnpm real-host`, §8), fora do `pnpm test` |
| `test/setup/` | Ambiente do Jest: `environment.js` (o do `jest-expo` mais o CanvasKit que o mock do Skia exige, pulado nas suítes de `src/`), `resolver.js` (o resolvedor do Reanimated antes do do `jest-expo`), `native.ts` (os mocks oficiais de Gesture Handler, Skia, Worklets e Keyboard Controller; o Reanimated roda de verdade, no build de Jest dele) e `reanimatedMatchers.d.ts` (os tipos de `toHaveAnimatedStyle`) |
| `assets/fonts/` | As duas faces da Iosevka Fixed e a licença, com a origem registrada no `README.md` ([ADR-0009](adr/0009-iosevka-fixed-embutida.md)) |

Controladores (`src/controllers/`):

| Arquivo | O quê |
|---|---|
| `appShell.ts` | O invólucro do app: bloqueio por biometria (com o pedido do sistema aberto sozinho na tela de bloqueio), cobertura do seletor de apps sempre que o app não está `active`, o *link* `porecatu://pair` retido enquanto o app está bloqueado e o sinal de primeiro e segundo plano para o registro de sessões |
| `desktops.ts` | A lista de desktops: leitura de `desktops.v1`, renomear e remover, presença só enquanto a lista está visível, abrir pelo registro e o estado de cada linha conforme a tentativa anda (`rowStatus`: erro antes de presença) |
| `settings.ts` | As configurações em memória, uma cópia só para o app inteiro, lidas uma vez de `settings.v1` e gravadas a cada mudança (a mudança aparece já e volta atrás se não puder ser gravada) |
| `pairing.ts` | Os efeitos do fluxo de pareamento (socket, prazos, gravação do desktop), o nome do aparelho do último pareamento e a entrega da sessão aberta ao registro (§2) |
| `terminalSession.ts` | Uma tela de terminal aberta: a assinatura do painel (`SubscriptionSet`), o input (`InputSender`, modificadores, colar), o histórico, a reassinatura depois da reconexão e o `activate-tab` da abertura (§2; desde a especificação 0.5, o `view-tab` da tela aberta, [ADR-0012](adr/0012-abrir-aba-nao-muda-o-desktop.md)) |
| `overlay.ts` | A pilha de folhas e diálogos e a fila de avisos do app inteiro ([ADR-0011](adr/0011-folhas-dialogos-e-avisos-proprios.md)), com dono (`app` ou `session:<desktopId>`) |

Telas (`ui/`, importada como `@ui/`):

| Pasta | O quê |
|---|---|
| `ui/theme/` | A fonte única dos valores visuais do chrome: tokens da anatomia §2 (`tokens.ts`, `colors.ts`, `typography.ts`), as faces mono por plataforma (`fonts.ts`) e o `ThemeProvider` (claro ou escuro do sistema e "reduzir movimento", ao vivo) |
| `ui/components/` | As primitivas visuais (`Button`, `IconButton`, `ListRow`, `ScreenBar`, `Banner`, `Card`, `Chip`, `Switch`, `Radio`, `TextField`, `StateView`, `Skeleton`, `Spinner`…) e o `Icon` ([ADR-0008](adr/0008-icones-lucide-em-svg.md)) |
| `ui/overlay/` | A camada de sobreposições ([ADR-0011](adr/0011-folhas-dialogos-e-avisos-proprios.md)): `OverlayProvider`, `OverlayHost`, `Sheet`, `Dialog` e `LiveDialog`, `Toast` e o `useOverlay` com que as telas abrem folhas e diálogos e mostram avisos |
| `ui/services/` | A raiz de composição: `createServices.ts` junta armazenamento, identidade, registro de sessões e controladores; `nativeServices.ts` passa os módulos nativos reais; `ServicesContext.tsx` entrega o conjunto às telas; `testing.tsx`, os falsos dos testes |
| `ui/hooks/` | `useStoreState`: liga um store `zustand/vanilla` ao React, re-renderizando só quando o valor selecionado muda |
| `ui/i18n/` | `LocaleProvider`, `useT` e `useLocale`: o idioma ao vivo, sem remontar a árvore |
| `ui/model/` | `tabState.ts`: o estado do painel como o chrome o mostra (palavras e chip), comum à árvore, à barra do terminal e ao seletor de painéis |
| `ui/root/` | A raiz: `AppRoot` (provedores e camadas), `LockScreen`, `PrivacyCover`, `DeepLinkBridge`, `useAppStateBridge` e `nativeIntent.ts` (§7) |
| `ui/screens/desktops/` | A lista de desktops, a linha, a folha da linha, renomear e remover |
| `ui/screens/pairing/` | O pareamento: o `PairingProvider` (um fluxo para a pilha inteira), permissão da câmera e câmera, nome do aparelho, espera e resultados, e a navegação entre eles |
| `ui/screens/settings/` | Configurações, Este aparelho, idioma e recriar identidade |
| `ui/screens/workspace/` | `DesktopSessionScope` (§2), o workspace, a lista da árvore, a busca, a faixa de conexão e a tela de entrada (conectando e falhas); `rows/` tem as linhas (janela, seção, grupo, aba, nova aba) |
| `ui/screens/terminal/` | A tela do terminal e o `useTerminalSession`, que dá ao controlador do terminal a vida do componente |
| `ui/sheets/` | Os menus da aba e do grupo (`menus/`), as folhas de formulário (`forms/`: renomear, mover, cor, novo grupo), a folha de nova aba, `openers.ts` (abre os menus já ligados aos formulários), `model.ts` e a sessão falsa dos testes (`testing.ts`) |
| `ui/session/` | As sobreposições da sessão (`SessionOverlays`): o diálogo de `confirm-request`, os avisos de ação (`actionMessages.ts`) e a aba criada pelo celular aberta no terminal |
| `ui/terminal/` | As peças do terminal: barra do terminal, barra de teclas (`KeyBar`, `KeyBarKey`, `useKeyRepeat`), campo de captura (`CaptureInput`), chip de zoom, seletor e miniatura de painéis, cartão de estado do painel e o diálogo de colar |
| `ui/terminal/grid/` | A grade em Skia (§4 e §6) |

Rotas (`app/`, `expo-router`):

| Rota | Arquivo | O que monta |
|---|---|---|
| — | `app/_layout.tsx` | A raiz: o polyfill primeiro, os serviços nativos (uma vez) e o `AppRoot` em volta do `Stack` (§7) |
| — | `app/+native-intent.tsx` | Reexporta `redirectSystemPath` de `ui/root/nativeIntent.ts`: URL do sistema nunca vira rota (§7) |
| `/` | `app/index.tsx` | Lista de desktops |
| `/settings` | `app/settings/index.tsx` | Configurações |
| `/settings/device` | `app/settings/device.tsx` | Este aparelho |
| `/pair` | `app/pair/_layout.tsx`, `app/pair/index.tsx` | A pilha do pareamento dentro do `PairingProvider`; permissão da câmera e câmera |
| `/pair/name` | `app/pair/name.tsx` | Nome do aparelho |
| `/pair/wait` | `app/pair/wait.tsx` | Aguardando a confirmação e os resultados |
| `/desktop/[id]` | `app/desktop/[id]/_layout.tsx`, `app/desktop/[id]/index.tsx` | A pilha do desktop dentro do `DesktopSessionScope`; o workspace. `[id]` é o id local do desktop em `desktops.v1` |
| `/desktop/[id]/tab/[tab]` | `app/desktop/[id]/tab/[tab].tsx` | O terminal da aba; `[tab]` é o `tab-id` do desktop, que só vale na sessão em que foi lido |

Tudo em `src/` é lógica pura ou com dependências injetadas (relógio, temporizador, socket, armazenamento, módulos nativos): nada ali desenha nem depende de React, e nada ali importa de `ui/`. O React e os módulos nativos de tela ficam em `ui/` e `app/`.

**Composição.** O store de sessão reúne o ciclo da conexão, os pedidos pendentes, as confirmações e a expansão local, e o registro cria um store por desktop aberto. As peças que antes eram testadas isoladamente estão ligadas pelos controladores: o `SubscriptionSet`, o `InputSender`, os modificadores e o colar pelo `terminalSession.ts`; o fluxo de pareamento pelo `pairing.ts`; o *deep link* e o bloqueio pelo `appShell.ts`; a consulta de presença pelo `desktops.ts`. Quem cria os controladores, o registro e a identidade é `ui/services/createServices.ts`, a raiz de composição, com os módulos nativos de `nativeServices.ts` (ou os falsos de `ui/services/testing.tsx` nos testes): o mesmo encadeamento nos dois casos.

Regras de dependência:

- **Telas não falam com o protocolo.** Elas leem os stores dos controladores e da sessão (`useStoreState`) e chamam ações (`sendAction` com os construtores de `src/session/actions.ts`, `typeText`, `pressKey`, `pasteRequest`...). Quem monta e manda mensagem é o store.
- **O protocolo não conhece React.** O pacote expõe uma sessão com eventos de mensagem tipada; o store é quem a assina.
- **O render da grade não conhece o protocolo**: lê o modelo da grade (linhas, estilos não resolvidos, cursor) e o `theme`, e desenha.
- **Nenhuma camada produz texto de interface** além das telas, pelo catálogo ([ADR-0005](adr/0005-catalogo-de-textos-e-idiomas.md)). Os stores guardam códigos (`error-code`, estado de conexão), nunca frases.

---

## 2. Sessão por desktop

Um **store de sessão** existe por desktop **aberto** (o que o usuário tocou na lista). Desktops da lista que não estão abertos não têm conexão nem store vivo ([PRD-001](prd/prd-001-desktops-e-pareamento.md) RF-1.13).

### Ciclo

```
idle -> connecting -> handshaking -> greeting -> ready
                                                   |
            reconnecting <-------------------------+ (queda sem goodbye)
                 |  1, 2, 4, 8, 16 s
                 +--> connecting ...    (esgotou -> failed)

ready -> closed         (goodbye, not-paired, incompatible, usuário saiu)
```

- `connecting`: abre `wss://<relay>/v0/client/<host_id>`; `host-unavailable` → `closed` com motivo **offline**.
- `handshaking`: `IK` (ou `XX` no pareamento) pelo pacote.
- `greeting`: manda `hello`; espera `welcome`, depois `theme`, `profiles` e `workspace` ([mensagens §2](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)). Só então `ready`.
- **Reconexão** refaz tudo do zero: novo handshake, novo `hello`, novo `workspace`, novas assinaturas com `grid-snapshot`. Nenhum estado da sessão anterior é reaproveitado, porque os ids podem ter mudado (o Porecatu pode ter reiniciado) e a grade certamente mudou.
- **Segundo plano**: ao ir para o segundo plano, o app fecha a sessão de forma limpa depois de 30 s (o sistema a derrubaria de qualquer jeito); ao voltar, reconecta e reabre a tela onde o usuário estava, se o `tab-id`/`pane-id` ainda existir no `workspace` novo.

> **Na implementação** (`src/session/lifecycle.ts`, `src/session/sessionStore.ts`), onde os documentos eram omissos:
>
> - **Queda antes do primeiro `ready`** desta abertura é `failed` (`unreachable`), **sem** nova tentativa automática: o usuário tenta de novo à mão ([PRD-001](prd/prd-001-desktops-e-pareamento.md) RF-1.14). Depois do primeiro `ready`, a queda segue o calendário 1, 2, 4, 8 e 16 s e termina em `failed` (`retries-exhausted`).
> - **`host-unavailable`** é `closed` (`offline`) na primeira conexão, e uma tentativa falha (que conta no calendário) quando o desktop já tinha sido alcançado: o relay responde isso enquanto o Porecatu reinicia.
> - O contador de tentativas volta a zero quando chega o `welcome`.
> - **`error { protocol }`** do desktop encerra a sessão de vez: falharia do mesmo jeito.
> - **Reconexão e `host_instance`**: durante a reconexão o store **mantém** o último `workspace` (o usuário não é tirado de onde está, RF-2.4) e a expansão local de grupos. Quando o `welcome` novo traz o **mesmo** `host_instance`, os ids continuam valendo; quando traz **outro** (o Porecatu reiniciou), o store descarta `workspace`, pedidos pendentes, confirmações e expansão local, porque os ids passaram a significar outras coisas. Por isso a tela só pode ser reaberta depois de reconectar se o `host_instance` for o mesmo **e** o id ainda existir. Assinaturas de grade não sobrevivem à reconexão: o `SubscriptionSet` tem `reset()` para isso, e quem o chama é o controlador do terminal (`src/controllers/terminalSession.ts`), que reassina o painel quando a sessão volta a `ready` com o mesmo `host_instance` e a aba ainda na árvore.
> - O prazo do segundo plano é `BACKGROUND_CLOSE_MS` (30 s), igual para todos os desktops abertos (`src/session/registry.ts`). Quem avisa o registro da troca de plano é o `appShell.ts`, pelo `AppState` do React Native (`ui/root/useAppStateBridge.ts`). A pilha de navegação continua montada no segundo plano, então "reabrir a tela" é a tela que ficou: ao voltar, o registro reconecta as sessões, inclusive por trás da tela de bloqueio, e o terminal reassina o painel.

> **Na implementação (2026-11-17), a sessão do pareamento** ([PRD-001](prd/prd-001-desktops-e-pareamento.md) RF-1.10, [handshake §3.2](https://github.com/porecatu/protocol/blob/main/docs/especificacao/02-handshake-e-pareamento.md) item 5): o canal `XX` que o pareamento abriu não é fechado; ele vira a sessão do desktop, e o `hello` vai nele.
>
> - O controlador de pareamento abre o socket com *handlers* trocáveis (`createSwitchableHandlers`, `src/net/socketHandoff.ts`). No mesmo turno em que o fluxo chega a `paired`, os eventos do socket passam a esperar numa fila, sem destino.
> - `SessionRegistry.openPaired(desktop, handover)` cria o store do desktop, ou reaproveita o que já está aberto para o mesmo destino (mesma chave e mesmo relay), e chama `SessionStore.startAdopted(handover)`, que chama `Lifecycle.adopt`.
> - `Lifecycle.adopt` fecha antes uma sessão viva do mesmo store (`closed`, `user`), vai direto a `greeting`, processa em ordem as mensagens que o pareamento recebeu depois de `pair-accepted` (`early`), manda o `hello` e só então aponta o socket para o ciclo; a fila é entregue em ordem dentro dessa troca.
> - A sessão adotada ainda não é um `ready`: queda antes do primeiro `ready` é `failed` (`unreachable`), como em qualquer primeira conexão, e uma sessão entregue já fechada termina do mesmo jeito. Novas tentativas abrem conexão nova, com `IK`.
> - Se o canal terminou antes de o desktop ser gravado (`sessionEnded`), o pareamento abre o desktop pelo caminho comum (`registry.open`).

> **Na implementação (2026-11-17), a sessão nas telas:** quem abre e fecha o store visto pelas telas do desktop é o `DesktopSessionScope` (`ui/screens/workspace/DesktopSessionScope.tsx`), montado por `app/desktop/[id]/_layout.tsx` em volta da pilha do workspace e do terminal.
>
> - Ele pega o store que a lista ou o pareamento já abriu (`registry.get`), ou abre o desktop ele mesmo quando a pilha chegou sem sessão (pilha restaurada), lendo a lista antes se ela ainda não foi lida; desktop desconhecido volta à lista.
> - Monta as sobreposições da sessão (`SessionOverlays`), donas `session:<desktopId>`.
> - Diz às telas se a sessão chegou a `ready` nesta visita: um fim antes disso é falha de entrada, mostrada pelo workspace numa tela de estado; depois disso, a árvore fica. Volta à lista com o motivo num aviso quando o desktop encerra a sessão (`goodbye`; `not-paired` depois que a árvore apareceu).
> - **Fecha a sessão pelo registro (`registry.close`) quando a pilha desmonta**, isto é, quando o usuário sai do desktop.

> **Na implementação (2026-11-17), a aba ativa e as ações de fundo:** o app segue a **especificação 0.4** do protocolo ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)), que acrescenta a ação `activate-tab`; o fio continua `[0, 1]`.
>
> - **Abrir uma aba no terminal do app torna-a a aba ativa da janela dela no desktop**: o desktop passa a mostrar a mesma aba. Quem manda o `activate-tab` é o controlador do terminal (`activateOnce` em `src/controllers/terminalSession.ts`), uma vez por abertura, no primeiro momento em que a sessão está `ready` com a aba na árvore, e nada quando ela já é a ativa. Não repete na reconexão nem ao trocar de painel, e não há item de menu nem opção para isso.
> - As ações do usuário seguem o gesto local também na ativação: `new-tab`, expandir um grupo e mover para janela ativam a aba no desktop.
> - O app **nunca** muda o painel focado do desktop nem traz a janela do sistema para a frente.
> - `activate-tab` é uma **ação de fundo** (`isBackgroundAction` em `src/session/actions.ts`): o app a manda sozinho, como efeito de navegar. Não marca item como pendente (`targetsOf` vazio) nem bloqueia outras ações da aba; a falha dela é silenciosa (`failure.silent` em `src/session/requests.ts`), e a perda numa queda também (`dropAll` não a conta entre as ações perdidas).

> **Decidido em 2026-11-20 (especificação 0.5, [ADR-0012](adr/0012-abrir-aba-nao-muda-o-desktop.md)), implementado no mesmo dia:** o bloco acima deixa de valer. O app **nunca** muda a aba ativa do desktop, e as ações não ativam. O controlador do terminal troca o `activateOnce` por `view-tab { tab }` a cada `ready` com a aba na árvore (inclusive depois de reconectar), e `close()` manda `view-tab { tab: null }` antes de cancelar as assinaturas. `view-tab` não é ação (sem `request-id`, sem pendência, sem aviso), e `isBackgroundAction` saiu, com o caso de `targetsOf` (não havia outra ação de fundo); `failure.silent` fica só para `cancelled`. O `view-tab` sai por `session.send` (`reportView` em `src/controllers/terminalSession.ts`, com a marca `viewReported` zerada a cada saída do `ready`). O desktop usa o `view-tab` só para marcar a aba na barra.

### O que o store guarda

| Dado | Origem | Vida |
|---|---|---|
| `workspace` (árvore inteira, `rev`) | Mensagem `workspace`, **substituída** a cada envio | Sessão |
| `profiles`, `theme` | Mensagens do início e de recarga | Sessão |
| Assinaturas e seus modelos de grade | `subscribe` → `grid-snapshot`/`grid-diff` | Enquanto a tela do painel está aberta |
| Pedidos pendentes (`request-id` → ação, confirmação aberta) | `action`, `confirm-request` | Até o `action-result` |
| Expansão local de grupos, zoom por aba | Gesto do usuário no app | Sessão do app (memória) |

O `workspace` não é mesclado: cada mensagem substitui a anterior inteira. As telas comparam por id para preservar rolagem e não re-renderizar o que não mudou (o store já entrega `workspaceDiff`, os ids que entraram e saíram desde a árvore anterior da mesma instância). **Nada do store é gravado em disco** — o que persiste é só a chave do aparelho, a lista de desktops e as configurações do app, no Secure Store ([ADR-0003](adr/0003-chaves-no-armazenamento-seguro.md)).

> **Na implementação:** as assinaturas e os modelos de grade não ficam no store de sessão, e sim no controlador do terminal, que existe enquanto a tela do terminal está aberta. O zoom por aba fica fora dos dois, numa `ZoomMemory` única do app (`src/terminal/viewport.ts`, instanciada em `ui/terminal/grid/TerminalGrid.tsx`), indexada por desktop, `host_instance` e `tab-id`, só em memória.

---

## 3. Modelo da grade

Um modelo por assinatura, alimentado pelo store, lido pelo render.

```
GridModel
  pane, seq                 a sequência da assinatura (§5.3 da spec)
  cols, rows                do desktop; o app nunca os muda
  lines[rows]               cada linha: wrapped + spans [col, width, styleRef, text]
  styles                    tabela de estilos referenciada pelas linhas
  cursor, alt, history
  dirty: Set<row>           linhas que mudaram desde o último quadro desenhado
  scrollback: páginas       linhas de histórico já recebidas, por offset
```

- **`grid-snapshot`** substitui tudo e marca todas as linhas sujas. É aceito a qualquer momento; o `seq` dele passa a ser o último, e a sequência **continua** a partir dele (snapshots e diffs dividem a mesma sequência da assinatura, que nunca reinicia — [§5.3](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)).
- **`grid-diff`** confere que já houve snapshot e que `seq == anterior + 1`, substitui as linhas listadas e marca só elas.

> **Na implementação** (`src/session/subscription.ts`): um `grid-diff` antes do snapshot, com `seq` fora de sequência ou malformado (assim como um snapshot malformado) é **erro de protocolo**, como manda a spec §5.3: o app manda `error { protocol }`, descarta todas as assinaturas e encerra a sessão, **sem** assinar de novo. A primeira redação deste item dizia "dessincronia → `subscribe` de novo", o que a spec proíbe; o [PRD-003](prd/prd-003-terminal.md) RF-3.2 tem a revisão. Mensagem de grade de um painel que não está assinado (atrasada, depois do `unsubscribe`) é descartada, sem erro.
- **Estilos**: cada mensagem traz a própria tabela; o modelo **interna** os estilos (mapa estilo → id estável no app) para que uma linha que não mudou continue com a mesma referência e o render possa reaproveitar a gravação dela.
- **`grid-ack`** é mandado **depois** de o modelo aplicar a mensagem. Sem ack, o desktop para de mandar a grade depois de duas mensagens ([§5.4](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)).
- **Coluna de cada caractere** sem segmentar grafemas: num span de code points simples, o *i*-ésimo code point fica em `col + i × width`; grafema composto vem sozinho num span.
- **Scrollback** é paginado sob demanda (`scrollback-request`, até 500 linhas); o modelo guarda as páginas por `offset` e corrige o deslocamento pela diferença de `history` entre respostas.

> **Na implementação** (`src/grid/gridModel.ts`, `src/grid/scrollback.ts`): o histórico **não** fica dentro do `GridModel`. Cada assinatura tem um `GridModel` (a tela viva) e um `Scrollback` (o cache do histórico), reunidos em `SubscriptionSet`. O cache é indexado pelo índice **absoluto** da linha, `dropped + (history − 1 − offset)`, e não pelo `offset`: assim a posição não anda quando saída nova empurra o histórico, nem com o histórico cheio (`history` constante e `dropped` crescendo); linha com índice abaixo do `dropped` atual saiu do desktop e sai do cache.

---

## 4. Render

Detalhado no [ADR-0002](adr/0002-render-da-grade-com-skia.md) (Proposto). Em resumo:

- Um `Canvas` do Skia por tela de terminal, **fora do reconciliador do React**: o modelo avisa o canvas por um valor compartilhado; diff não causa re-render de componente.
- Uma gravação por linha, refeita só para as linhas `dirty`; zoom e rolagem são transformação do canvas.
- Cores resolvidas no desenho, com o `theme`: padrão → `fg`/`bg`; indexada 0–15 → `palette`; 16–255 → tabela do xterm; direta → como veio.

> **Na implementação (2026-11-17):** a grade está em `ui/terminal/grid/`, como o ADR-0002 propõe; o ADR continua **Proposto** até a medição em aparelho (a nota de implementação dele lista o que falta medir). O render fica isolado ali, para poder ser trocado sem mexer na tela do terminal.
>
> - `TerminalGrid.tsx` monta o canvas, os gestos (`useGridGestures.ts`), as barras de rolagem e o elemento de acessibilidade. O React o renderiza por layout, tema, fonte e os poucos estados que a tela mostra; um `grid-diff` **não** o re-renderiza.
> - `GridCanvas.tsx` é o canvas: o fundo do tema, um `Picture` com o quadro das linhas e outro com a camada do cursor, sob uma transformação (rolagem e escala) lida de valor compartilhado.
> - `gridEngine.ts`, na thread de JS e sem React nem Skia próprios, segue o controlador do terminal e mantém coerentes zoom, rolagem e forma do conteúdo; pede o histórico perto da vista (uma tela à frente) e entrega as gravações novas por valor compartilhado.
> - `gridRenderer.ts` compõe o quadro com as linhas de uma janela em volta da vista; cada linha sai de `lineCache.ts`, que guarda a gravação enquanto o objeto da linha é o mesmo (o modelo troca o objeto de toda linha que um diff toca: identidade é sujeira). Linha de histórico ainda não recebida fica em branco até a página chegar.
> - `lineRecording.ts` transforma uma linha em operações de desenho puras (`drawOps.ts`), testáveis em Node; `skiaPainter.ts` as grava num `SkPicture`, glifo a glifo na coluna de cada célula, na escala de 12 pt (a transformação aplica o zoom). Negrito usa a face 500 e itálico é inclinado.
> - Box-drawing e blocos são formas (`boxDrawing.ts`), não glifos. Code point sem glifo na Iosevka cai nas fontes do sistema dentro de uma célula, centralizado e reduzido para caber.
> - A resolução de cor está em `src/grid/colorMath.ts` e `src/grid/xtermPalette.ts`: as regras acima, mais o efeito das marcas de estilo na ordem `inverse` → `dim` (frente misturada ao fundo com fator 0,66, decidido pelo dono em 2026-11-16) → `hidden` (frente = fundo).
> - A acessibilidade mínima (`gridA11y.ts`) é um elemento sobre o canvas que resume as últimas linhas não vazias da grade viva, calculado só com leitor de tela ligado e no máximo a cada 2 s.

---

## 5. Input

```
teclado do sistema --(texto, IME)--------------------> text-input { pane, text }
barra de teclas especiais --(Esc, setas, F1-F12...)---> key        { pane, named-key, mods }
Ctrl/Alt travados + letra -----------------------------> key        { pane, "c", Ctrl }
colar ---(confirmação se houver quebra de linha)-----> paste      { pane, text }
```

- O app **não codifica bytes de terminal**: manda input semântico, e o desktop o codifica com o mesmo codificador do teclado local ([mensagens §6](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)).
- O teclado é capturado por um campo de texto invisível com autocorreção, previsão e capitalização desligadas; cada mudança vira `text`, e o campo é esvaziado. `Backspace` do teclado virtual vira `key { backspace }`.
- Input só sai para painel `running` e assinado.

> **Na implementação** (`src/input/`): `send.ts` recusa antes do fio o input para painel não assinado ou que não está `running`, texto vazio, texto com surrogate solto e texto acima de **1 MiB** em UTF-8 (`MAX_INPUT_TEXT_BYTES`, decidido pelo dono em 2026-11-16). Com um modificador armado, um único caractere digitado vira `key` com os modificadores, e não `text-input`. `paste.ts` pede confirmação sempre que o texto tem quebra de linha e prepara a prévia de 5 linhas × 120 caracteres (decidido pelo dono em 2026-11-16). `modifiers.ts` é a trava dos modificadores (`Ctrl`, `Alt`, `Shift`, `Meta`: um toque arma, dois travam, o terceiro desliga), e `keyBar.ts` mapeia os botões da barra para os `named-key` do pacote.

> **Na implementação (2026-11-17), nas telas:** o controlador do terminal (`src/controllers/terminalSession.ts`) liga o `InputSender`, os modificadores e o colar ao painel na tela, e cada recusa vira um evento `input-refused` com o código, que a tela explica pelo catálogo. O campo de captura é `ui/terminal/CaptureInput.tsx` (também desligado de preenchimento automático): o `Enter` chega por `onSubmitEditing` e o `Backspace` por `onKeyPress`, ambos como tecla; o campo não abre o teclado quando o painel não recebe input. A barra de teclas é `ui/terminal/KeyBar.tsx`: uma linha só, toda rolável, na ordem de `KEY_BAR_LAYOUT` (`src/input/keyBar.ts`), com a repetição das setas em `useKeyRepeat.ts`. As opções de vista da grade (caber a largura, seguir o cursor, voltar ao fim) são itens do menu da aba, que recebe uma cópia do estado da grade ao abrir (`TerminalViewOptions`). Duas decisões do orquestrador, a confirmar com o dono:
>
> - **`Esc` não consome o armado** (anatomia §4.8, "`Esc` não consome o armado"): o `Esc` da barra sai **sem** modificadores e deixa os armados para a próxima tecla, por `pressNamed(pane, key, { keepModifiers: true })` em `src/input/send.ts`.
> - **Colagem pelo teclado vira colar**: texto que chega do campo de captura com quebra de linha (`\r` ou `\n`) veio da área de transferência do próprio teclado (Gboard, iOS), porque a digitação nunca traz quebra de linha. A tela do terminal o manda pelo fluxo de colar (`pasteRequest`, com a confirmação), e não como `text-input`.

---

## 6. Threads

| Onde | O quê |
|---|---|
| **Thread de JS** (Hermes) | WebSocket, Noise e CBOR (pacote em JS puro), stores, modelo da grade, React; na grade, o `gridEngine.ts` e a gravação das linhas e do quadro (`ui/terminal/grid/`) |
| **Thread de UI** (nativa) | Gestos (pinça, rolagem) via Reanimated/Gesture Handler, sem passar pela thread de JS; acompanhamento do teclado pelo Keyboard Controller ([ADR-0010](adr/0010-gestos-animacao-e-teclado.md)) |
| **Thread de render do Skia** | Desenho do canvas a partir das gravações por linha |

A regra que importa: **gesto não espera a thread de JS**. Zoom e rolagem mexem num valor compartilhado lido pelo Skia; uma rajada de diffs ocupando a thread de JS não trava a rolagem. O orçamento da thread de JS (decifrar, decodificar e aplicar até 30 diffs/s) é medido no spike do M1.

> **Na implementação (2026-11-17):** a grade Skia de `ui/terminal/grid/` segue essa divisão. `useGridGestures.ts` reconhece pinça, arrasto com trava de eixo e toque na thread de UI e mexe nos valores compartilhados de zoom e rolagem, chamando só as funções *worklet* de `src/terminal/viewport.ts`; a inércia do arrasto (`withDecay`) também roda lá e continua mesmo com "reduzir movimento", porque prolonga o movimento do dedo e não é transição. A thread de JS só fica sabendo do resultado (o percentual para o chip de zoom, o fim do gesto). As gravações (`SkPicture`) feitas na thread de JS chegam ao canvas por valor compartilhado. Nada disso foi medido: o orçamento acima e a passagem das gravações entre threads ficam para a medição em aparelho do [ADR-0002](adr/0002-render-da-grade-com-skia.md).

---

## 7. Mapa de telas

```
Bloqueio (biometria) --> Lista de desktops --+--> Parear (câmera) --> Nome do aparelho --> Aguardando confirmação
                              |              |                                                    |
                              |              +--> Configurações --> Este aparelho (impressão digital)  v
                              v                                                             Workspace
                         Workspace  <-------------------------------------------------------------+
                         (janelas -> fixadas, grupos, abas; busca)
                              |
                              +--> Menu da aba / Menu do grupo --> Nova aba (perfil) · Renomear · Mover · Cor ...
                              v
                         Terminal (grade, zoom, histórico, barra de teclas, seletor de painel)
                              |
                              +--> Confirmação de fechamento (confirm-request)
```

*Deep link* `porecatu://pair?...` entra direto em "Nome do aparelho", depois do desbloqueio.

A anatomia de cada tela, com os passos intermediários (permissão da câmera, conectando, resultado do pareamento), está na [anatomia das telas](design/proposta-de-anatomia.md) §3 e §4. "Este aparelho" fica dentro de Configurações por decisão do dono de 2026-11-16 (anatomia §7, item 8). Menus, escolhas e confirmações são folhas e diálogos de uma camada própria, não telas da pilha ([ADR-0011](adr/0011-folhas-dialogos-e-avisos-proprios.md)).

### Rotas e montagem

As rotas estão na tabela do §1.

- **Rotas finas.** Cada arquivo de `app/` só monta uma tela de `ui/screens/<tela>/` (e, nos `_layout.tsx`, o escopo da pilha); nenhuma lógica mora em `app/`. A pilha do pareamento vive dentro do `PairingProvider` (um fluxo para câmera, nome e espera, descartado quando a pilha sai), e a do desktop dentro do `DesktopSessionScope` (§2).
- **Provedores**, de fora para dentro, em `ui/root/AppRoot.tsx`: `GestureHandlerRootView` → `SafeAreaProvider` → `KeyboardProvider` → `ServicesProvider` → `LocaleProvider` → `ThemeProvider` → `OverlayProvider` → as camadas. O `app/_layout.tsx` importa `src/polyfills.ts` antes de tudo e cria os serviços nativos uma vez.
- **Camadas**, de baixo para cima, na mesma janela nativa e sem `Modal` ([ADR-0011](adr/0011-folhas-dialogos-e-avisos-proprios.md)): navegador (o `Stack`) → sobreposições (`OverlayHost`: folhas e diálogos, e os avisos por cima deles) → tela de bloqueio (enquanto bloqueado) → cobertura de privacidade (enquanto o app não está `active`; sempre a de cima). Com a tela de bloqueio ou a cobertura à vista, tudo abaixo sai da árvore do leitor de tela.
- **A navegação só monta depois do primeiro desbloqueio** (ou logo, com o bloqueio desligado ou indisponível): antes disso não existe lista nem consulta de presença, e a tela é só o fundo `bg.base` enquanto os serviços e o `appShell` iniciam. Depois, o navegador fica montado por baixo do bloqueio, preservando a navegação.
- **A URI de pareamento nunca vira parâmetro de rota.** O `expo-router` transformaria `porecatu://pair?...` na rota `/pair` com o token de uso único nos parâmetros, e a abriria mesmo com o app bloqueado. `app/+native-intent.tsx` impede isso: na partida a frio a rota é `/`, com o app aberto a tela atual fica. O `DeepLinkBridge` entrega a URL ao `appShell`, que a retém enquanto o app está bloqueado; com o conteúdo visível, a raiz abre `/pair/name` sem parâmetro, e a pilha do pareamento toma o *link* do `appShell` ao montar (e a cada novo *link* liberado enquanto está montada).

---

## 8. Estratégia de teste

- **Protocolo**: coberto no repositório do protocolo, contra os vetores. O app não repete esses testes.
- **Modelo da grade e stores**: funções puras, testadas em Node com sequências de mensagens gravadas (snapshot, diffs, snapshot no meio, `seq` quebrado, página de scrollback com `history` mudando).
- **Catálogo**: completude entre idiomas e cobertura de todos os códigos do protocolo ([ADR-0005](adr/0005-catalogo-de-textos-e-idiomas.md)).
- **Desktop falso**: um host de teste em Node, usando o próprio `@porecatu/protocol`, que serve um workspace e uma grade sintética por um relay local — para desenvolver e testar telas sem o Porecatu.
- **Contra o desktop real**: a lógica do app, montada como em produção mas sem telas, contra um Porecatu e um relay de verdade, na mesma máquina.
- **Render**: medido em aparelho real, nos critérios do [ADR-0002](adr/0002-render-da-grade-com-skia.md).

> **Na implementação (2026-11-17):** `pnpm test` (Jest com `jest-expo`) roda **1632 testes em 128 suítes**, todos em Node: as funções puras e os módulos com dependência injetada de `src/`, os controladores, os textos do catálogo, o desktop falso e as telas, montadas com `@testing-library/react-native` sobre os mocks oficiais das bibliotecas nativas (`test/setup/`) e os serviços falsos de `ui/services/testing.tsx`. A grade roda sobre o CanvasKit (o Skia em WASM) no ambiente de teste. Os vetores do protocolo **não** rodam aqui: ficam no repositório do protocolo, como previsto acima. As sessões de teste usam o relay em memória do kit de teste do pacote (`src/protocol/testing.ts`). **Nada foi rodado num aparelho**: gestos, teclado, Skia, desempenho, leitor de tela e módulos nativos de verdade são dívida de verificação ([roadmap](roadmap.md)).
>
> O **desktop falso** existe: `tools/fake-host/` (`pnpm fake-host`) junta relay e desktop num processo Node, escutando em `127.0.0.1` (porta padrão 8787), com o relay anunciado como `ws://localhost:<porta>` — o app só aceita `ws://` para loopback, então um Android o alcança por `adb reverse`. Imprime a URI de pareamento e o QR em texto. Serve um workspace de duas janelas com grupos, fixadas e abas em todos os estados de painel, e um painel vivo de 200×60 que muda o tempo todo (determinístico, sem `Math.random` nem relógio de parede), com controle de fluxo (2 mensagens sem ack, ~30/s), scrollback, eco do input e campainha. Toda ação recebe `unsupported`. Opções: `--port`, `--relay-url`, `--seed`, `--strict`, `--decline-pairing`, `--no-qr`; comandos `p`, `b` e `q` na entrada padrão. Os testes dele estão em `test/fake-host/`. Ainda **não** foi exercitado com o app num aparelho.
>
> **Contra o Porecatu real (2026-11-18):** `test/real-host/` (`pnpm real-host`, config `jest.real-host.config.js`) monta o app com `createServices` sobre `createTestServices`, mas com relógio, agendador, WebSocket (`ws`) e HTTP reais, e o percorre contra o Porecatu 0.10.0 e o relay do [porecatu/relay](https://github.com/porecatu/relay), em `127.0.0.1`: pareamento com confirmação no desktop, sessão, grade, input, scrollback, campainha, as 14 ações conferidas no `workspace`, confirmação de fechamento, códigos de erro, presença e reconexão. Só o armazenamento seguro fica em memória, salvo num arquivo entre rodadas. Fica fora do `pnpm test` porque precisa dos dois processos e, na primeira vez, de um clique em **Parear** no desktop. Preparo e limites no `README.md` de lá; o resultado, no [roadmap](roadmap.md).
