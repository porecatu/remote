# Roadmap

Marcos de entrega do v1 do Porecatu Remote. Cada marco tem **critério de saída explícito**; enquanto ele não for atendido, o marco não terminou.

O app depende de duas outras peças que andam em paralelo, em repositórios próprios: o pacote `@porecatu/protocol` ([porecatu/protocol](https://github.com/porecatu/protocol)) e o acesso remoto no Porecatu desktop ([porecatu/terminal](https://github.com/porecatu/terminal)). As dependências estão marcadas em cada marco.

| Marco | Status |
|---|---|
| M0 — Documentação inicial | **fechado** |
| M1 — Spike de render e integração do protocolo | **em andamento**: projeto, CI, catálogo, integração do protocolo em Node e a grade em Skia entregues; medição do render em aparelho e *development build* pendentes |
| M2 — Pareamento e navegação (só leitura) | **lógica e telas entregues**, verificadas só em Node; critério de saída pendente |
| M3 — Terminal com input | **lógica e telas entregues**, verificadas só em Node; critério de saída pendente |
| M4 — Gestão de abas | **lógica e telas entregues**, verificadas só em Node; critério de saída pendente |
| M5 — Publicação nas lojas | planejado |

### Implementação inicial: lógica (2026-11-16) e telas (2026-11-17)

Em 2026-11-16 entrou, por decisão do dono, **só a camada de lógica**. A [anatomia das telas](design/proposta-de-anatomia.md) foi **aprovada pelo dono no mesmo dia**, com as oito recomendações do §7 dela, e as peças que as telas pedem foram decididas: ícones ([ADR-0008](adr/0008-icones-lucide-em-svg.md)), fonte embutida ([ADR-0009](adr/0009-iosevka-fixed-embutida.md)), gestos, animação e teclado ([ADR-0010](adr/0010-gestos-animacao-e-teclado.md)) e folhas, diálogos e avisos ([ADR-0011](adr/0011-folhas-dialogos-e-avisos-proprios.md)).

Em 2026-11-17 entraram **as telas dos PRDs 001 a 004**, com essas dependências instaladas e o Skia: raiz (bloqueio, cobertura de privacidade, *deep link*), lista de desktops, pareamento, Configurações e Este aparelho, workspace, terminal, folhas e menus de gestão de abas, diálogos e avisos (`app/` e `ui/`, ligados à lógica por `src/controllers/`; [arquitetura](arquitetura.md) §1). No mesmo dia o app passou à **especificação 0.4** do protocolo ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)): abrir uma aba no terminal do app a ativa no desktop (`activate-tab`).

**Nenhum critério de saída de M1 a M4 está atendido**, porque todos pedem um aparelho; o Porecatu real já foi exercitado pela lógica do app, em Node (2026-11-18, "Verificação contra o Porecatu real", abaixo). O que está verificado é por **teste automatizado em Node**: `pnpm test` com **1632 testes em 128 suítes**, todos passando, com `jest-expo` e `@testing-library/react-native` (as bibliotecas nativas pelos mocks oficiais); `pnpm typecheck` e `pnpm lint` limpos. O protocolo foi verificado no repositório dele (vetores e teste cruzado Rust↔TypeScript). O que a anatomia não fixava e a implementação escolheu está na anatomia, em "Escolhas da implementação a confirmar", à espera do aval do dono.

Dívida de verificação de toda a implementação inicial (vale para cada marco abaixo):

