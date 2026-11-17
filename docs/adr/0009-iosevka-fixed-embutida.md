# ADR-0009 — Iosevka Fixed embutida, com as faces recortadas do desktop

**Status:** Aceito
**Data:** 2026-11-16
**Relacionados:** [ADR-0002](0002-render-da-grade-com-skia.md), [ADR-0006](0006-licenca-gpl-e-lojas.md), [ADR-0007](0007-toolchain-pinada.md), [anatomia das telas](../design/proposta-de-anatomia.md) §2.3, ADRs do desktop [0025](https://github.com/porecatu/terminal/blob/main/docs/adr/0025-iosevka-no-lugar-da-ibm-plex.md) e [0026](https://github.com/porecatu/terminal/blob/main/docs/adr/0026-chrome-unificado-em-iosevka-fixed.md)

## Contexto

A [anatomia das telas](../design/proposta-de-anatomia.md) §2.3 usa duas famílias: a **fonte do sistema** no chrome (como o desktop desde o ADR-0084 dele) e a **Iosevka Fixed** 400 e 500 em dois lugares:

- **na grade do terminal**, onde a métrica da fonte define a largura da célula e a fonte que faz as colunas caberem na tela (§4.7 da anatomia: a Fixed avança 0,5 em) — [ADR-0002](0002-render-da-grade-com-skia.md) item 3;
- **no mono do chrome**: rótulos das teclas, chips, `usuário@host`, `cwd`, impressão digital, prévia do colar.

Nenhum dos dois sistemas traz a Iosevka. A monoespaçada do sistema (Menlo no iOS, Droid Sans Mono ou Roboto Mono no Android) muda a métrica de aparelho para aparelho e não tem os blocos que uma TUI desenha: o desktop mediu que braille, geométricos, setas e *powerline* faltam nas monoespaçadas comuns e trocou de família por isso (ADR-0025 dele). O app desenha a mesma grade que o desktop e precisa da mesma cobertura.

O desktop já resolveu o tamanho: as faces originais da Iosevka têm ~8,7 MB cada, e o `scripts/subset-fonts.py` dele as recorta para os blocos que um terminal desenha, sem ligaduras por construção: cerca de 420 KB cada face no `assets/fonts/` do desktop. A licença é a SIL OFL 1.1 **sem** *Reserved Font Name*, que permite o recorte mantendo o nome da família.

## Decisão

**O app embute as duas faces da Iosevka Fixed que o desktop distribui, já recortadas — `IosevkaFixed-Regular.ttf` (400) e `IosevkaFixed-Medium.ttf` (500) —, copiadas sem alteração do `assets/fonts/` do [porecatu/terminal](https://github.com/porecatu/terminal), com o texto da licença ao lado.**

1. **Origem e atualização.** Os dois TTF e o `LICENSE-OFL-iosevka.txt` vêm do `assets/fonts/` do desktop, num commit registrado em `assets/fonts/README.md` (commit e `sha256` de cada arquivo). Quando o desktop atualizar a Iosevka ou o recorte, o app copia de novo e atualiza o registro. O app **não** tem script de recorte próprio: um recorte só, para que grade do desktop e grade do celular tenham a mesma cobertura.
2. **Embutida no build.** As faces entram pelo *config plugin* do `expo-font` (dependência explícita, versão exata), registradas no binário em tempo de build: nada é carregado em tempo de execução, e não há quadro com a fonte errada.
3. **Nome por plataforma num lugar só.** O nome com que o React Native acha a face difere entre iOS (nome PostScript) e Android (nome do arquivo); um módulo do app mapeia peso → nome, e nenhuma tela escreve o nome da família.
4. **Grade pelo mesmo arquivo.** O render da grade carrega no Skia os mesmos TTF (`require` do arquivo do app). Como ele os usa — estilo `bold`, itálico, fallback para o que o recorte não cobre — é do [ADR-0002](0002-render-da-grade-com-skia.md) e do spike.
5. **Fora do recorte.** Emoji, CJK e o resto do Unicode vêm da fonte do sistema, desenhados dentro da célula ([ADR-0002](0002-render-da-grade-com-skia.md) item 3). Nada além das duas faces é embutido.
6. **Licença.** A OFL 1.1 é livre e não é uma licença de código: a fonte vai junto com o app como obra separada, como no desktop (que também é GPL). A OFL proíbe vender a fonte sozinha, não distribuí-la com software. O texto da licença acompanha os arquivos em `assets/fonts/`, nunca o `LICENSE` da raiz, e entra no aviso de terceiros do app ([ADR-0006](0006-licenca-gpl-e-lojas.md)). O `check-licenses.mjs` olha só as dependências npm; a fonte não é uma.
7. **SPDX.** TTF e texto de licença não são código-fonte; o `scripts/check-spdx.py` não os verifica, e eles não ganham cabeçalho.

> **Nota de implementação (2026-11-17):**
>
> - **A fonte.** `assets/fonts/` tem `IosevkaFixed-Regular.ttf`, `IosevkaFixed-Medium.ttf` e `LICENSE-OFL-iosevka.txt`, copiados sem alteração do desktop; o `assets/fonts/README.md` registra o commit de origem, o tamanho e o `sha256` de cada arquivo. As duas faces somam cerca de 845 KB.
> - **O *config plugin*.** `expo-font` 58.0.12 é dependência explícita, e o `app.config.ts` registra as duas faces no plugin dele, que as embute no binário em tempo de build. O efeito só aparece num *development build*, que ainda não foi feito.
> - **Nome por plataforma (item 3).** `ui/theme/fonts.ts` é o único lugar com o nome da face: no iOS, o nome PostScript lido da tabela `name` dos arquivos (`Iosevka-Fixed` e `Iosevka-Fixed-Medium`); no Android, o nome do arquivo sem extensão (`IosevkaFixed-Regular` e `IosevkaFixed-Medium`). `monoFamily(peso)` devolve o nome da plataforma, e o peso pedido acima de 500 cai em 500 (mono 600 vira 500). Só os papéis de tipografia com `font: "mono"` (`ui/theme/tokens.ts`: tecla, chip mono, mono secundário, mono do corpo, impressão digital) recebem a família; o resto do chrome não define família e fica com a do sistema.
> - **Grade (item 4).** `monoFontFiles` em `ui/theme/fonts.ts` dá os mesmos TTF por `require`, e a grade os carrega no Skia (`useTypeface` em `ui/terminal/grid/TerminalGrid.tsx`). Negrito usa a face 500 e itálico é inclinado; o resto está na nota de implementação do [ADR-0002](0002-render-da-grade-com-skia.md).
> - Os nomes das faces nas duas plataformas são verificados no primeiro *development build* (risco da tabela abaixo).

## Alternativas consideradas

- **Baixar a Iosevka e recortar aqui.** Independe do repositório do desktop. Rejeitada: duplica o script e a escolha de faixas, e as duas grades poderiam passar a cobrir blocos diferentes.
- **Faces inteiras, sem recorte.** Rejeitada: ~17 MB no app por duas faces, quase tudo conjuntos estilísticos que o terminal nunca usa.
- **Monoespaçada do sistema.** Sem peso no app. Rejeitada: métrica e cobertura variam por aparelho (sem braille, geométricos ou *powerline* nas comuns), e a grade deixaria de ser a do desktop.
- **Carregar a fonte em tempo de execução** (`useFonts`/`loadAsync`). Rejeitada: a primeira tela sairia com a fonte de fallback, ou esperaria o carregamento; o *config plugin* entrega a fonte já registrada.

## Consequências

### Positivas

- Grade e chrome mono com a mesma métrica e cobertura do desktop, em qualquer aparelho.
- Cerca de 850 KB no app pelas duas faces, contra ~17 MB das originais.
- Um recorte só, mantido no desktop.

### Negativas

- O app depende de copiar arquivos do repositório do desktop à mão quando ele muda.
- Bold e itálico além dos dois pesos dependem de síntese (decidida no spike do ADR-0002).

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Cópia desatualizada em relação ao desktop | Média | Baixo | Commit e `sha256` registrados em `assets/fonts/README.md`; conferência a cada atualização da Iosevka no desktop |
| Nome da face diferente do esperado numa plataforma | Média | Médio | Mapeamento único e verificado no primeiro *development build* nas duas plataformas |
| Glifo fora do recorte aparece na grade | Alta | Baixo | Fallback do sistema dentro da célula ([ADR-0002](0002-render-da-grade-com-skia.md)) |
