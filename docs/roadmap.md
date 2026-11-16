# Roadmap

Marcos de entrega do v1 do Porecatu Remote. Cada marco tem **critério de saída explícito**; enquanto ele não for atendido, o marco não terminou.

O app depende de duas outras peças que andam em paralelo, em repositórios próprios: o pacote `@porecatu/protocol` ([porecatu/protocol](https://github.com/porecatu/protocol)) e o acesso remoto no Porecatu desktop ([porecatu/terminal](https://github.com/porecatu/terminal)). As dependências estão marcadas em cada marco.

| Marco | Status |
|---|---|
| M0 — Documentação inicial | **fechado** |
| M1 — Spike de render e integração do protocolo | **em andamento**: projeto, CI, catálogo e integração do protocolo em Node entregues; spike de render e *development build* pendentes |
| M2 — Pareamento e navegação (só leitura) | **lógica entregue** (sem telas, aval visual pendente) |
| M3 — Terminal com input | **lógica entregue** (sem telas) |
| M4 — Gestão de abas | **lógica entregue** (sem telas) |
| M5 — Publicação nas lojas | planejado |

### Implementação inicial (2026-11-16): só a camada de lógica

Por decisão do dono para esta fase, entrou **só lógica, nenhuma tela**: telas dependem do aval visual ([design](design/README.md)) e o render, do spike do [ADR-0002](adr/0002-render-da-grade-com-skia.md). Nenhum critério de saída de M1 a M4 está atendido, porque todos pedem algo na tela de um aparelho. O que está verificado é por **teste automatizado em Node**: `pnpm test` com **651 testes em 39 suítes**, todos passando; o protocolo foi verificado no repositório dele (vetores e teste cruzado Rust↔TypeScript). A [proposta de anatomia](design/proposta-de-anatomia.md) das telas existe e **aguarda o aval do dono**.

Dívida de verificação de toda a implementação inicial (vale para cada marco abaixo):

| Item | Por quê |
|---|---|
| Telas | Não existem; dependem do aval visual da proposta de anatomia |
| Protótipo de render com Skia em aparelho | O spike do ADR-0002 não foi feito; não há Skia no projeto |
| App em aparelho real contra o desktop falso | Sem telas e sem *development build*, nada foi rodado num celular |
| *Development build* e build EAS nos dois sistemas | Sem Android SDK nem Mac nesta máquina; nada foi compilado para aparelho |
| Módulos nativos de verdade | `expo-secure-store` e `expo-local-authentication` foram testados só por trás de interfaces injetadas, com dublês em memória; `expo-camera`, `expo-screen-capture`, `expo-haptics`, `expo-clipboard` e `expo-device` estão declarados mas ainda não são usados por código nenhum |
| Composição das peças | `SubscriptionSet`, `InputSender`, pareamento, *deep link*, presença e bloqueio ainda não estão ligados ao store de sessão ([arquitetura](arquitetura.md) §1) |
| Contra um Porecatu real | O acesso remoto do desktop não existe ainda; a lógica só falou com o relay em memória do pacote e com o desktop falso |

Pendências que não são de verificação:

| Item | Situação |
|---|---|
| Identificador do app `br.com.porecatu.remote` (iOS `bundleIdentifier` e Android `package`) | **Provisório** em `app.config.ts`; decidir antes do primeiro build de loja (M5), porque não muda depois de publicado |
| Textos das permissões nativas (câmera, Face ID) em `app.config.ts` | **Provisórios**, em inglês e fora do catálogo; decididos com o aval visual e traduzidos antes do M5 |
| `@porecatu/protocol` vindo de `vendor/porecatu-protocol-0.1.0.tgz` | Passa a dependência publicada (ou git) quando o pacote for publicado ([ADR-0004](adr/0004-criptografia-em-js-puro.md)) |
| Mensagem do catálogo para input recusado por tamanho (`too-large`, 1 MiB) | O código recusa ([PRD-003](prd/prd-003-terminal.md) RF-3.25), mas o catálogo ainda não tem o texto; entra com a tela do terminal |

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

- Projeto Expo SDK 58 (React Native 0.88.1, React 19.3.0, TypeScript 6.0.3 estrito, `expo-router`) com a toolchain do ADR-0007: Node 26.13.0, pnpm 12.17.0, dependências exatas, lockfile. `app/_layout.tsx` mínimo, sem conteúdo visual.
- CI (`.github/workflows/ci.yml`): `typecheck`, `lint` e `test`; verificação de links, de cabeçalhos SPDX (`scripts/check-spdx.py`) e de licenças das dependências de produção (`scripts/check-licenses.mjs`); DCO nos PRs. Dependabot.
- Integração do pacote: `@porecatu/protocol` 0.1.0 pelo tarball em `vendor/`, re-exportado só por `src/protocol/`; aleatoriedade por `expo-crypto` instalada antes do pacote, com checagem no arranque.
- Desktop falso em Node (`tools/fake-host/`, `pnpm fake-host`): relay e desktop num processo, em `127.0.0.1`, com URI e QR em texto, workspace de duas janelas e um painel vivo de 200×60 ([arquitetura](arquitetura.md) §8).
- Catálogo `en_US`/`pt_BR` com chaves tipadas, plural escrito à mão, completude entre idiomas, cobertura de todos os códigos do protocolo e o teste de "abas" ([ADR-0005](adr/0005-catalogo-de-textos-e-idiomas.md)).

**Falta:** o spike de render (nenhum Skia no projeto), o *development build* nos dois sistemas, a definição dos aparelhos de referência e o app desenhando uma grade do desktop falso. **Dívida de verificação:** a da tabela da implementação inicial, acima.

## M2 — Pareamento e navegação (só leitura)

**Depende de:** acesso remoto do Porecatu desktop com pareamento e envio de `workspace` e grade.

- [PRD-001](prd/prd-001-desktops-e-pareamento.md) inteiro: identidade, QR pela câmera e por *deep link*, confirmação, lista de desktops, bloqueio por biometria.
- [PRD-002](prd/prd-002-navegacao-do-workspace.md) inteiro: sessão, reconexão, árvore, busca, tema.
- [PRD-003](prd/prd-003-terminal.md) só a parte de leitura: grade ao vivo, zoom, rolagem, histórico, estados do painel (sem input, sem `start-pane`).
- Aval visual do dono para as telas do M2 antes de implementá-las ([design](design/README.md)).

**Critério de saída:** com um Porecatu real, parear, ver o workspace mudar ao vivo e acompanhar a saída de um build numa aba, nos dois sistemas.

**Lógica entregue (2026-11-16), sem telas:** identidade do aparelho e impressão digital (`src/storage/deviceIdentity.ts`); fluxo de pareamento como máquina de estados pura, com validação da URI, conferência da chave do desktop contra o QR e prazos (`src/pairing/pairingFlow.ts`); *deep link* `porecatu://pair` retido enquanto o app está bloqueado (`src/pairing/deepLink.ts`); lista de desktops com teto de 20 e estado da última conexão (`src/storage/desktopList.ts`); presença a cada 30 s (`src/net/presence.ts`); bloqueio do app, inclusive o aparelho sem bloqueio (RF-1.20) (`src/security/`); ciclo da conexão com reconexão 1, 2, 4, 8 e 16 s e fechamento após 30 s em segundo plano (`src/session/lifecycle.ts`); store por desktop e registro (`src/session/sessionStore.ts`, `registry.ts`); seletores da árvore, busca, miniatura de painéis e expansão local de grupos (`src/workspace/`); modelo da grade, scrollback e resolução de cor (`src/grid/`); assinaturas com `grid-ack` depois de aplicar e `max_subscriptions` do `welcome` (`src/session/subscription.ts`).

**Falta:** as telas (aval visual), o render, a câmera, a cobertura da tela no seletor de apps (RF-1.19) e o critério de saída inteiro. **Dívida de verificação:** a da tabela da implementação inicial.

## M3 — Terminal com input

- Resto do [PRD-003](prd/prd-003-terminal.md): teclado, barra de teclas especiais, modificadores com trava, colar, campainha, `start-pane`.
- Testes nos teclados mais comuns (Gboard, SwiftKey, teclado da Samsung, teclado do iOS) e com ditado.

**Critério de saída:** usar `vim`, `htop` e um `git commit` interativo pelo celular, num Porecatu real.

**Lógica entregue (2026-11-16), sem telas:** modificadores com trava e barra de teclas (`src/input/modifiers.ts`, `keyBar.ts`); montagem de `key`, `text-input` e `paste` só para painel assinado e `running`, com teto de 1 MiB (`src/input/send.ts`); confirmação do colar com prévia (`src/input/paste.ts`); decisão de vibrar na campainha (`src/session/subscription.ts`); ação `start-pane` (`src/session/actions.ts`).

**Falta:** o campo de captura do teclado, a barra na tela, a vibração de fato e os testes nos teclados. **Dívida de verificação:** a da tabela da implementação inicial, mais os teclados de terceiros.

## M4 — Gestão de abas

- [PRD-004](prd/prd-004-gestao-de-abas.md) inteiro: nova aba com perfil, fechar com `confirm-request`, renomear, mover entre grupos e janelas, ações de grupo.

**Critério de saída:** cada ação do PRD-004 exercitada contra um Porecatu real, conferindo no desktop que o resultado é o do gesto local e que o foco do desktop não mudou.

**Lógica entregue (2026-11-16), sem telas:** as 13 ações da spec (`src/session/actions.ts`); pedidos pendentes por item, espera da aba criada aparecer no `workspace` e classificação dos erros, inclusive `last-tab` (RF-4.11) (`src/session/requests.ts`); confirmações com prazo de 60 s (`src/session/confirm.ts`). O desktop falso responde `unsupported` a toda ação, então nenhuma ação foi vista surtindo efeito.

**Falta:** os menus e folhas, o diálogo de confirmação e o critério de saída inteiro. **Dívida de verificação:** a da tabela da implementação inicial.

## M5 — Publicação nas lojas

Android e iOS no **mesmo marco** (o Expo constrói os dois).

- Contas de desenvolvedor, ícones, textos das lojas nos dois idiomas, política de privacidade (o app não coleta dados).
- Teste interno: Google Play (teste interno) e TestFlight.
- Tag da versão no repositório e link do código-fonte na tela "Sobre" ([ADR-0006](adr/0006-licenca-gpl-e-lojas.md)).

**Critério de saída:** a mesma versão aprovada nas duas lojas, ou o motivo de recusa registrado aqui com a decisão tomada.

---

## Dívida de verificação prevista

Registrada desde já, para não ser descoberta depois:

| Item | Por quê |
|---|---|
| Tablets e telas dobráveis | Layout de celular apenas no v1 |
| Leitor de tela (TalkBack, VoiceOver) na grade | O canvas do Skia não expõe texto; precisa de camada de acessibilidade própria ([ADR-0002](adr/0002-render-da-grade-com-skia.md)) |
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