| Item | Por quê |
|---|---|
| App em aparelho real contra o desktop falso | Sem *development build*, nada foi rodado num celular; as telas só rodaram no renderizador de teste, em Node |
| Medição do render com Skia em aparelho | A grade está implementada (`ui/terminal/grid/`), mas o spike do ADR-0002 não foi feito: o ADR segue Proposto. Falta medir fps e memória com 200×60 e rajada de diffs, o alinhamento real da Iosevka, o *fallback* de emoji e CJK, a gravação de linha (`SkPicture`) compartilhada entre threads e as costuras em zoom fracionário |
| *Development build* e build EAS nos dois sistemas | Sem Android SDK nem Mac nesta máquina; nada foi compilado para aparelho |
| Módulos nativos de verdade | `expo-secure-store`, `expo-local-authentication`, `expo-camera`, `expo-screen-capture`, `expo-haptics`, `expo-clipboard` e `expo-device` só foram exercitados por trás dos serviços injetados (`ui/services/`), com dublês; Gesture Handler, Reanimated, Keyboard Controller e Skia, pelos mocks oficiais |
| Gestos e teclado reais | Pinça, rolagem com *momentum* e arrasto das folhas; barra de teclas grudada no teclado, teclado físico, IME e composição (o campo de captura é esvaziado a cada mudança), aspas inteligentes do iOS, colar pela faixa do Gboard e o "Permitir colar" do iOS |
| `FLAG_SECURE` e cobertura de privacidade | A captura bloqueada no terminal (`expo-screen-capture`) e a cobertura no seletor de apps (RF-1.19) só foram vistas em teste |
| Leitor de tela (TalkBack, VoiceOver) | Rótulos e anúncios testados em Node; não testados com leitor de verdade, nem o resumo da grade (`ui/terminal/grid/gridA11y.ts`), nem o aviso fora do alcance do VoiceOver com uma folha aberta |
| Navegação e transições | `dismissTo` na pilha aninhada do pareamento (inclusive entrando por link), pilha restaurada no terminal, `replace("/pair")` e `dismissTo("/")` na pilha real, transições de 150 ms, `maintainVisibleContentPosition` e a rolagem devolvida ao cancelar a busca |
| Câmera e periféricos | `CameraView` fora de foco, lanterna, teclado na tela de nome do pareamento, vibração da campainha, paisagem imersiva |
| Contra um Porecatu real | **Em parte verificado (2026-11-18), em Node, sem aparelho**: ver "Verificação contra o Porecatu real", abaixo. Falta o app num aparelho contra o Porecatu (os critérios de saída de M2 a M4), macOS e Linux como host, um relay remoto com `wss://`, e os casos que a verificação não cobre: aba fixada, `last-tab`, `busy`, SSH (`connecting`, `awaiting-desktop`) e `too-many-subscriptions` |

### Verificação contra o Porecatu real (2026-11-18)

