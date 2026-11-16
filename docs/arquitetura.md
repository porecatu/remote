# Arquitetura

Documento técnico central do app. Os ADRs justificam *por que* cada peça foi escolhida; este documento descreve *como* elas se encaixam. **Estado (2026-11-16):** a camada de lógica está implementada e testada em Node (stores, modelo da grade, input, pareamento, armazenamento, bloqueio, catálogo); **telas e render não existem** — dependem do aval visual do dono ([design](design/README.md)) e do spike do [ADR-0002](adr/0002-render-da-grade-com-skia.md). Onde o código diverge do escrito, há um bloco **Na implementação** dizendo o quê e por quê, como no Porecatu.

O protocolo é especificado fora daqui, no [porecatu/protocol](https://github.com/porecatu/protocol/blob/main/docs/especificacao/00-visao-geral.md); este documento cita as seções dele quando depende delas.

---

## 1. Camadas

```
+---------------------------------------------------------------------+
|  Telas (expo-router)                                                |
|  lista de desktops · pareamento · workspace · terminal · menus      |
+-------------------------------+-------------------------------------+
                                |  lê estado, chama ações
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
  Render da grade (Skia, ADR-0002) — lê o modelo da grade, desenha
  Armazenamento seguro (ADR-0003) — chave do aparelho, lista de desktops, configurações
  Catálogo de textos (ADR-0005)   — todo texto de interface
```

O **WebSocket é do app**, não do pacote: `src/net/relaySocket.ts` adapta o WebSocket do React Native (só quadros binários, quadro de texto recusado com 1003, códigos de fechamento mapeados para motivos tipados) e entrega bytes opacos ao `ClientSession` do pacote, que cuida de envelope, Noise e CBOR. O construtor do WebSocket é injetável, e os testes usam o relay em memória do kit de teste do pacote.

### Onde está cada parte no código

| Pasta | O quê |
|---|---|
| `src/protocol/` | Único ponto de re-export do `@porecatu/protocol` (`index.ts`) e do kit de teste dele (`testing.ts`) |
| `src/net/` | Socket do relay, consulta de presença (`presence.ts`, a cada 30 s) e o calendário de reconexão (`backoff.ts`) |
| `src/session/` | Ciclo da conexão (`lifecycle.ts`), store por desktop (`sessionStore.ts`, `zustand/vanilla`), registro de stores abertos (`registry.ts`), assinaturas de grade (`subscription.ts`), ações e pedidos pendentes (`actions.ts`, `requests.ts`), confirmações (`confirm.ts`) |
| `src/workspace/` | Seletores da árvore, busca, disposição dos painéis em miniatura e expansão local de grupos |
| `src/grid/` | Modelo da grade, scrollback, resolução de cor e tabela do xterm |
| `src/input/` | Modificadores com trava, barra de teclas, colar e envio de input |
| `src/pairing/` | Fluxo de pareamento (máquina de estados pura) e *deep link* |
| `src/storage/` | Secure Store, lista de desktops, configurações e identidade do aparelho |
| `src/security/` | Bloqueio do app e o invólucro do `expo-local-authentication` |
| `src/i18n/`, `locales/` | Catálogo tipado, escolha de idioma, plural e o mapa dos códigos do protocolo |
| `src/log.ts`, `src/polyfills.ts` | Logger único (só eventos) e a aleatoriedade instalada antes do pacote |
| `app/` | `expo-router`; hoje só um `_layout.tsx` sem conteúdo visual |
| `tools/fake-host/` | O desktop falso (§8) |

Tudo em `src/` é lógica pura ou com dependências injetadas (relógio, temporizador, socket, armazenamento, módulos nativos): nada ali desenha nem depende de React.

**Composição.** O store de sessão já reúne o ciclo da conexão, os pedidos pendentes, as confirmações e a expansão local, e o registro cria um store por desktop aberto. As outras peças são independentes e testadas isoladamente, mas **ainda não estão ligadas** entre si nem ao store: o `SubscriptionSet` (assinaturas de grade, que recebe as mensagens pelo `onMessage` do store), o `InputSender`, o fluxo de pareamento, o *deep link*, a consulta de presença e o bloqueio do app. Essa ligação entra com as telas que as usam.

Regras de dependência:

- **Telas não falam com o protocolo.** Elas leem os stores e chamam ações do store (`openTab`, `sendKey`, `closeTab`...). Quem monta e manda mensagem é o store.
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
> - **Reconexão e `host_instance`**: durante a reconexão o store **mantém** o último `workspace` (o usuário não é tirado de onde está, RF-2.4) e a expansão local de grupos. Quando o `welcome` novo traz o **mesmo** `host_instance`, os ids continuam valendo; quando traz **outro** (o Porecatu reiniciou), o store descarta `workspace`, pedidos pendentes, confirmações e expansão local, porque os ids passaram a significar outras coisas. Por isso a tela só pode ser reaberta depois de reconectar se o `host_instance` for o mesmo **e** o id ainda existir. Assinaturas de grade não sobrevivem à reconexão: o `SubscriptionSet` tem `reset()` para isso, e quem o chama é quem o liga ao store (ver §1, composição).
> - O prazo do segundo plano é `BACKGROUND_CLOSE_MS` (30 s), igual para todos os desktops abertos (`src/session/registry.ts`).

### O que o store guarda

| Dado | Origem | Vida |
|---|---|---|
| `workspace` (árvore inteira, `rev`) | Mensagem `workspace`, **substituída** a cada envio | Sessão |
| `profiles`, `theme` | Mensagens do início e de recarga | Sessão |
| Assinaturas e seus modelos de grade | `subscribe` → `grid-snapshot`/`grid-diff` | Enquanto a tela do painel está aberta |
| Pedidos pendentes (`request-id` → ação, confirmação aberta) | `action`, `confirm-request` | Até o `action-result` |
| Expansão local de grupos, zoom por aba | Gesto do usuário no app | Sessão do app (memória) |

O `workspace` não é mesclado: cada mensagem substitui a anterior inteira. As telas comparam por id para preservar rolagem e não re-renderizar o que não mudou (o store já entrega `workspaceDiff`, os ids que entraram e saíram desde a árvore anterior da mesma instância). **Nada do store é gravado em disco** — o que persiste é só a chave do aparelho, a lista de desktops e as configurações do app, no Secure Store ([ADR-0003](adr/0003-chaves-no-armazenamento-seguro.md)).

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

> **Na implementação:** o render **não existe** (o spike do ADR-0002 não foi feito). A resolução de cor já está pronta, pura, em `src/grid/colorMath.ts` e `src/grid/xtermPalette.ts`: as regras acima, mais o efeito das marcas de estilo na ordem `inverse` → `dim` (frente misturada ao fundo com fator 0,66, decidido pelo dono em 2026-11-16) → `hidden` (frente = fundo).

---

## 5. Input

```
teclado do sistema --(texto, IME)--------------------> text-input { pane, text }
barra de teclas especiais --(Esc, setas, Fn...)------> key        { pane, named-key, mods }
Ctrl/Alt travados + letra -----------------------------> key        { pane, "c", Ctrl }
colar ---(confirmação se houver quebra de linha)-----> paste      { pane, text }
```

- O app **não codifica bytes de terminal**: manda input semântico, e o desktop o codifica com o mesmo codificador do teclado local ([mensagens §6](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)).
- O teclado é capturado por um campo de texto invisível com autocorreção, previsão e capitalização desligadas; cada mudança vira `text`, e o campo é esvaziado. `Backspace` do teclado virtual vira `key { backspace }`.
- Input só sai para painel `running` e assinado.

> **Na implementação** (`src/input/`): a montagem e as recusas estão prontas; o campo de captura é tela e não existe. `send.ts` recusa antes do fio o input para painel não assinado ou que não está `running`, texto vazio, texto com surrogate solto e texto acima de **1 MiB** em UTF-8 (`MAX_INPUT_TEXT_BYTES`, decidido pelo dono em 2026-11-16). Com um modificador armado, um único caractere digitado vira `key` com os modificadores, e não `text-input`. `paste.ts` pede confirmação sempre que o texto tem quebra de linha e prepara a prévia de 5 linhas × 120 caracteres (decidido pelo dono em 2026-11-16). `modifiers.ts` é a trava dos modificadores (`Ctrl`, `Alt`, `Shift`, `Meta`: um toque arma, dois travam, o terceiro desliga), e `keyBar.ts` mapeia os botões da barra para os `named-key` do pacote.

---

## 6. Threads

| Onde | O quê |
|---|---|
| **Thread de JS** (Hermes) | WebSocket, Noise e CBOR (pacote em JS puro), stores, modelo da grade, React |
| **Thread de UI** (nativa) | Gestos (pinça, rolagem) via Reanimated/Gesture Handler, sem passar pela thread de JS |
| **Thread de render do Skia** | Desenho do canvas a partir das gravações por linha |

A regra que importa: **gesto não espera a thread de JS**. Zoom e rolagem mexem num valor compartilhado lido pelo Skia; uma rajada de diffs ocupando a thread de JS não trava a rolagem. O orçamento da thread de JS (decifrar, decodificar e aplicar até 30 diffs/s) é medido no spike do M1.

---

## 7. Mapa de telas

```
Bloqueio (biometria) --> Lista de desktops --+--> Parear (câmera) --> Nome do aparelho --> Aguardando confirmação
                              |              |                                                    |
                              |              +--> Sobre este aparelho (impressão digital)        v
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

---

## 8. Estratégia de teste

- **Protocolo**: coberto no repositório do protocolo, contra os vetores. O app não repete esses testes.
- **Modelo da grade e stores**: funções puras, testadas em Node com sequências de mensagens gravadas (snapshot, diffs, snapshot no meio, `seq` quebrado, página de scrollback com `history` mudando).
- **Catálogo**: completude entre idiomas e cobertura de todos os códigos do protocolo ([ADR-0005](adr/0005-catalogo-de-textos-e-idiomas.md)).
- **Desktop falso**: um host de teste em Node, usando o próprio `@porecatu/protocol`, que serve um workspace e uma grade sintética por um relay local — para desenvolver e testar telas sem o Porecatu.
- **Render**: medido em aparelho real, nos critérios do [ADR-0002](adr/0002-render-da-grade-com-skia.md).

> **Na implementação (2026-11-16):** `pnpm test` (Jest com `jest-expo`) roda **651 testes em 39 suítes**, todos em Node: as funções puras e os módulos com dependência injetada de `src/`, os textos do catálogo e o desktop falso. Os vetores do protocolo **não** rodam aqui: ficam no repositório do protocolo, como previsto acima. As sessões de teste usam o relay em memória do kit de teste do pacote (`src/protocol/testing.ts`).
>
> O **desktop falso** existe: `tools/fake-host/` (`pnpm fake-host`) junta relay e desktop num processo Node, escutando em `127.0.0.1` (porta padrão 8787), com o relay anunciado como `ws://localhost:<porta>` — o app só aceita `ws://` para loopback, então um Android o alcança por `adb reverse`. Imprime a URI de pareamento e o QR em texto. Serve um workspace de duas janelas com grupos, fixadas e abas em todos os estados de painel, e um painel vivo de 200×60 que muda o tempo todo (determinístico, sem `Math.random` nem relógio de parede), com controle de fluxo (2 mensagens sem ack, ~30/s), scrollback, eco do input e campainha. Toda ação recebe `unsupported`. Opções: `--port`, `--relay-url`, `--seed`, `--strict`, `--decline-pairing`, `--no-qr`; comandos `p`, `b` e `q` na entrada padrão. Os testes dele estão em `test/fake-host/`. Ainda **não** foi exercitado com o app num aparelho: não há telas.
