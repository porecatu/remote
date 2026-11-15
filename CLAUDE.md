# CLAUDE.md

Guia operacional do projeto. Leia antes de mexer em qualquer coisa.

## O que é

**Porecatu Remote** — app mobile (Android e iOS), em Expo/React Native e TypeScript, que se conecta a um [Porecatu](https://github.com/porecatu/terminal) desktop através de um [Porecatu Relay](https://github.com/porecatu/relay) auto-hospedado, para ver e controlar a sessão viva do desktop: workspace (janelas, grupos, fixadas, abas, painéis), grade do terminal, input e gestão de abas.

**Estado:** **só documentação** (M0 do [roadmap](docs/roadmap.md)). Nenhum código, nenhum `package.json`. O primeiro código é o spike do M1, que decide o [ADR-0002](docs/adr/0002-render-da-grade-com-skia.md).

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
| Protocolo e cripto | `@porecatu/protocol`, que usa `@noble/*` e `cbor-x` — **JS puro, nenhum módulo nativo próprio** | [0004](docs/adr/0004-criptografia-em-js-puro.md) |
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

Código (quando existir, M1): lint, `tsc --noEmit`, testes unitários e os vetores do protocolo. Os comandos exatos entram aqui no PR que criar o `package.json`.

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

- **Nenhuma tela sem aval visual do dono do produto.** Não há especificação visual ainda ([docs/design/](docs/design/README.md)).
- **A grade usa o tema do desktop** (mensagem `theme`): fundo, frente, cursor, seleção, as 16 cores e a paleta de grupos vêm de lá. O app não inventa paleta de terminal.
- Nenhuma cor, dimensão ou espaçamento do chrome do app é inventado no código: sai de tokens definidos em `docs/design/` quando eles existirem.

## Armadilhas conhecidas

- **Nunca registrar em log** grade, scrollback, teclas, texto colado, títulos, diretórios ou chaves — nem em `console.log` de depuração que "depois sai". O relay é cego; o app não pode ser o vazamento. Log só de eventos (conectou, caiu, código de erro).
- **Chave privada só no armazenamento seguro** ([ADR-0003](docs/adr/0003-chaves-no-armazenamento-seguro.md)): nunca em `AsyncStorage`, em arquivo, em estado global serializável nem em relatório de crash.
- **Render da grade não recria texto por célula por quadro.** O modelo guarda linhas já agrupadas em spans; o render reaproveita o que não mudou e só redesenha as linhas que o `grid-diff` tocou. Medir sempre com grade grande (200×60) em Android intermediário.
- **Ack de grade é obrigatório.** Sem `grid-ack`, o desktop para de mandar a grade daquela assinatura depois de duas mensagens ([mensagens §5.4](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)). Confirmar **depois** de aplicar, não ao receber.
- **Snapshot pode chegar a qualquer momento** (o desktop redimensionou, entrou na tela alternativa): o modelo da grade aceita `grid-snapshot` no meio de uma sequência de diffs e reinicia o `seq`.
- **`max_subscriptions` vem do `welcome`**, não é constante do app.
- **Coluna de caractere sem segmentar grafemas**: o *i*-ésimo code point de um span comum está em `col + i × width`; grafema de vários code points vem sozinho num span. O Hermes não tem `Intl.Segmenter` confiável — não dependa dele.
- **Ids do protocolo reiniciam quando o Porecatu reinicia.** Nunca persistir `tab-id`/`pane-id` entre sessões como se fossem estáveis.
- **App em segundo plano**: o sistema operacional derruba o WebSocket. Ao voltar, reconectar e reconstruir tudo a partir do `workspace` e de novos `grid-snapshot`; nunca supor que o estado antigo continua valendo.

## Índice

- [docs/prd/](docs/prd/prd-000-visao-de-produto.md) — requisitos de produto (000 a 004)
- [docs/arquitetura.md](docs/arquitetura.md) — camadas, modelo de estado, threads, telas
- [docs/adr/](docs/adr/0000-template.md) — decisões arquiteturais
- [docs/roadmap.md](docs/roadmap.md) — marcos e dívida de verificação
- [docs/design/](docs/design/README.md) — registro visual (vazio por ora)
