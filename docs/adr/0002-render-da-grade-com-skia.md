# ADR-0002 — Render da grade com `@shopify/react-native-skia`

**Status:** Proposto — decidido pelo spike do M1 ([roadmap](../roadmap.md))
**Data:** 2026-11-15
**Relacionados:** [ADR-0001](0001-expo-e-typescript.md), [PRD-003](../prd/prd-003-terminal.md), [mensagens §5](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)

## Contexto

A grade do terminal é a superfície mais exigente do app. Uma aba do desktop pode ter **200 colunas × 60 linhas** (12 000 células), com estilo por trecho, e mudar dezenas de vezes por segundo (até 30 `grid-diff`/s por assinatura). O usuário dá zoom por pinça e rola nas duas direções enquanto ela muda. O [PRD-000](../prd/prd-000-visao-de-produto.md) pede **≥ 50 quadros por segundo** rolando essa grade num Android intermediário.

O que chega pelo protocolo já ajuda: linhas como listas de *spans* com coluna, largura e estilo, cores não resolvidas, e grafemas compostos isolados num span. O app não precisa segmentar texto nem interpretar VT; precisa **pintar retângulos de fundo e texto monoespaçado em posições fixas**, e repintar só as linhas que o diff tocou.

O jeito ingênuo em React Native — um `<Text>` por célula — cria 12 000 nós de visão e trava. O meio-termo — um `<Text>` por linha com `<Text>` aninhados por span — reduz para algumas centenas de nós, mas cada atualização passa pelo reconciliador do React e pelo layout de texto da plataforma, e a posição de cada coluna depende de a fonte da plataforma respeitar a grade monoespaçada, o que falha com fallback de fonte para CJK e emoji.

## Decisão (proposta)

**A grade é desenhada num `Canvas` do `@shopify/react-native-skia`, com a fonte monoespaçada embutida no app, a partir de um modelo de linhas mantido fora do React; cada linha é um `SkPicture` (ou equivalente) em cache, refeito só quando o diff a toca.**

1. **Modelo fora do React.** O modelo da grade ([arquitetura](../arquitetura.md) §3) aplica snapshot e diff e marca as linhas sujas. O React não re-renderiza por diff; o canvas é notificado por um valor compartilhado (Reanimated/Skia), e o desenho acontece fora do reconciliador.
2. **Uma gravação por linha.** Cada linha vira uma gravação (fundos dos spans, depois o texto de cada span com a posição de coluna calculada por `col + i × width` sobre a largura da célula da fonte embutida). Linha limpa reaproveita a gravação. **Nunca se cria objeto de texto por célula por quadro.**
3. **Fonte embutida e métrica fixa.** Uma fonte monoespaçada embutida (a mesma família do Porecatu, Iosevka Fixed, se a licença e o tamanho permitirem) define a largura da célula; glifos ausentes caem num fallback desenhado **dentro da célula**, centralizado, sem deslocar as seguintes.
4. **Box-drawing e blocos como formas**, não como glifos da fonte, como faz o Porecatu, para não haver costura entre células.
5. **Zoom e rolagem são transformação do canvas** (escala e translação), não novo layout: pinça e arraste mexem numa matriz, e as gravações das linhas continuam valendo.
6. **Cursor** é uma camada própria por cima das linhas.

### Critério do spike (M1)

O ADR passa a **Aceito** se, num aparelho Android intermediário de referência (definido no roadmap) e num iPhone de duas gerações atrás, com build de release:

| Medida | Alvo |
|---|---|
| Rolagem e pinça sobre grade 200×60 estática | ≥ 55 fps sustentados |
| Grade 200×60 recebendo 30 diffs/s de 10 linhas cada, sem gesto | ≥ 50 fps, sem perda de diff |
| Snapshot completo 200×60 aplicado e desenhado | < 50 ms |
| Memória do processo com a grade aberta | < 250 MB |

Se falhar, o spike mede as alternativas abaixo na mesma bancada e o ADR é reescrito com o vencedor.

