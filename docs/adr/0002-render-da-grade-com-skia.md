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
