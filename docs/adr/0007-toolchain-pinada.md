# ADR-0007 — Toolchain pinada: Node, gerenciador de pacotes, Expo SDK e dependências exatas

**Status:** Aceito
**Data:** 2026-11-15
**Relacionados:** [ADR-0001](0001-expo-e-typescript.md), [ADR-0004](0004-criptografia-em-js-puro.md), [ADR-0006](0006-licenca-gpl-e-lojas.md)

## Contexto

O Porecatu pina a toolchain do Rust e as dependências mais sensíveis em versão exata (ADR-0011 do [Porecatu](https://github.com/porecatu/terminal)), porque uma atualização silenciosa já custou caro lá. No ecossistema JavaScript o risco é maior: `^` no `package.json` aceita versões menores novas a cada instalação, o Expo SDK amarra versões de React Native e de dezenas de módulos nativos, e um build de loja não reproduzível é difícil de investigar.

O app também depende do `@porecatu/protocol`, cuja versão tem de casar com a do protocolo que o desktop fala.

## Decisão

**Toda versão é exata e reproduzível: Node por `.nvmrc` e `engines`, o gerenciador de pacotes por `packageManager` (Corepack), o Expo SDK e toda dependência sem `^` nem `~`, lockfile commitado, e atualização como tarefa própria.**

1. **Node** LTS pinado em `.nvmrc` e em `engines.node`.
2. **Gerenciador de pacotes**: `pnpm`, versão em `packageManager` do `package.json`, via Corepack; o CI instala com `--frozen-lockfile`.
3. **Dependências**: versão exata em `dependencies` e `devDependencies`; `expo install` para módulos do SDK (garante a versão compatível) e depois a versão exata fixada.
4. **Expo SDK** sobe em PR próprio, com o checklist: notas de versão do SDK e do React Native, compatibilidade do Skia, build de desenvolvimento nos dois sistemas, os critérios do spike de render reexecutados.
5. **`@porecatu/protocol`** em versão exata; subir a versão do pacote é PR próprio, que confere a versão de protocolo `[major, minor]` contra o desktop suportado e atualiza o mapa de códigos do catálogo ([ADR-0005](0005-catalogo-de-textos-e-idiomas.md)).
6. **Dependabot** (ou Renovate) abre PRs de atualização, um por dependência, com o CI completo; nada é atualizado em lote sem revisão.
7. **Actions do GitHub** pinadas por SHA de commit, com a versão no comentário, como no Porecatu.

> **Nota de implementação (2026-11-16):** o que o repositório tem hoje.
>
> - **Node** 26.13.0 em `.nvmrc`; `engines.node` declara o piso `>=26.13.0` (não a versão exata).
> - **pnpm** 12.17.0, declarado em `packageManager` do `package.json`, mas **instalado globalmente**, sem Corepack; no CI, pela action `pnpm/action-setup`, que lê o `packageManager`. A configuração do pnpm 12 mora em `pnpm-workspace.yaml`, não no `.npmrc`: `nodeLinker: hoisted` (exigência do Metro) e `allowBuilds`, a lista explícita de pacotes cujo script de instalação pode rodar (o pnpm 12 bloqueia os demais). O `.npmrc` mantém `node-linker=hoisted` só para ferramentas que ainda o leem.
> - **Expo SDK 58** (`expo` 58.0.25, React Native 0.88.1, React 19.3.0) e toda dependência em versão exata, com `pnpm-lock.yaml` commitado.
> - **`@porecatu/protocol`** do tarball `vendor/porecatu-protocol-0.1.0.tgz` ([ADR-0004](0004-criptografia-em-js-puro.md)).
> - **Dependabot** em `.github/dependabot.yml`, um PR por dependência (npm e Actions), sem agrupamento.

## Alternativas consideradas

- **`npm` com `package-lock.json`.** Suficiente. Rejeitado em favor do `pnpm` pela instalação mais rápida e pelo isolamento estrito de dependências (pacote que não foi declarado não é importável). Funciona com Expo desde o SDK 50 com `node-linker=hoisted` quando necessário.
- **Faixas `^` com lockfile.** Comum. Rejeitado: o lockfile protege a instalação, mas o `package.json` deixa de dizer o que está em uso, e `expo install` pode trocar versões em silêncio.

## Consequências

### Positivas

- Build reproduzível, inclusive o de loja; regressões rastreáveis a um PR de atualização.

### Negativas

- Mais PRs de atualização para revisar.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Ficar preso a um SDK antigo por adiar atualizações | Média | Médio | Subir o SDK a cada versão estável nova, no máximo um ciclo atrás |
| `pnpm` e o bundler do Expo (Metro) se desentenderem com links simbólicos | Média | Baixo | `nodeLinker: hoisted` em `pnpm-workspace.yaml` (no pnpm 12; o `.npmrc` repete a linha para ferramentas antigas) |