> **Nota de implementação (2026-11-17):** a grade foi implementada como este ADR propõe, em `ui/terminal/grid/` (o mapa dos arquivos está na [arquitetura](../arquitetura.md) §4 e §6), isolada para poder ser trocada sem mexer na tela do terminal. O ADR **continua Proposto**: nada foi medido num aparelho.
>
> - **Item 1.** O motor é `gridEngine.ts`, em JS, na thread de JS, sem React nem Skia próprios: os valores compartilhados e o renderizador são injetados, e ele roda nos testes em Node. Segue o controlador do terminal (`src/controllers/terminalSession.ts`), mantém coerentes zoom, rolagem e forma do conteúdo e entrega ao canvas o quadro e o cursor como `SkPicture` em valores compartilhados. Um `grid-diff` não re-renderiza componente.
> - **Item 2.** Uma gravação por linha, guardada em `lineCache.ts` enquanto o objeto da linha é o mesmo: o modelo troca o objeto de toda linha que um diff toca, então a identidade faz o papel de `dirty`. A linha vira primeiro operações de desenho puras (`lineRecording.ts`, `drawOps.ts`), testadas em Node, e `skiaPainter.ts` as grava glifo a glifo na coluna de cada célula (`col + i × width`), numa escala fixa de 12 pt que a transformação amplia ou reduz. O quadro compõe só as linhas de uma janela em volta da vista e é recomposto quando a vista chega perto da borda dela.
> - **Item 3.** A Iosevka Fixed 400 e 500 é carregada no Skia a partir dos mesmos arquivos do chrome ([ADR-0009](0009-iosevka-fixed-embutida.md)); negrito usa a face 500, e o itálico é inclinado, porque a família embutida não tem itálico. Code point sem glifo na fonte cai nas fontes do sistema por um parágrafo de **uma célula**, centralizado e reduzido para caber, sem empurrar as colunas seguintes.
> - **Item 4.** Box-drawing (U+2500–257F) e blocos (U+2580–259F) são formas (`boxDrawing.ts`), com os traços até a borda da célula.
> - **Item 5.** Zoom e rolagem são uma transformação lida de valor compartilhado (`GridCanvas.tsx`). Os gestos (`useGridGestures.ts`) rodam na thread de UI ([ADR-0010](0010-gestos-animacao-e-teclado.md)) e chamam só as funções *worklet* de `src/terminal/viewport.ts`. A inércia do arrasto (*momentum*, `withDecay`) continua mesmo com "reduzir movimento": prolonga o movimento do dedo, não é transição.
> - **Item 6.** O cursor é um `SkPicture` próprio, desenhado por cima do quadro.
> - **Histórico.** O conteúdo tem todas as linhas de histórico que o desktop guarda. As linhas perto da vista são pedidas uma tela à frente, e a que ainda não chegou fica em branco até a página dela chegar. Na tela alternativa não há histórico.
> - **Acessibilidade** (a dívida das consequências negativas): um elemento só, sobre o canvas, resume as últimas linhas não vazias da grade viva (`gridA11y.ts`), calculado só com leitor de tela ligado e no máximo a cada 2 s. A camada por linha continua dívida.
>
> Falta medir, num Android intermediário e num iPhone de duas gerações atrás, com build de release e grade 200×60:
>
> - os quatro alvos da tabela acima (rolagem e pinça, 30 diffs/s, snapshot completo, memória);
> - o orçamento da thread de JS com gesto e rajada ao mesmo tempo: decifrar, decodificar, aplicar e regravar as linhas de 30 diffs/s;
> - o `SkPicture` passado por valor compartilhado da thread de JS para a de UI;
> - o alinhamento da Iosevka na célula e os nomes das faces nas duas plataformas;
> - o *fallback* de emoji e CJK dentro da célula;
> - costuras do box-drawing em zoom fracionário;
> - a sensação dos gestos (trava de eixo, inércia, pinça).
>
> Algumas proporções do desenho não têm token na anatomia e esperam a revisão do dono: o polegar mínimo da barra de rolagem (3), a espessura do cursor sublinhado e barra (2× o sublinhado da fonte), o vão do tracejado (1/3), a inclinação do itálico (−0,2), os sombreamentos (25, 50 e 75%) e a espessura do traço leve do box-drawing (a do sublinhado, 0,05 em).

## Alternativas consideradas

- **`<Text>` por linha, com spans aninhados.** Simples e sem dependência nativa. Plausível para grades pequenas. Rejeitado como primeira opção: cada diff passa pelo reconciliador e pelo layout de texto nativo, e o alinhamento de coluna depende da fonte da plataforma; é a alternativa de reserva que o spike mede.
- **WebView com `<canvas>` (ou xterm.js só como renderizador).** Desenho rápido e maduro. Rejeitado: ponte de mensagens entre JS do app e JS da WebView a cada diff, teclado e gestos divididos entre duas camadas, e uma segunda pilha de render para manter; o protocolo já entrega células, então o emulador do xterm.js seria peso morto.
- **Módulo nativo próprio (Canvas Android / Core Graphics).** O mais rápido. Rejeitado pelo [ADR-0004](0004-criptografia-em-js-puro.md)/[ADR-0001](0001-expo-e-typescript.md) (nenhum módulo nativo nosso) e por exigir duas implementações.

## Consequências

### Positivas

- Desenho independente da pilha de texto da plataforma; a mesma grade nos dois sistemas.
- Zoom e rolagem baratos (transformação), e custo por diff proporcional às linhas sujas.

### Negativas

- Dependência de uma biblioteca nativa grande (Skia) e do acoplamento dela com a versão do React Native/Expo.
- Acessibilidade: o canvas não expõe texto ao leitor de tela; é preciso uma camada de acessibilidade paralela (resumo por linha) — fica como dívida registrada no roadmap.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Spike não atingir os alvos | Média | Alto | Alternativas medidas na mesma bancada; o ADR só passa a Aceito com números |
| Fonte embutida grande demais para o app | Média | Baixo | Recorte de faixas como o `subset-fonts.py` do Porecatu |
| Emoji colorido e CJK sem cobertura na fonte embutida | Alta | Baixo | Fallback do sistema desenhado dentro da célula, sem quebrar a grade |
