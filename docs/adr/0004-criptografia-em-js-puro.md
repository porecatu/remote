# ADR-0004 — Protocolo e criptografia em JS puro pelo `@porecatu/protocol`, sem módulo nativo próprio

**Status:** Aceito
**Data:** 2026-11-15
**Relacionados:** [ADR-0001](0001-expo-e-typescript.md), [ADR-0003](0003-chaves-no-armazenamento-seguro.md), [ADR-0007](0007-toolchain-pinada.md), [especificação do protocolo](https://github.com/porecatu/protocol/blob/main/docs/especificacao/00-visao-geral.md)

## Contexto

O app fala um protocolo de quatro camadas: WebSocket sobre TLS, envelope do relay em CBOR, sessão Noise (`XX` para parear, `IK` para conectar) com registros fragmentados e *rekey*, e mensagens de aplicação em CBOR. Tudo isso tem uma implementação de referência em TypeScript no [porecatu/protocol](https://github.com/porecatu/protocol), testada contra os mesmos vetores que a implementação em Rust do desktop e do relay.

O app poderia reimplementar partes (é tentador escrever "só o CBOR" ou "só o handshake" ao lado do código de tela), ou usar bibliotecas nativas de criptografia (libsodium por módulo nativo) por desempenho.

## Decisão

**O app usa o pacote `@porecatu/protocol`, em versão exata, para tudo que é do fio — envelope, Noise, registros, CBOR e tipos das mensagens — e esse pacote é JavaScript puro: `@noble/curves`, `@noble/ciphers` e `@noble/hashes` para X25519, ChaCha20-Poly1305 e BLAKE2s, e um codificador CBOR determinístico do próprio pacote. O app não tem módulo nativo próprio.**

> **Correção factual (2026-11-16):** a primeira redação citava o `cbor-x` para CBOR. O `@porecatu/protocol` 0.1.0 adotado pelo app não depende do `cbor-x`: as únicas dependências de execução são `@noble/ciphers`, `@noble/curves` e `@noble/hashes` (2.4.0), e o CBOR é do próprio pacote. A decisão (JS puro, nada de codificação no app) não muda.
>
> **Nota de implementação (2026-11-16):** enquanto o pacote não está publicado, ele vem do tarball `vendor/porecatu-protocol-0.1.0.tgz`, gerado no repositório do protocolo, como dependência `file:`; passa a dependência publicada (ou git) quando o pacote sair. `src/protocol/index.ts` é o único ponto de re-export do pacote no app, e `src/protocol/testing.ts` re-exporta o kit de teste dele (relay em memória, chaves de teste). O polyfill do item 3 está em `src/polyfills.ts`, importado primeiro por `app/_layout.tsx`, que chama `assertSecureRandom()` no arranque.
>
> **Nota de implementação (2026-11-17):** o tarball foi **regerado** para a especificação 0.4 do protocolo ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)), a partir do commit `f3715bb` do repositório do protocolo, para trazer a ação `activate-tab`. É o **mesmo nome de arquivo** (`vendor/porecatu-protocol-0.1.0.tgz`) e a **mesma versão do pacote** (0.1.0): só mudaram o construtor de ações, os códigos e os tipos das mensagens, e o fio continua `[0, 1]`. A troca aparece só na integridade nova do `pnpm-lock.yaml`. Continua valendo o item 1: o app não escreveu codificação nenhuma para a ação nova, só a monta pelos tipos do pacote (`src/session/actions.ts`).

> **Nota de implementação (2026-11-20):** regerado de novo, para a especificação 0.5 ([ADR-0011 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0011-cliente-nao-muda-a-aba-ativa-e-view-tab.md)), a partir do commit `4ce7e4f` da `main` do protocolo: entra a mensagem `view-tab`, sai a ação `activate-tab`. Mesmo nome de arquivo e mesma versão do pacote; a troca aparece só na integridade do `pnpm-lock.yaml`.

> **Nota de implementação (2026-11-20, de novo):** regerado para a especificação 0.6 ([ADR-0012 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0012-sessoes-nomeadas-pelo-cliente.md)), a partir do commit `a52fbb1` da `main` do protocolo: entram `list-sessions`, `sessions`, a ação `restore-session` e os códigos 17 e 18, e o mapa de ações passa a `ActionCode`. Mesmo nome e mesma versão; só a integridade do `pnpm-lock.yaml` muda.

> **Nota de implementação (2026-11-23, de novo):** regerado para a especificação 0.7 ([ADR-0013 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0013-nova-aba-solta.md)), a partir do commit `76174da` da `main` do protocolo: `new-tab` aceita `group: null` (aba solta). Mesmo nome e mesma versão; só a integridade do `pnpm-lock.yaml` muda.

1. **Nenhuma codificação ou criptografia escrita no app.** O app chama o cliente do pacote (conectar, parear, mandar, receber) e trata mensagens tipadas.
2. **JS puro** porque roda igual no Hermes dos dois sistemas, no Node dos testes e no CI, sem *prebuild* nem compilação nativa, e porque as bibliotecas `@noble` são auditadas e sem dependências.
3. **Aleatoriedade** vem de `crypto.getRandomValues`, fornecido no Hermes por `expo-crypto` (polyfill oficial); o app instala o polyfill na entrada, antes de qualquer import do pacote.
4. **Desempenho**: o volume é de dezenas de KB/s por sessão (grade com controle de fluxo); ChaCha20-Poly1305 em JS dá folga de ordens de grandeza para isso. O spike do M1 mede o custo de decifrar e decodificar 30 diffs/s junto com o render.
5. **Divergência com a spec** encontrada no app é corrigida **no pacote**, no repositório do protocolo, nunca com remendo local.

## Alternativas consideradas

- **libsodium por módulo nativo (`react-native-libsodium`).** Mais rápido e maduro. Rejeitado: módulo nativo de terceiros acoplado à versão do React Native, sem ganho que o volume de dados justifique, e o Noise teria de ser montado em cima de qualquer jeito.
- **Implementar o cliente do protocolo no app.** Menos uma dependência. Rejeitado: duas implementações em TypeScript do mesmo protocolo divergem; os vetores de teste existem justamente para haver uma.
- **WebCrypto.** Padrão. Rejeitado: o Hermes não tem `crypto.subtle` completo, e X25519/ChaCha20 não estão em todo WebCrypto.

## Consequências

### Positivas

- O mesmo código do protocolo roda no app, nos testes em Node e no CI do repositório do protocolo, contra os vetores.
- Nenhum passo nativo a mais no build.

### Negativas

- A chave privada passa pela memória do JS ([ADR-0003](0003-chaves-no-armazenamento-seguro.md)).
- Atualizar o protocolo exige publicar o pacote antes de atualizar o app.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Custo de CPU da cripto em JS em aparelho fraco | Baixa | Médio | Medido no spike; o controle de fluxo da spec limita o volume |
| Polyfill de aleatoriedade ausente ou fraco | Baixa | Crítico | Teste de inicialização que falha se `getRandomValues` não existir; nunca `Math.random` |
