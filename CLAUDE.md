# CLAUDE.md

Guia operacional do projeto. Leia antes de mexer em qualquer coisa.

## O que é

**Porecatu Remote** — app mobile (Android e iOS), em Expo/React Native e TypeScript, que se conecta a um [Porecatu](https://github.com/porecatu/terminal) desktop através de um [Porecatu Relay](https://github.com/porecatu/relay) auto-hospedado, para ver e controlar a sessão viva do desktop: workspace (janelas, grupos, fixadas, abas, painéis), grade do terminal, input e gestão de abas.

**Estado (2026-11-16):** **só a camada de lógica, nenhuma tela** — decisão do dono para a implementação inicial. Expo SDK 58, TypeScript 6.0.3, `zustand` *vanilla*, testes com `jest-expo`: `pnpm test` roda **651 testes em 39 suítes**, todos verdes, em Node. O `@porecatu/protocol` 0.1.0 vem de `vendor/porecatu-protocol-0.1.0.tgz` (tarball gerado no repositório do protocolo; vira dependência publicada depois). O mapa de módulos está na [arquitetura §1](docs/arquitetura.md); o que entrou, no [CHANGELOG](CHANGELOG.md).

- **Implementado e verificado só por teste automatizado em Node:** conexão (socket do relay, ciclo da sessão, reconexão, presença), store por desktop e registro, pareamento e *deep link*, armazenamento seguro, identidade, lista de desktops e configurações, bloqueio do app, seletores e busca da árvore, expansão local de grupos, modelo da grade, scrollback, resolução de cor, input (modificadores, barra, colar, envio), as 13 ações, pedidos pendentes e confirmações, catálogo `en_US`/`pt_BR`, logger. E o desktop falso `tools/fake-host/` (`pnpm fake-host`).
- **Dívida de verificação** (detalhe no [roadmap](docs/roadmap.md)): telas; protótipo de render com Skia em aparelho (o [ADR-0002](docs/adr/0002-render-da-grade-com-skia.md) segue Proposto); app em aparelho real contra o desktop falso; *development build*, build EAS e lojas; módulos nativos de verdade (testados só por trás de interfaces injetadas); a ligação de `SubscriptionSet`, `InputSender`, pareamento, presença e bloqueio ao store de sessão, que entra com as telas.
- A [proposta de anatomia](docs/design/proposta-de-anatomia.md) das telas **aguarda o aval visual do dono**: nenhuma tela é implementada e nenhum valor dela vale até a aprovação.
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
3. **O app não muda o foco do desktop.** Ver uma aba no celular não ativa aquela aba no computador.
4. **Input é semântico.** O app manda tecla nomeada + modificadores, texto e colar; quem codifica em bytes é o desktop.
5. **Perguntas de SSH (senha, chave do servidor) são respondidas só no desktop** no v1: o app mostra o painel em `connecting` e avisa.
6. **Nenhuma prosa no fio.** Erros chegam como `error-code`; o texto que o usuário lê é composto aqui, pelo catálogo.

## Stack travada

Cada item tem ADR em [docs/adr/](docs/adr/0000-template.md). Não troque nenhum sem ADR novo.

| Peça | Escolha | ADR |
|---|---|---|
| Framework | **Expo** (SDK pinado em versão exata), React Native, motor **Hermes**, desenvolvimento por *development build* e build por EAS | [0001](docs/adr/0001-expo-e-typescript.md) |
| Linguagem | **TypeScript** em modo `strict`, sem `any` implícito | [0001](docs/adr/0001-expo-e-typescript.md) |
| Render da grade | `@shopify/react-native-skia` — **Proposto**, pendente do spike | [0002](docs/adr/0002-render-da-grade-com-skia.md) |
| Chaves | `expo-secure-store` (Keychain no iOS, Keystore no Android) | [0003](docs/adr/0003-chaves-no-armazenamento-seguro.md) |
| Protocolo e cripto | `@porecatu/protocol`, que usa `@noble/*` e um codificador CBOR próprio — **JS puro, nenhum módulo nativo próprio** | [0004](docs/adr/0004-criptografia-em-js-puro.md) |
| Estado | `zustand` na forma *vanilla* (`zustand/vanilla`), um store por desktop aberto, fora do React | [0001](docs/adr/0001-expo-e-typescript.md) item 7 |
| Aleatoriedade | `crypto.getRandomValues` de `expo-crypto`, instalado em `src/polyfills.ts` antes de qualquer import do protocolo; nunca `Math.random` (o lint reprova) | [0004](docs/adr/0004-criptografia-em-js-puro.md) |
| Leitura do QR | `expo-camera` (leitor de código de barras embutido) e *deep link* `porecatu://` | [0001](docs/adr/0001-expo-e-typescript.md) |
| Textos | Catálogo de mensagens próprio, `en_US` padrão e `pt_BR` | [0005](docs/adr/0005-catalogo-de-textos-e-idiomas.md) |
| Licença | GPL-3.0-or-later com DCO | [0006](docs/adr/0006-licenca-gpl-e-lojas.md) |
| Toolchain | Node, gerenciador de pacotes e Expo SDK pinados | [0007](docs/adr/0007-toolchain-pinada.md) |

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

- **Nenhuma tela sem aval visual do dono do produto.** Não há especificação visual aprovada: a [proposta de anatomia](docs/design/proposta-de-anatomia.md) **aguarda o aval** ([docs/design/](docs/design/README.md)). Até lá, `app/` só tem o `_layout.tsx` sem conteúdo visual.
- **A grade usa o tema do desktop** (mensagem `theme`): fundo, frente, cursor, seleção, as 16 cores e a paleta de grupos vêm de lá. O app não inventa paleta de terminal.
- Nenhuma cor, dimensão ou espaçamento do chrome do app é inventado no código: sai de tokens definidos em `docs/design/` quando eles existirem.

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

## Índice

- [docs/prd/](docs/prd/prd-000-visao-de-produto.md) — requisitos de produto (000 a 004)
- [docs/arquitetura.md](docs/arquitetura.md) — camadas, mapa de módulos, modelo de estado, threads, telas
- [docs/adr/](docs/adr/0000-template.md) — decisões arquiteturais
- [docs/roadmap.md](docs/roadmap.md) — marcos e dívida de verificação
- [CHANGELOG.md](CHANGELOG.md) — o que entrou
- [docs/design/](docs/design/README.md) — registro visual; a [proposta de anatomia](docs/design/proposta-de-anatomia.md) aguarda aval
