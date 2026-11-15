# Contribuindo

Obrigado pelo interesse no Porecatu Remote. Antes de abrir um PR, leia o [CLAUDE.md](CLAUDE.md): ele é o guia operacional do projeto, com as convenções e as armadilhas conhecidas.

## Certificado de origem (DCO)

Toda contribuição é aceita sob a [GPL-3.0-or-later](LICENSE) e assinada com o [Developer Certificate of Origin 1.1](https://developercertificate.org/): cada commit leva a linha

```
Signed-off-by: Seu Nome <seu@email>
```

que `git commit -s` acrescenta sozinho. Ao assinar, você declara que tem o direito de contribuir aquele código sob a licença do projeto.

Por que DCO e não só a licença: o app é distribuído nas lojas da Apple e do Google, e a compatibilidade dos termos dessas lojas com a GPL depende de quem distribui ter os direitos sobre o código. O DCO registra a origem de cada contribuição, e o [ADR-0006](docs/adr/0006-licenca-gpl-e-lojas.md) explica o risco e como ele é tratado.

## Convenções

- **Código, identificadores e comentários de código:** inglês.
- **Documentação e mensagens de commit:** português do Brasil.
- Commits em [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`.
- Todo arquivo de código-fonte e todo script começa com `// SPDX-License-Identifier: GPL-3.0-or-later` (ou `#` em Python e shell).
- Frase de interface **nunca** é escrita no código: entra no catálogo de mensagens ([ADR-0005](docs/adr/0005-catalogo-de-textos-e-idiomas.md)).
- Mudança de decisão arquitetural começa num ADR novo; decisão aceita não se edita.

## Antes do PR

```bash
python scripts/verify-docs.py
```

Quando houver código, o CI também roda lint, checagem de tipos e testes — os comandos ficam no [CLAUDE.md](CLAUDE.md).
