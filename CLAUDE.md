# CLAUDE.md

Guia operacional do projeto. Leia antes de mexer em qualquer coisa.

## O que é

**Porecatu Remote** — app mobile (Android e iOS), em Expo/React Native e TypeScript, que se conecta a um [Porecatu](https://github.com/porecatu/terminal) desktop através de um [Porecatu Relay](https://github.com/porecatu/relay) auto-hospedado, para ver e controlar a sessão viva do desktop: workspace (janelas, grupos, fixadas, abas, painéis), grade do terminal, input e gestão de abas.

**Estado (2026-11-17):** **camada de lógica e telas**, implementadas e verificadas **só em Node**; nada foi rodado num aparelho. Expo SDK 58, TypeScript 6.0.3, `zustand` *vanilla*, testes com `jest-expo` e `@testing-library/react-native`: `pnpm test` roda **1593 testes em 129 suítes**, todos verdes, e `pnpm typecheck` e `pnpm lint` estão limpos. O app segue a **especificação 0.4** do protocolo (fio `[0, 1]`). O `@porecatu/protocol` 0.1.0 vem de `vendor/porecatu-protocol-0.1.0.tgz` (tarball gerado no repositório do protocolo, regerado para a 0.4 sem mudar de nome nem de versão; vira dependência publicada depois). O mapa de módulos e de rotas está na [arquitetura §1](docs/arquitetura.md); o que entrou, no [CHANGELOG](CHANGELOG.md).

- **Implementado e verificado só por teste automatizado em Node:**
  - **Lógica** (`src/`): conexão (socket do relay, ciclo da sessão, reconexão, presença), store por desktop e registro, adoção da sessão do pareamento, pareamento e *deep link*, armazenamento seguro, identidade, lista de desktops e configurações, bloqueio do app, seletores e busca da árvore, expansão local de grupos, modelo da grade, scrollback, resolução de cor, janela do terminal (zoom e rolagem, `src/terminal/`), input (modificadores, barra, colar, envio), as 14 ações, pedidos pendentes e confirmações, catálogo `en_US`/`pt_BR`, logger; e os controladores que ligam tudo isso às telas (`src/controllers/`).
  - **Telas** (`app/` e `ui/`): raiz (bloqueio, cobertura de privacidade, *deep link*), lista de desktops, pareamento, Configurações e Este aparelho, workspace, terminal (grade Skia, barra de teclas, colar), folhas e menus de gestão de abas, diálogos e avisos.
  - O desktop falso `tools/fake-host/` (`pnpm fake-host`).
- **Dívida de verificação** (detalhe no [roadmap](docs/roadmap.md)): o app num aparelho real, contra o desktop falso e contra um Porecatu; o spike de medição do Skia em aparelho (o [ADR-0002](docs/adr/0002-render-da-grade-com-skia.md) segue Proposto, embora a grade esteja implementada); *development build*, build EAS e lojas; módulos nativos de verdade (testados só por trás de serviços injetados e mocks); gestos e teclado reais (pinça, rolagem, folhas, teclados de terceiros, IME); `FLAG_SECURE` e a cobertura no seletor de apps; leitor de tela (TalkBack, VoiceOver).
- A [anatomia das telas](docs/design/proposta-de-anatomia.md) foi **aprovada pelo dono em 2026-11-16** e é a especificação das telas implementadas. O que ela não fixava e a implementação escolheu está listado nela, em "Escolhas da implementação a confirmar", à espera do aval do dono.
- **Provisórios** em `app.config.ts`: o identificador `br.com.porecatu.remote` e os textos das permissões nativas.

## O contrato vem de fora

O protocolo **não é deste repositório**. A especificação normativa e as implementações de referência moram em [porecatu/protocol](https://github.com/porecatu/protocol):

- [visão geral](https://github.com/porecatu/protocol/blob/main/docs/especificacao/00-visao-geral.md) · [transporte e relay](https://github.com/porecatu/protocol/blob/main/docs/especificacao/01-transporte-e-relay.md) · [handshake e pareamento](https://github.com/porecatu/protocol/blob/main/docs/especificacao/02-handshake-e-pareamento.md) · [mensagens](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md) · [versionamento](https://github.com/porecatu/protocol/blob/main/docs/especificacao/04-versionamento.md) · [modelo de ameaça](https://github.com/porecatu/protocol/blob/main/docs/especificacao/modelo-de-ameaca.md)

Regras que decorrem disso:

- **O app usa o pacote `@porecatu/protocol`** (envelope, Noise, registros, CBOR, tipos das mensagens), com versão **exata**. Nada de reimplementar codificação ou handshake aqui.
- **Divergência entre a spec e o app é bug do app**; se a spec estiver errada, a correção vai **primeiro** para o `porecatu/protocol`.
- Links para a spec são **URLs absolutas**, nunca relativas a diretório irmão (o `verify-docs.py` reprovaria).

## Princípios que o app não negocia

1. **O desktop é a fonte da verdade.** O app não guarda estado de workspace entre sessões nem interpreta VT: recebe árvore e grade, desenha, e pede ações.
2. **O desktop dita o tamanho.** O app nunca redimensiona o PTY; adapta zoom e rolagem horizontal.
3. **O app só muda a aba ativa, como o gesto local; nunca o painel focado nem a janela do sistema** ([especificação 0.4](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)). Abrir uma aba no terminal do app manda `activate-tab` uma vez por abertura, sem aviso na falha, e o desktop passa a mostrar a mesma aba na janela dela; as ações ativam como o gesto local (`new-tab`, expandir grupo, mover para janela). O app nunca manda ação que mude o `focused` de uma aba nem levante a janela do sistema.
4. **Input é semântico.** O app manda tecla nomeada + modificadores, texto e colar; quem codifica em bytes é o desktop.
5. **Perguntas de SSH (senha, chave do servidor) são respondidas só no desktop** no v1: o app mostra o painel em `connecting` e avisa.
6. **Nenhuma prosa no fio.** Erros chegam como `error-code`; o texto que o usuário lê é composto aqui, pelo catálogo.

## Stack travada

Cada item tem ADR em [docs/adr/](docs/adr/0000-template.md). Não troque nenhum sem ADR novo.

| Peça | Escolha | ADR |
|---|---|---|
| Framework | **Expo** (SDK pinado em versão exata), React Native, motor **Hermes**, desenvolvimento por *development build* e build por EAS | [0001](docs/adr/0001-expo-e-typescript.md) |
| Linguagem | **TypeScript** em modo `strict`, sem `any` implícito | [0001](docs/adr/0001-expo-e-typescript.md) |
| Render da grade | `@shopify/react-native-skia` — **Proposto**: implementado em `ui/terminal/grid/`, pendente da medição em aparelho | [0002](docs/adr/0002-render-da-grade-com-skia.md) |
| Chaves | `expo-secure-store` (Keychain no iOS, Keystore no Android) | [0003](docs/adr/0003-chaves-no-armazenamento-seguro.md) |
| Protocolo e cripto | `@porecatu/protocol`, que usa `@noble/*` e um codificador CBOR próprio — **JS puro, nenhum módulo nativo próprio** | [0004](docs/adr/0004-criptografia-em-js-puro.md) |
| Estado | `zustand` na forma *vanilla* (`zustand/vanilla`), um store por desktop aberto, fora do React | [0001](docs/adr/0001-expo-e-typescript.md) item 7 |
| Aleatoriedade | `crypto.getRandomValues` de `expo-crypto`, instalado em `src/polyfills.ts` antes de qualquer import do protocolo; nunca `Math.random` (o lint reprova) | [0004](docs/adr/0004-criptografia-em-js-puro.md) |
| Leitura do QR | `expo-camera` (leitor de código de barras embutido) e *deep link* `porecatu://` | [0001](docs/adr/0001-expo-e-typescript.md) |
| Textos | Catálogo de mensagens próprio, `en_US` padrão e `pt_BR` | [0005](docs/adr/0005-catalogo-de-textos-e-idiomas.md) |
| Licença | GPL-3.0-or-later com DCO | [0006](docs/adr/0006-licenca-gpl-e-lojas.md) |
| Toolchain | Node, gerenciador de pacotes e Expo SDK pinados | [0007](docs/adr/0007-toolchain-pinada.md) |
| Ícones | Lucide pelo `lucide-react-native` sobre `react-native-svg`, importado ícone a ícone, nunca pelo índice | [0008](docs/adr/0008-icones-lucide-em-svg.md) |
| Fonte mono | Iosevka Fixed 400/500, as faces recortadas do desktop, embutidas pelo *config plugin* do `expo-font`; o chrome usa a fonte do sistema | [0009](docs/adr/0009-iosevka-fixed-embutida.md) |
| Gestos, animação e teclado | `react-native-gesture-handler`, `react-native-reanimated` (com `react-native-worklets`) e `react-native-keyboard-controller`, nas versões do SDK | [0010](docs/adr/0010-gestos-animacao-e-teclado.md) |
| Folhas, diálogos e avisos | Componentes próprios numa camada do `app/_layout.tsx`, sem `Modal` e sem biblioteca de folhas | [0011](docs/adr/0011-folhas-dialogos-e-avisos-proprios.md) |

## Comandos

Documentação:

```bash
python scripts/verify-docs.py
```

No Windows, se `python` abrir a Microsoft Store, use `%LOCALAPPDATA%\Programs\Python\Python312\python.exe`.

Código (Node 26.13.0 por `.nvmrc`, pnpm 12.17.0 por `packageManager`):

```bash
pnpm install --frozen-lockfile        # instalação reproduzível (CI)
pnpm typecheck                        # tsc --noEmit
pnpm lint                             # eslint .
pnpm test                             # jest (jest-expo)
pnpm check                            # typecheck + lint + test
pnpm start                            # expo start --dev-client (exige development build)
pnpm exec expo config --type public   # confere a configuração do app
pnpm fake-host                        # relay + desktop falsos em Node (ws://localhost:8787), URI e QR no terminal
python scripts/check-spdx.py          # cabeçalho SPDX em todo arquivo (CI)
node scripts/check-licenses.mjs       # licenças das dependências de produção (CI)
```

O `pnpm fake-host` aceita `--port`, `--relay-url`, `--seed`, `--strict`, `--decline-pairing` e `--no-qr`, e lê `p` (novo pareamento), `b` (campainha) e `q` (sair) da entrada padrão; num Android, use `adb reverse tcp:8787 tcp:8787` (o app só aceita `ws://` para loopback). Os vetores do protocolo **não** rodam aqui: são testados no repositório do protocolo. Duas particularidades do pnpm 12: a configuração (`nodeLinker: hoisted`, `allowBuilds`) mora em `pnpm-workspace.yaml`, não no `.npmrc`; e script de instalação de dependência é bloqueado até ser decidido em `allowBuilds`.

## Convenções

- **Código, identificadores, comentários de código e nomes de arquivo de código: inglês.**
- **Documentação (README, ADR, PRD, docs/) e mensagens de commit: português do Brasil.**
- Commits em [Conventional Commits](https://www.conventionalcommits.org), assinados com DCO (`git commit -s`).
- Arquivos de doc em `kebab-case.md`. PRDs numerados `prd-NNN-...`, requisitos `RF-<prd>.<n>` (ex.: RF-3.4 é o quarto requisito do PRD-003).
- Terminologia: **"abas"**, nunca "guias" — inclusive nas strings de interface.
- **Frase de interface nunca é escrita no código** ([ADR-0005](docs/adr/0005-catalogo-de-textos-e-idiomas.md)): identificador no catálogo e valor em todo arquivo de idioma.
- Toda dependência com versão **exata** no `package.json` (sem `^` nem `~`), com o lockfile commitado.

## Licença

**GPL-3.0-or-later** ([ADR-0006](docs/adr/0006-licenca-gpl-e-lojas.md)). Todo arquivo de código-fonte e todo script começa com:

```ts
// SPDX-License-Identifier: GPL-3.0-or-later
```

(`#` em Python e shell.) Sem exceção.

`LICENSE` é cópia verbatim da FSF, idêntica à do Porecatu (`sha256` `3972dc97…986`), e **nunca é editado**. Antes de adotar qualquer pacote novo, conferir se a licença é compatível com GPLv3 — MIT, BSD, ISC e Apache-2.0 são; nem toda é.

## Processo de decisão arquitetural

Decisão aceita **não se edita**. Para mudar:

1. Escreva um ADR novo com o próximo número, com `Supersedes: ADR-NNNN`.
2. Marque o antigo como `Superseded by ADR-MMMM`.
3. Atualize o índice em [docs/adr/0000-template.md](docs/adr/0000-template.md) e, se for de stack, a tabela "Stack travada" acima.

Correção de erro factual ou de clareza é permitida; mudança de decisão, não.

## Aparência

- **Nenhuma tela sem aval visual do dono do produto.** A [anatomia das telas](docs/design/proposta-de-anatomia.md) tem o aval (2026-11-16) e é a especificação: as telas seguem a anatomia, os gestos e os textos de lá. Tela nova ou mudança visível numa tela aprovada passa pelo dono antes ([docs/design/](docs/design/README.md)).
- **A grade usa o tema do desktop** (mensagem `theme`): fundo, frente, cursor, seleção, as 16 cores e a paleta de grupos vêm de lá. O app não inventa paleta de terminal.
- Nenhuma cor, dimensão ou espaçamento do chrome do app é inventado no código: sai dos tokens da anatomia (§2). Valor que falte lá entra primeiro na anatomia.
- **A cobertura de privacidade fica acima de tudo**: nenhuma folha, diálogo ou aviso usa `Modal` do React Native, que abriria uma janela nativa por cima dela ([ADR-0011](docs/adr/0011-folhas-dialogos-e-avisos-proprios.md)).

## Armadilhas conhecidas

- **Nunca registrar em log** grade, scrollback, teclas, texto colado, títulos, diretórios ou chaves — nem em `console.log` de depuração que "depois sai". O relay é cego; o app não pode ser o vazamento. Log só de eventos (conectou, caiu, código de erro).
- **Chave privada só no armazenamento seguro** ([ADR-0003](docs/adr/0003-chaves-no-armazenamento-seguro.md)): nunca em `AsyncStorage`, em arquivo, em estado global serializável nem em relatório de crash.
- **Render da grade não recria texto por célula por quadro.** O modelo guarda linhas já agrupadas em spans; o render reaproveita o que não mudou e só redesenha as linhas que o `grid-diff` tocou. Medir sempre com grade grande (200×60) em Android intermediário.
- **Ack de grade é obrigatório.** Sem `grid-ack`, o desktop para de mandar a grade daquela assinatura depois de duas mensagens ([mensagens §5.4](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)). Confirmar **depois** de aplicar, não ao receber.
- **Snapshot pode chegar a qualquer momento** (o desktop redimensionou, entrou na tela alternativa): o modelo da grade aceita `grid-snapshot` no meio de uma sequência de diffs. O `seq` **não** reinicia: snapshots e diffs dividem a mesma sequência da assinatura, e o próximo diff tem de ser o `seq` do snapshot + 1.
- **`seq` fora de sequência é erro de protocolo**, não dessincronia ([mensagens §5.3](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)): o app manda `error { protocol }` e a sessão fecha, sem assinar de novo para "consertar" (`src/session/subscription.ts`).
- **Plural sem `Intl.PluralRules`**: o Hermes não garante `Intl`; as regras estão escritas à mão em `src/i18n/plural.ts` (en: `one` só para 1; pt: `one` para parte inteira 0 ou 1).
- **`max_subscriptions` vem do `welcome`**, não é constante do app.
- **Coluna de caractere sem segmentar grafemas**: o *i*-ésimo code point de um span comum está em `col + i × width`; grafema de vários code points vem sozinho num span. O Hermes não tem `Intl.Segmenter` confiável — não dependa dele.
- **Ids do protocolo reiniciam quando o Porecatu reinicia.** Nunca persistir `tab-id`/`pane-id` entre sessões como se fossem estáveis.
- **App em segundo plano**: o sistema operacional derruba o WebSocket. Ao voltar, reconectar e reconstruir tudo a partir do `workspace` e de novos `grid-snapshot`; nunca supor que o estado antigo continua valendo.
- **Nunca `Modal`** do React Native: folhas, diálogos e avisos passam pela camada de `ui/overlay/` ([ADR-0011](docs/adr/0011-folhas-dialogos-e-avisos-proprios.md)), por baixo da cobertura de privacidade. O lint reprova o import.
- **A URI de pareamento nunca vira parâmetro de rota.** O `app/+native-intent.tsx` (`ui/root/nativeIntent.ts`) não deixa o `expo-router` abrir `/pair` com o token de uso único nos parâmetros, nem por baixo do bloqueio: a partida a frio vai para `/`, e com o app aberto a tela fica. O link chega ao fluxo só pelo `DeepLinkBridge`, depois do desbloqueio. Não remova o arquivo nem leia o token de `useLocalSearchParams`.
- **`activate-tab` é ação de fundo** (`isBackgroundAction` em `src/session/actions.ts`): não marca item como pendente, e falha ou perda na queda não viram aviso. Ação nova que o app mande sozinho, sem pedido do usuário, entra ali; ação pedida pelo usuário nunca.
- **Shared value do Reanimated 4 não devolve à thread JS o que ela acabou de escrever**: a escrita é assíncrona (`scheduleOnUI`) e a leitura só vê o valor novo depois que a UI thread aplicou. O motor da grade (`ui/terminal/grid/gridEngine.ts`) lê de uma cópia JS (`js`), nunca do `SharedValue` logo após escrever; o que o gesto move na UI thread chega por argumento (`UiView`). Foi o que deixava o terminal parado em branco ao abrir a aba. Em Jest o `makeMutable` é síncrono e esconde isso: teste com `deferredBox` (`ui/terminal/grid/testing.ts`).
- **`useInputRefusalToasts` é montado uma única vez**, na tela do terminal: cada montagem assina os eventos `input-refused` do controlador, e uma segunda daria avisos em dobro.
- **Módulos nativos só pelos serviços** (`ui/services/`): telas e controladores recebem `useServices()` (ou dependências injetadas), e só `nativeServices.ts` importa `expo-clipboard`, `expo-haptics`, `expo-screen-capture` e afins. É o que deixa as telas testáveis em Node com `createTestServices()`.
- **Testes de tela com o `@testing-library/react-native` 14**: `render` e `fireEvent` são **assíncronos** — sempre `await render(...)`/`await renderWithServices(...)` e `await fireEvent...`, senão o teste falha com "overlapping act()". Os ícones Lucide saem com `aria-hidden`, então consulta por `testID` de ícone pede `{ includeHiddenElements: true }`. No mock do Skia o `Canvas` não pinta, mas a API `Skia.*` roda sobre o CanvasKit; o `SkPath` é imutável (use `Skia.PathBuilder`) e `useFont` devolve fonte vazia. Os mocks estão em `test/setup/`.

## Índice

- [docs/prd/](docs/prd/prd-000-visao-de-produto.md) — requisitos de produto (000 a 004)
- [docs/arquitetura.md](docs/arquitetura.md) — camadas, mapa de módulos, modelo de estado, threads, telas
- [docs/adr/](docs/adr/0000-template.md) — decisões arquiteturais
- [docs/roadmap.md](docs/roadmap.md) — marcos e dívida de verificação
- [CHANGELOG.md](CHANGELOG.md) — o que entrou
- [docs/design/](docs/design/README.md) — registro visual; a [anatomia das telas](docs/design/proposta-de-anatomia.md), aprovada
