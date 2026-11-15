# ADR-0006 — GPL-3.0-or-later com DCO e o risco das lojas

**Status:** Aceito
**Data:** 2026-11-15
**Relacionados:** [ADR-0007](0007-toolchain-pinada.md), [CONTRIBUTING](../../CONTRIBUTING.md)

## Contexto

O Porecatu é GPL-3.0-or-later. O dono do produto decidiu que **os três projetos novos** (protocolo, relay e este app) também são, por coerência.

Um app mobile tem uma particularidade que os outros não têm: é distribuído pela **App Store da Apple** e pelo **Google Play**. A compatibilidade dos termos da App Store com a GPL é discutida há mais de uma década — o caso conhecido é o do VLC, retirado da loja em 2011 depois da reclamação de um dos detentores de direitos e de volta anos depois sob outra licença. O ponto de atrito é que os termos da loja impõem restrições de uso ao usuário final que a GPL proíbe acrescentar; quem tem todos os direitos sobre o código pode distribuí-lo sob outros termos na loja, mas um contribuidor terceiro pode objetar à distribuição do código dele.

O Google Play não tem o mesmo atrito na prática.

## Decisão

**O app é GPL-3.0-or-later, com o texto da FSF verbatim em `LICENSE` (idêntico ao do Porecatu), cabeçalho SPDX em todo arquivo, contribuições assinadas com DCO, e a distribuição na App Store tratada como risco aceito e registrado.**

1. **`LICENSE`** é cópia byte a byte do arquivo do Porecatu (`sha256` `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`) e nunca é editado.
2. **SPDX** `GPL-3.0-or-later` em todo arquivo de código-fonte e script.
3. **DCO** (`Signed-off-by`) em todo commit de contribuição, conferido no CI. Ele registra a origem de cada linha; não transfere direitos.
4. **Dependências** só com licença compatível com GPLv3 (MIT, BSD, ISC, Apache-2.0 e afins), conferida antes de adotar e no CI por uma ferramenta de licenças.
5. **Código-fonte correspondente**: cada versão publicada nas lojas tem a tag correspondente neste repositório, e a tela "Sobre" do app aponta para ele e para a licença.
6. **Risco da App Store aceito.** Se um contribuidor objetar à distribuição na App Store, as saídas, em ordem, são: remover a contribuição dele; distribuir o iOS só por build próprio do usuário. Mudar a licença exigiria a concordância de todos os detentores e um ADR novo.

## Alternativas consideradas

- **GPL com CLA (cessão ou licença ampla ao mantenedor).** Daria ao mantenedor o direito de distribuir na loja sob outros termos sem risco. Rejeitado por ora: CLA afasta contribuidores, e o projeto ainda não tem nenhum; pode ser adotado por ADR antes do primeiro contribuidor externo, se o risco ficar concreto.
- **MIT/Apache-2.0 só no app.** Sem atrito com loja nenhuma. Rejeitado pela decisão do dono do produto (tudo GPL).
- **GPL com exceção para lojas de apps.** Usada por alguns projetos. Rejeitado: texto de exceção novo é fonte de ambiguidade jurídica, e o dono preferiu a licença padrão.

## Consequências

### Positivas

- Coerência com o ecossistema Porecatu; garantia de que versões derivadas continuem livres.

### Negativas

- Incerteza jurídica na App Store, assumida.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Objeção de contribuidor à distribuição na App Store | Baixa | Alto | DCO identifica a origem; remoção da contribuição; CLA antes do primeiro contribuidor externo se o risco crescer |
| Rejeição pela revisão da Apple por causa da licença | Baixa | Médio | A Apple não costuma barrar pela licença; o risco é de terceiros |
| Dependência com licença incompatível entrar por transitividade | Média | Médio | Verificação de licenças no CI |
