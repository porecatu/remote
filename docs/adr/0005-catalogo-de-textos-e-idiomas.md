# ADR-0005 — Catálogo de textos da interface, `en_US` padrão e `pt_BR`

**Status:** Aceito
**Data:** 2026-11-15
**Relacionados:** [ADR-0001](0001-expo-e-typescript.md), [PRD-000](../prd/prd-000-visao-de-produto.md), [mensagens §1](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)

## Contexto

O Porecatu desktop tem uma regra que o app herda por coerência e por necessidade: **frase de interface nunca é escrita no código**. Lá, o catálogo vive em arquivos TOML por idioma, o padrão é `en_US`, e um teste reprova prosa no código (ADR-0056 do [Porecatu](https://github.com/porecatu/terminal)).

No app a regra é ainda mais necessária, porque o protocolo **não manda prosa**: todo erro e motivo chega como código (`error-code`, `goodbye-reason`, `pair-rejected.reason`), e o app é quem compõe o texto. Sem catálogo, cada tela escreveria a sua tradução de `busy` ou `not-paired`.

## Decisão

**Todo texto de interface sai de um catálogo de mensagens tipado, com um arquivo por idioma; o padrão é `en_US`, e `pt_BR` é obrigatório desde o primeiro texto. Código de erro do protocolo tem uma mensagem no catálogo por valor.**

1. **Um arquivo por idioma**, `locales/en_US.json` e `locales/pt_BR.json`, **embutidos no app** (no app não há o que o usuário edite em disco, ao contrário do desktop).
2. **Identificadores tipados**: as chaves do `en_US` geram o tipo das chaves; um teste reprova chave que falta em qualquer idioma e chave sobrando.
3. **Idioma** segue o do sistema quando existe no catálogo, senão `en_US`; o usuário pode escolher nas configurações do app.
4. **Plural e interpolação** pela API `Intl.PluralRules` (disponível no Hermes) e por marcadores nomeados (`{count}`), nunca concatenação.

   > **Revisão (2026-11-16, na implementação):** o plural **não** usa `Intl.PluralRules`. O suporte do Hermes a `Intl` não é garantido em todas as versões e plataformas, e os dois idiomas do catálogo só precisam das categorias `one` e `other`; as regras estão escritas à mão em `src/i18n/plural.ts`: em `en_US`, `one` só para n = 1; em `pt_BR`, `one` quando a parte inteira é 0 ou 1 (regra `i = 0..1` do CLDR). As chaves de plural são pares `<base>.one`/`<base>.other` no catálogo. A interpolação por marcadores nomeados (`{count}`) segue como escrito.
5. **Mapa completo de códigos**: cada valor de `error-code`, `goodbye-reason`, `pair-rejected.reason`, `close-reason` e dos estados de painel tem uma mensagem; um teste percorre os enums do `@porecatu/protocol` e reprova valor sem mensagem.
6. **Terminologia**: "abas", nunca "guias", em `pt_BR` — com teste, como no Porecatu.
7. **Teste de prosa no código**: o lint reprova literal de texto em JSX fora do catálogo.

## Alternativas consideradas

- **`i18next` com `react-i18next`.** Popular e completo. Rejeitado como base: tipagem das chaves exige configuração adicional e o app precisa de pouco; um catálogo próprio de poucas dezenas de linhas cobre e é auditável. Pode ser revisto por ADR se a necessidade crescer.
- **Só inglês no v1.** Menos trabalho. Rejeitado: o dono do produto escreve em português, e acrescentar idioma depois de espalhar texto custa mais do que começar com dois.

## Consequências

### Positivas

- Códigos do protocolo viram texto num lugar só, nos dois idiomas, com garantia de cobertura.

### Negativas

- Toda tela nova mexe em dois arquivos de idioma.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Código novo no protocolo sem mensagem | Média | Baixo | Teste sobre os enums do pacote reprova ao subir a versão |
