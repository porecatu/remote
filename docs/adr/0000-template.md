# ADR-0000 — Template e índice

## Índice de decisões

| # | Título | Status |
|---|--------|--------|
| [0001](0001-expo-e-typescript.md) | Expo (React Native) com TypeScript estrito, Hermes e development build | Aceito |
| [0002](0002-render-da-grade-com-skia.md) | Render da grade com `@shopify/react-native-skia` | Proposto — decidido pelo spike do M1 |
| [0003](0003-chaves-no-armazenamento-seguro.md) | Chaves do aparelho em `expo-secure-store` (Keychain e Keystore) | Aceito |
| [0004](0004-criptografia-em-js-puro.md) | Protocolo e criptografia em JS puro pelo `@porecatu/protocol`, sem módulo nativo próprio | Aceito |
| [0005](0005-catalogo-de-textos-e-idiomas.md) | Catálogo de textos da interface, `en_US` padrão e `pt_BR` | Aceito |
| [0006](0006-licenca-gpl-e-lojas.md) | GPL-3.0-or-later com DCO e o risco das lojas | Aceito |
| [0007](0007-toolchain-pinada.md) | Toolchain pinada: Node, gerenciador de pacotes, Expo SDK e dependências exatas | Aceito |

## Convenção

- Numeração sequencial de quatro dígitos, nunca reaproveitada.
- Nome do arquivo: `NNNN-titulo-em-kebab-case.md`.
- Status possíveis: `Proposto`, `Aceito`, `Rejeitado`, `Superseded by ADR-NNNN`.
- Decisão aceita não se edita. Para mudar, escreva um ADR novo com `Supersedes: ADR-NNNN` e marque o antigo. Correção de erro factual ou de clareza no texto é permitida; mudança de decisão, não. Revisão parcial de uma seção aceita entra como blockquote de revisão na própria seção, apontando o ADR novo.
- Ao adicionar um ADR, atualize a tabela acima e, se a decisão for de stack, a tabela "Stack travada" do [CLAUDE.md](../../CLAUDE.md).
- Decisão que muda o **protocolo** não é deste repositório: vai para um ADR do [porecatu/protocol](https://github.com/porecatu/protocol).

---

## Template

```markdown
# ADR-NNNN — Título

**Status:** Proposto | Aceito | Rejeitado | Superseded by ADR-MMMM
**Data:** AAAA-MM-DD
**Relacionados:** ADR-XXXX, PRD-YYY

## Contexto

Qual é a força em jogo. O que torna esta decisão necessária agora, e o que
acontece se ela não for tomada. Requisitos e restrições concretos, não
generalidades.

## Decisão

O que foi decidido, em voz ativa e no presente. Uma frase, se possível.
Depois, os detalhes que a tornam acionável.

## Alternativas consideradas

Para cada alternativa séria: o que era, por que era plausível, e o motivo
específico de não ter sido escolhida. Alternativa sem motivo de rejeição
não é alternativa considerada, é enfeite.

## Consequências

### Positivas
### Negativas
### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
```
