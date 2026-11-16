# ADR-0003 — Chaves do aparelho em `expo-secure-store` (Keychain e Keystore)

**Status:** Aceito
**Data:** 2026-11-15
**Relacionados:** [ADR-0001](0001-expo-e-typescript.md), [ADR-0004](0004-criptografia-em-js-puro.md), [PRD-001](../prd/prd-001-desktops-e-pareamento.md), [handshake §1](https://github.com/porecatu/protocol/blob/main/docs/especificacao/02-handshake-e-pareamento.md), [modelo de ameaça](https://github.com/porecatu/protocol/blob/main/docs/especificacao/modelo-de-ameaca.md)

## Contexto

O app guarda dois tipos de dado:

1. **A chave privada estática do aparelho** (X25519, 32 bytes). Quem a tem é o aparelho para todo desktop pareado, até a revogação: digita em terminais, executa comandos.
2. **A lista de desktops pareados**: para cada um, URL do relay, `host_id`, chave **pública** do desktop, nome do desktop e um apelido local, mais o estado da última conexão. Não é segredo no sentido criptográfico (as chaves são públicas), mas revela que relays e máquinas o usuário usa, e a chave pública do desktop é o que impede um relay de se passar por ele: **adulterá-la** é atacar o pareamento.

O [modelo de ameaça](https://github.com/porecatu/protocol/blob/main/docs/especificacao/modelo-de-ameaca.md) conta com que um celular **bloqueado** nas mãos de terceiros não entregue nada, e com que a chave nunca saia do aparelho.

## Decisão

**A chave privada do aparelho e a lista de desktops moram no `expo-secure-store`, que usa o Keychain no iOS e o Keystore no Android (o valor é cifrado com AES-GCM por uma chave guardada no Android Keystore, e o texto cifrado fica nas `SharedPreferences` privadas do app), com acessibilidade "só depois do primeiro desbloqueio, só neste aparelho". Nada disso vai para `AsyncStorage`, arquivo comum, backup ou estado serializável.**

> **Correção factual (2026-11-16):** a primeira redação dizia "Keystore (com `EncryptedSharedPreferences`)". O `expo-secure-store` 58.0.3 não usa `EncryptedSharedPreferences`: cifra cada valor com uma chave AES do Android Keystore (`AESEncryptor`) e grava o resultado em `SharedPreferences` comuns do app. A proteção continua sendo a do Keystore; a decisão não muda.

1. **Chave privada**: um item, `device.static_key`, com `keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (fica fora do backup do iCloud e não migra para outro aparelho). Lida para a memória só durante a sessão e nunca colocada em *store* de estado, log ou relatório de crash.
2. **Lista de desktops**: um item, `desktops.v1`, com um JSON pequeno (o limite prático do Secure Store no Android é de alguns KB por item; dez desktops cabem com folga). Versão no nome do item para migração.
3. **Sem backup do sistema**: `allowBackup="false"` no Android e os itens com `THIS_DEVICE_ONLY` no iOS. Trocar de celular é **parear de novo** — é o comportamento certo para uma chave de acesso.
4. **Exigência de biometria no item: não.** O bloqueio por biometria do [PRD-001](../prd/prd-001-desktops-e-pareamento.md) RF-1.17 é do **app** (`expo-local-authentication`), não do item do Keychain: exigir biometria por leitura quebraria a reconexão automática ao voltar do segundo plano. A proteção do item é o bloqueio do aparelho.
5. **Recriar identidade** apaga os dois itens.

> **Nota de implementação (2026-11-16):** o código guarda um **terceiro** item no mesmo armazenamento e com a mesma acessibilidade: `settings.v1`, as configurações do app (idioma, bloqueio, vibração da campainha), para que nada persistente do app fique fora do Secure Store. O conjunto de itens é fechado no tipo `SecureStoreKey` de `src/storage/secureStore.ts` (`device.static_key`, `desktops.v1`, `settings.v1`), e a lista de desktops tem teto de 20 entradas (`MAX_DESKTOPS` em `src/storage/desktopList.ts`). `android.allowBackup = false` está em `app.config.ts`.

## Alternativas consideradas

- **`AsyncStorage` cifrado com uma chave no Secure Store.** Mais espaço para a lista. Rejeitado: duas camadas para guardar poucos KB, e o ganho de espaço não é necessário.
- **Chave não exportável do hardware (Secure Enclave / StrongBox).** O ideal de segurança. Rejeitado no v1: o Secure Enclave não faz X25519 (só P-256), e o Noise do protocolo é `25519`; usar a chave de hardware exigiria trocar a curva no protocolo e um módulo nativo ([ADR-0004](0004-criptografia-em-js-puro.md)).
- **Exigir biometria em cada leitura do item.** Mais forte contra celular desbloqueado. Rejeitado pelo item 4: quebra a reconexão automática, e o bloqueio do app cobre o mesmo cenário.

## Consequências

### Positivas

- Chave protegida pelo bloqueio do aparelho, fora de backup, sem código nativo nosso.

### Negativas

- A chave passa pela memória do JS durante a sessão (o Noise em JS puro precisa dela); um atacante com execução de código no app a lê. Aceito: com execução de código no app, ele já controla as sessões.
- Trocar de aparelho exige reparear todos os desktops.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Limite de tamanho do Secure Store no Android estourar com muitos desktops | Baixa | Baixo | Teto de 20 desktops na lista; acima disso, item por desktop |
| Item perdido em atualização de sistema ou restauração | Baixa | Médio | O app detecta a falta da chave e oferece recriar identidade e reparear |
