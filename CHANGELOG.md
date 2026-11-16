# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento seguirá [SemVer](https://semver.org/lang/pt-BR/) a partir da
primeira versão publicada nas lojas.

## [Não lançado]

Implementação inicial: **só a camada de lógica, nenhuma tela**. Telas dependem
do aval visual do dono e o render da grade, do spike do
[ADR-0002](docs/adr/0002-render-da-grade-com-skia.md). Tudo o que entrou é
verificado por teste automatizado em Node (`pnpm test`: 651 testes em 39
suítes); nada foi rodado num aparelho. Dívida de verificação no
[roadmap](docs/roadmap.md).

### Adicionado

- **Projeto Expo** SDK 58 (React Native 0.88.1, React 19.3.0, Hermes,
  `expo-router`, *development build*) em TypeScript 6.0.3 estrito, com Node
  26.13.0, pnpm 12.17.0 e todas as dependências em versão exata
  ([ADR-0001](docs/adr/0001-expo-e-typescript.md),
  [ADR-0007](docs/adr/0007-toolchain-pinada.md)). `app/_layout.tsx` mínimo, sem
  conteúdo visual. Identificador `br.com.porecatu.remote` e textos das
  permissões nativas **provisórios**.
- **Protocolo** pelo `@porecatu/protocol` 0.1.0, vindo de
  `vendor/porecatu-protocol-0.1.0.tgz` enquanto o pacote não é publicado;
  `src/protocol/` é o único ponto de re-export. Aleatoriedade por
  `expo-crypto`, instalada antes do pacote e conferida no arranque
  ([ADR-0004](docs/adr/0004-criptografia-em-js-puro.md)).
- **Conexão**: socket do relay sobre o WebSocket do React Native, ciclo da
  sessão (`connecting` → `handshaking` → `greeting` → `ready`) com reconexão em
  1, 2, 4, 8 e 16 s, fechamento depois de 30 s em segundo plano, consulta de
  presença a cada 30 s e um store `zustand` por desktop aberto
  ([PRD-002](docs/prd/prd-002-navegacao-do-workspace.md)).
- **Pareamento**: identidade do aparelho no Secure Store, impressão digital,
  fluxo `XX` com conferência da chave do desktop contra o QR, *deep link*
  `porecatu://pair` retido enquanto o app está bloqueado, e lista de até 20
  desktops ([PRD-001](docs/prd/prd-001-desktops-e-pareamento.md),
  [ADR-0003](docs/adr/0003-chaves-no-armazenamento-seguro.md)).
- **Bloqueio do app** por biometria ou código do aparelho, ligado por padrão,
  com novo bloqueio depois de 1 minuto em segundo plano; aparelho sem bloqueio
  abre o app com um aviso permanente (RF-1.20).
- **Workspace**: seletores da árvore, busca por título, grupo, `cwd` e
  `usuário@host`, miniatura da disposição dos painéis e expansão local de
  grupos colapsados no desktop.
- **Grade**: modelo com estilos internados e linhas sujas, `grid-ack` depois de
  aplicar, `max_subscriptions` do `welcome`, scrollback paginado indexado pela
  posição absoluta da linha, e resolução de cor pelo `theme` com esmaecido de
  fator 0,66 ([PRD-003](docs/prd/prd-003-terminal.md)).
- **Input**: modificadores com trava, barra de teclas, `key`/`text-input`/`paste`
  só para painel assinado e `running`, teto de 1 MiB por envio e confirmação
  do colar sempre que houver quebra de linha, com prévia de 5 linhas × 120
  caracteres.
- **Gestão de abas**: as 13 ações da spec, pendência por item, espera da aba
  criada e confirmações de fechamento com prazo de 60 s
  ([PRD-004](docs/prd/prd-004-gestao-de-abas.md)).
- **Catálogo de textos** `en_US` e `pt_BR` com chaves tipadas, plural escrito à
  mão e mensagem para todo código do protocolo
  ([ADR-0005](docs/adr/0005-catalogo-de-textos-e-idiomas.md)).
- **Logger único** que só registra eventos e códigos, nunca conteúdo.
- **Desktop falso** (`pnpm fake-host`): relay e desktop num processo Node em
  `127.0.0.1`, com URI e QR em texto, para desenvolver o app sem o Porecatu.
- **CI**: `typecheck`, `lint` e `test`; links da documentação, cabeçalhos SPDX,
  licenças das dependências de produção e DCO; Dependabot.

### Documentação

- Docs reconciliados com o código: `seq` fora de sequência é erro de protocolo
  (PRD-003 RF-3.2 revisado), `last-tab` no PRD-004 (RF-4.11), plural escrito à
  mão (ADR-0005), Keystore sem `EncryptedSharedPreferences` (ADR-0003), CBOR do
  próprio pacote (ADR-0004), pnpm sem Corepack (ADR-0007), e as decisões do
  dono de 2026-11-16 registradas nos PRDs.
- [Proposta de anatomia](docs/design/proposta-de-anatomia.md) das telas,
  **aguardando o aval do dono**.