A lógica do app, montada como em produção mas sem as telas (`createServices`, o controlador de pareamento das telas de pareamento, o de desktops, o store da sessão e o controlador do terminal), falou com o **Porecatu 0.10.0** compilado do `main` do [porecatu/terminal](https://github.com/porecatu/terminal) (`2de6a5b`) e com o **relay** do `main` do [porecatu/relay](https://github.com/porecatu/relay) (`8c1e549`), os dois em `127.0.0.1` num Windows 11, com WebSocket e HTTP reais. É o `pnpm real-host` ([test/real-host/](../test/real-host/README.md)), fora do `pnpm test`. Três rodadas: a primeira com o pareamento, as duas seguintes com o desktop reiniciado e o pareamento salvo; a última passou inteira (**9 testes, 38 passos**). Visto funcionando:

- **Pareamento**: a URI copiada do desktop ("Copiar link de pareamento"), handshake `XX` com o token de uso único, o diálogo "Parear este aparelho?" com a mesma impressão digital que o app mostra, `pair-accepted` e a sessão adotada sem reconectar (RF-1.10). Nas rodadas seguintes, conexão `IK` pelo desktop salvo, com o desktop reiniciado.
- **Sessão**: `welcome` (Porecatu 0.10.0, `max_subscriptions` 4), `theme` com 16 cores e cores de grupo, `profiles` e o `workspace` restaurado (duas janelas, grupo, aba dividida, abas não iniciadas); presença `online` pelo `GET /v0/presence`; sair e voltar com o mesmo `host_instance`.
- **Terminal**: `grid-snapshot` e `grid-diff` aplicados e confirmados (96×22, PowerShell), texto e Enter, colar, `Ctrl` da barra + `c` interrompendo um `ping -t`, uma página de scrollback de 100 linhas (150 no histórico) e a campainha no painel assinado.
- **As 14 ações** com efeito, cada uma conferida no `workspace` seguinte: `activate-tab` (inclusive iniciando uma aba não iniciada), `start-pane`, `rename-tab` (e limpar), `new-tab` (solta e num grupo, ativa na janela), `new-group`, `rename-group`, `set-group-color`, `collapse-group` (colapsar e expandir), `move-tab-to-group` (entrar e sair), `ungroup`, `move-tab-to-window`, `move-group-to-window`, `close-pane` e `close-tab`. Depois de cada uma, o painel focado (`focused`) de toda aba ficou igual.
- **Fechar com processo em primeiro plano**: `confirm-request` (`running-process`, um processo) ao app que pediu; recusa termina em `cancelled` com a aba viva, e aceitar fecha a aba e encerra a assinatura do terminal (`tab-gone`).
- **Erros por código** em `action-result`: `invalid-argument` (`start-pane` em painel rodando, mover para a própria janela), `unknown-tab`, `unknown-profile` e `unknown-group` (grupo de outra janela).
- **Nenhuma janela do sistema levantada** (spec 03 §7): com uma janela do desktop de teste na frente, mover aba e grupo para a janela de trás e ativar uma aba nela deixaram a mesma janela em primeiro plano.

Nada do app precisou mudar. As falhas da primeira rodada eram do próprio teste: a janela pedida ao scrollback e a checagem de janela em primeiro plano, que comparava processos em vez de janelas.

O Porecatu guarda a identidade do host e o token do relay no cofre do sistema, **o mesmo para todas as instâncias** (serviço `porecatu-remote`): uma instância de teste, mesmo com outro `--config` e outro `PORECATU_SESSION`, usa a identidade e o token do Porecatu de uso. A verificação contornou isso com um relay local que aceita esse token, e o cofre não foi alterado. Vale levar ao desktop: um jeito de isolar o cofre por instância facilitaria testes como este.

Pendências que não são de verificação:

| Item | Situação |
|---|---|
| Identificador do app `br.com.porecatu.remote` (iOS `bundleIdentifier` e Android `package`) | **Provisório** em `app.config.ts`; decidir antes do primeiro build de loja (M5), porque não muda depois de publicado |
| Textos das permissões nativas (câmera, Face ID) em `app.config.ts` | **Provisórios**, em inglês e fora do catálogo (a anatomia não os fixa); decididos e traduzidos antes do M5 |
| `@porecatu/protocol` vindo de `vendor/porecatu-protocol-0.1.0.tgz` | Regerado para a especificação 0.4 com o mesmo nome e versão; passa a dependência publicada (ou git) quando o pacote for publicado ([ADR-0004](adr/0004-criptografia-em-js-puro.md)) |
| Escolhas da implementação a confirmar | Valores e comportamentos que a anatomia não fixava, listados nela; esperam o aval do dono |
| Relay e desktop na especificação 0.4 | **Resolvido (2026-11-17).** A 0.4 entrou no `main` do protocolo (`0909e7c`) e o [porecatu/relay](https://github.com/porecatu/relay) e o Porecatu 0.10.0 usam esse mesmo `rev` do `porecatu-protocol`. O relay não lê ações, então nada mudou no comportamento. Resta ao app o tarball em `vendor/`, gerado do mesmo conteúdo |

---

## M0 — Documentação inicial

PRD-000 a 004, ADR-0001 a 0007, arquitetura, CLAUDE.md, verificação de links.

**Critério de saída:** documentos revisados e aprovados pelo dono do produto; `python scripts/verify-docs.py` passa; cada RF que depende do protocolo cita a seção da spec que o sustenta.

**Fechado.** PRDs 000 a 004 aprovados, ADRs 0001 e 0003 a 0007 aceitos (o 0002 segue Proposto até o spike). Os documentos foram reconciliados com o código em 2026-11-16 (notas datadas nos ADRs, PRDs e na arquitetura).

## M1 — Spike de render e integração do protocolo

**Depende de:** `@porecatu/protocol` publicado com o cliente (envelope, Noise, CBOR) e o host de teste.

- Projeto Expo criado com a toolchain do [ADR-0007](adr/0007-toolchain-pinada.md), development build nos dois sistemas, CI com lint, `tsc --noEmit` e testes.
- Spike de render ([ADR-0002](adr/0002-render-da-grade-com-skia.md)): grade 200×60 sintética, rolagem, pinça e rajada de 30 diffs/s, medidos em build de release.
- Integração do pacote: conectar a um relay local e a um desktop falso em Node, receber `workspace` e uma grade, mandar `grid-ack`.
- Catálogo de textos com `en_US` e `pt_BR` e os testes de completude ([ADR-0005](adr/0005-catalogo-de-textos-e-idiomas.md)).

**Aparelhos de referência:** um Android intermediário (a definir no início do M1, com preço e ano registrados aqui) e um iPhone de duas gerações atrás.

**Critério de saída:** ADR-0002 passa a **Aceito** com os números medidos (ou é reescrito com a alternativa vencedora); o app desenha uma grade recebida do desktop falso pelo relay local, nos dois sistemas.

**Entregue (2026-11-16):**

- Projeto Expo SDK 58 (React Native 0.88.1, React 19.3.0, TypeScript 6.0.3 estrito, `expo-router`) com a toolchain do ADR-0007: Node 26.13.0, pnpm 12.17.0, dependências exatas, lockfile.
- CI (`.github/workflows/ci.yml`): `typecheck`, `lint` e `test`; verificação de links, de cabeçalhos SPDX (`scripts/check-spdx.py`) e de licenças das dependências de produção (`scripts/check-licenses.mjs`); DCO nos PRs. Dependabot.
- Integração do pacote: `@porecatu/protocol` 0.1.0 pelo tarball em `vendor/`, re-exportado só por `src/protocol/`; aleatoriedade por `expo-crypto` instalada antes do pacote, com checagem no arranque.
- Desktop falso em Node (`tools/fake-host/`, `pnpm fake-host`): relay e desktop num processo, em `127.0.0.1`, com URI e QR em texto, workspace de duas janelas e um painel vivo de 200×60 ([arquitetura](arquitetura.md) §8).
- Catálogo `en_US`/`pt_BR` com chaves tipadas, plural escrito à mão, completude entre idiomas, cobertura de todos os códigos do protocolo e o teste de "abas" ([ADR-0005](adr/0005-catalogo-de-textos-e-idiomas.md)).

**Entregue (2026-11-17):** a grade em Skia, como o ADR-0002 propõe, isolada em `ui/terminal/grid/` para poder ser trocada sem mexer no resto da tela: motor em JS (`gridEngine.ts`), uma gravação por linha refeita só para as linhas sujas, box-drawing e blocos como formas, cursor em camada própria, zoom e rolagem como transformação do canvas (`src/terminal/viewport.ts`). Testada em Node sobre o CanvasKit, sem pintar na tela.

**Falta:** a medição do render em aparelho (o spike do ADR-0002, que continua Proposto), o *development build* nos dois sistemas, a definição dos aparelhos de referência e o app desenhando uma grade do desktop falso num aparelho. **Dívida de verificação:** a da tabela da implementação inicial, acima.

## M2 — Pareamento e navegação (só leitura)

**Depende de:** acesso remoto do Porecatu desktop com pareamento e envio de `workspace` e grade. **Disponível desde o Porecatu 0.10.0 (2026-11-18)**, exercitado pela lógica do app em Node no mesmo dia (acima, "Verificação contra o Porecatu real"), ainda não por um aparelho.

- [PRD-001](prd/prd-001-desktops-e-pareamento.md) inteiro: identidade, QR pela câmera e por *deep link*, confirmação, lista de desktops, bloqueio por biometria.
- [PRD-002](prd/prd-002-navegacao-do-workspace.md) inteiro: sessão, reconexão, árvore, busca, tema.
- [PRD-003](prd/prd-003-terminal.md) só a parte de leitura: grade ao vivo, zoom, rolagem, histórico, estados do painel (sem input, sem `start-pane`).
- Aval visual do dono para as telas do M2 antes de implementá-las ([design](design/README.md)). **Feito em 2026-11-16**, com a aprovação da [anatomia das telas](design/proposta-de-anatomia.md), que cobre também as telas do M3 e do M4.

**Critério de saída:** com um Porecatu real, parear, ver o workspace mudar ao vivo e acompanhar a saída de um build numa aba, nos dois sistemas.

**Lógica entregue (2026-11-16), sem telas:** identidade do aparelho e impressão digital (`src/storage/deviceIdentity.ts`); fluxo de pareamento como máquina de estados pura, com validação da URI, conferência da chave do desktop contra o QR e prazos (`src/pairing/pairingFlow.ts`); *deep link* `porecatu://pair` retido enquanto o app está bloqueado (`src/pairing/deepLink.ts`); lista de desktops com teto de 20 e estado da última conexão (`src/storage/desktopList.ts`); presença a cada 30 s (`src/net/presence.ts`); bloqueio do app, inclusive o aparelho sem bloqueio (RF-1.20) (`src/security/`); ciclo da conexão com reconexão 1, 2, 4, 8 e 16 s e fechamento após 30 s em segundo plano (`src/session/lifecycle.ts`); store por desktop e registro (`src/session/sessionStore.ts`, `registry.ts`); seletores da árvore, busca, miniatura de painéis e expansão local de grupos (`src/workspace/`); modelo da grade, scrollback e resolução de cor (`src/grid/`); assinaturas com `grid-ack` depois de aplicar e `max_subscriptions` do `welcome` (`src/session/subscription.ts`).

**Telas entregues (2026-11-17), verificadas só em Node:** raiz com tela de bloqueio, cobertura de privacidade e *deep link* entregue ao fluxo só depois do desbloqueio (`ui/root/`, `src/controllers/appShell.ts`); lista de desktops com presença, renomear e remover (`ui/screens/desktops/`, `src/controllers/desktops.ts`); pareamento pela câmera, com nome do aparelho, espera da confirmação e resultados (`ui/screens/pairing/`, `src/controllers/pairing.ts`), e o workspace na mesma sessão do pareamento (RF-1.10, `Lifecycle.adopt`); Configurações e Este aparelho, com o nome do último pareamento em `settings.v1` (`ui/screens/settings/`, `src/controllers/settings.ts`); a árvore do workspace com busca, faixa de conexão e telas de estado (`ui/screens/workspace/`); a grade só leitura no terminal, com zoom, rolagem, histórico e seletor de painéis (`ui/screens/terminal/`, `ui/terminal/`).

**Verificado contra o Porecatu real, em Node (2026-11-18):** o pareamento com a URI do desktop e a confirmação nele, a sessão adotada, o `workspace`, o tema, a presença, a grade ao vivo, o scrollback e a reconexão ("Verificação contra o Porecatu real", acima). Não conta como critério de saída: não houve aparelho, câmera nem tela.

**Falta:** o critério de saída inteiro. **Dívida de verificação:** a da tabela da implementação inicial, em especial câmera, `FLAG_SECURE`, cobertura no seletor de apps (RF-1.19), gestos e leitor de tela.

## M3 — Terminal com input

- Resto do [PRD-003](prd/prd-003-terminal.md): teclado, barra de teclas especiais, modificadores com trava, colar, campainha, `start-pane`.
- Testes nos teclados mais comuns (Gboard, SwiftKey, teclado da Samsung, teclado do iOS) e com ditado.

**Critério de saída:** usar `vim`, `htop` e um `git commit` interativo pelo celular, num Porecatu real.

**Lógica entregue (2026-11-16), sem telas:** modificadores com trava e barra de teclas (`src/input/modifiers.ts`, `keyBar.ts`); montagem de `key`, `text-input` e `paste` só para painel assinado e `running`, com teto de 1 MiB (`src/input/send.ts`); confirmação do colar com prévia (`src/input/paste.ts`); decisão de vibrar na campainha (`src/session/subscription.ts`); ação `start-pane` (`src/session/actions.ts`).

**Telas entregues (2026-11-17), verificadas só em Node:** o campo de captura do teclado e a barra de teclas grudada nele (`ui/terminal/CaptureInput.tsx`, `KeyBar.tsx`), com `Esc` sem modificadores e os armados mantidos para a próxima tecla; colar pelo botão, pelo menu do sistema ou pela barra do próprio teclado, sempre pelo fluxo com confirmação quando há quebra de linha (`ui/terminal/PasteDialog.tsx`); avisos de input recusado pelo catálogo, inclusive o de tamanho (RF-3.25); campainha com ícone e vibração; cartão de estado do painel com Iniciar (`start-pane`); tudo ligado pelo controlador do terminal (`src/controllers/terminalSession.ts`).

**Verificado contra o Porecatu real, em Node (2026-11-18):** texto, Enter, colar, `Ctrl` da barra + `c`, a campainha e o `start-pane` chegam ao shell (PowerShell) e voltam na grade ("Verificação contra o Porecatu real", acima). Sem aparelho, sem teclado de verdade e sem `vim` nem `htop`.

**Falta:** os testes nos teclados e o critério de saída inteiro. **Dívida de verificação:** a da tabela da implementação inicial, mais os teclados de terceiros.

## M4 — Gestão de abas

- [PRD-004](prd/prd-004-gestao-de-abas.md) inteiro: nova aba com perfil, fechar com `confirm-request`, renomear, mover entre grupos e janelas, ações de grupo.

**Critério de saída:** cada ação do PRD-004 exercitada contra um Porecatu real, conferindo no desktop que o resultado é o do gesto local e que só a aba ativa dentro da janela muda, como no gesto local; a janela do sistema e o painel focado não ([especificação 0.4](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)). Abrir uma aba no terminal do app também a ativa no desktop (`activate-tab`).

**Lógica entregue (2026-11-16), sem telas:** as ações da spec (`src/session/actions.ts`; 14 desde a especificação 0.4, com `activate-tab` — 13 desde a 0.5, que a tirou —, que era ação de fundo e não marcava item como pendente); pedidos pendentes por item, espera da aba criada aparecer no `workspace` e classificação dos erros, inclusive `last-tab` (RF-4.11) (`src/session/requests.ts`); confirmações com prazo de 60 s (`src/session/confirm.ts`). O desktop falso responde `unsupported` a toda ação; o efeito das ações foi visto contra o Porecatu real (abaixo).

**Telas entregues (2026-11-17), verificadas só em Node:** menus da aba e do grupo (`ui/sheets/menus/`), Nova aba com perfil (`ui/sheets/NewTabSheet.tsx`), folhas de renomear, mover para grupo e para janela, novo grupo e cor do grupo (`ui/sheets/forms/`), a confirmação de fechamento pedida pelo desktop com prazo de 60 s e os avisos de falha por código (`ui/session/`). Fechar uma aba fixada manda a ação direto: a única confirmação é a do desktop, que diz que a aba será desafixada.

**Verificado contra o Porecatu real, em Node (2026-11-18):** as 14 ações surtiram efeito, conferido no `workspace` seguinte; o painel focado de toda aba ficou igual depois de cada uma; mover para outra janela e ativar aba na janela de trás não levantaram janela do sistema; o fechamento com processo em primeiro plano pediu confirmação ao app, e recusar e aceitar deram `cancelled` e o fechamento ("Verificação contra o Porecatu real", acima). Ficaram de fora a aba fixada, `last-tab` e `busy`, e a conferência foi pelo `workspace` e pela janela em primeiro plano, não a olho no desktop.

**Falta:** o critério de saída inteiro (pelas telas, num aparelho). **Dívida de verificação:** a da tabela da implementação inicial.

## M5 — Publicação nas lojas

Android e iOS no **mesmo marco** (o Expo constrói os dois).

- Contas de desenvolvedor, ícones, textos das lojas nos dois idiomas, política de privacidade (o app não coleta dados).
- Teste interno: Google Play (teste interno) e TestFlight.
- Tag da versão no repositório e link do código-fonte na tela "Sobre" ([ADR-0006](adr/0006-licenca-gpl-e-lojas.md)).

**Critério de saída:** a mesma versão aprovada nas duas lojas, ou o motivo de recusa registrado aqui com a decisão tomada.

---

## Especificação 0.5: abrir uma aba não muda o desktop (ADR-0012) — implementada em 2026-11-20

Pedido do dono em 2026-11-20: abrir uma aba no app trocava a aba ativa do desktop, e isso foi desfeito por inteiro, junto com a ativação nas ações ([ADR-0011 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0011-cliente-nao-muda-a-aba-ativa-e-view-tab.md); no Porecatu, [ADR-0111](https://github.com/porecatu/terminal/blob/main/docs/adr/0111-o-celular-nao-muda-a-aba-ativa-do-desktop.md) e [ADR-0112](https://github.com/porecatu/terminal/blob/main/docs/adr/0112-indicador-de-aba-vista-pelo-celular.md)). Decisão neste repositório: [ADR-0012](adr/0012-abrir-aba-nao-muda-o-desktop.md). **Implementado em 2026-11-20**, verificado por teste automatizado em Node (`pnpm test`: 1634 testes em 128 suítes; `pnpm typecheck` e `pnpm lint` limpos). Itens 1 a 3 e 5 feitos; do item 4, o desktop falso aceita `view-tab`, e o `pnpm real-host` foi reescrito mas **não rodou** contra um Porecatu 0.5.

1. **Pacote do protocolo na 0.5** (pré-requisito externo): `vendor/porecatu-protocol-*.tgz` regerado do commit da 0.5 ([ADR-0004](adr/0004-criptografia-em-js-puro.md)), com `view-tab` e sem `activate-tab`.
2. **Sem ativação**: sai `activateOnce` de `src/controllers/terminalSession.ts`, sai `activateTab` de `src/session/actions.ts`, e `isBackgroundAction`, `targetsOf` e `failure.silent` (`src/session/requests.ts`) saem se não restar outra ação de fundo. Os testes de `describe("terminal session: activate-tab")` viram os de `view-tab`.
3. **`view-tab`**: em todo `ready` com a aba na árvore (inclusive depois de reconectar), `null` no `close()`, nada no `selectPane()`, `unknown-tab` ignorado.
4. **`pnpm real-host` e `pnpm fake-host`**: o desktop falso aceita `view-tab`; contra o Porecatu real, abrir uma aba não muda o `active` do `workspace` seguinte, e `new-tab`, expandir grupo e mover para janela também não.
5. **Docs de fechamento**: as revisões de 2026-11-20 nos PRDs 000, 002, 003 e 004, na anatomia e na arquitetura deixam de dizer "implementação pendente"; CHANGELOG e CLAUDE.md.

**Verificação prevista:** além da dívida de aparelho de sempre, conferir no desktop real o ícone de aba vista aparecendo ao abrir a aba no app, sumindo ao sair da tela e voltando depois de uma reconexão.

## Dívida de verificação prevista

Registrada desde já, para não ser descoberta depois:

| Item | Por quê |
|---|---|
| Tablets e telas dobráveis | Layout de celular apenas no v1 |
| Leitor de tela (TalkBack, VoiceOver) na grade | O canvas do Skia não expõe texto; o v1 tem só um resumo das últimas linhas, no máximo a cada 2 s (`ui/terminal/grid/gridA11y.ts`), e a leitura completa precisa de camada de acessibilidade própria ([ADR-0002](adr/0002-render-da-grade-com-skia.md)) |
| Redes muito instáveis (troca Wi-Fi ↔ 4G no meio da sessão) | Reconexão testada em laboratório; o comportamento real depende do sistema |
| Versões mínimas de Android e iOS | Definidas no M1 pelo SDK do Expo pinado |

## Fora do v1

| Item | Onde está justificado |
|---|---|
| Notificações push | [PRD-000](prd/prd-000-visao-de-produto.md) |
| Seleção e cópia de texto da grade | [PRD-003](prd/prd-003-terminal.md) |
| Responder perguntas do SSH pelo celular | [PRD-000](prd/prd-000-visao-de-produto.md), [PRD-003](prd/prd-003-terminal.md) |
| Fixar abas, sessões nomeadas, abrir janela | [PRD-004](prd/prd-004-gestao-de-abas.md) |
| Código digitado no pareamento | [PRD-001](prd/prd-001-desktops-e-pareamento.md) |
| Permissão por aparelho (somente leitura) | [PRD-001](prd/prd-001-desktops-e-pareamento.md) |
