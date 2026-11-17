# ADR-0010 — Gestos, animação e teclado: Gesture Handler, Reanimated e Keyboard Controller

**Status:** Aceito
**Data:** 2026-11-16
**Relacionados:** [ADR-0001](0001-expo-e-typescript.md), [ADR-0002](0002-render-da-grade-com-skia.md), [ADR-0007](0007-toolchain-pinada.md), [ADR-0011](0011-folhas-dialogos-e-avisos-proprios.md), [PRD-003](../prd/prd-003-terminal.md), [arquitetura](../arquitetura.md) §6, [anatomia das telas](../design/proposta-de-anatomia.md) §1, §4.7 e §4.8

## Contexto

A [arquitetura](../arquitetura.md) §6 e o [ADR-0002](0002-render-da-grade-com-skia.md) contam com uma regra: **gesto não espera a thread de JS**. Pinça e rolagem da grade mexem num valor compartilhado lido pelo Skia, para que uma rajada de 30 `grid-diff`/s não trave o dedo. Os dois documentos citam "Reanimated/Gesture Handler", mas nenhum ADR os escolheu e nenhum está no `package.json`.

A [anatomia das telas](../design/proposta-de-anatomia.md), aprovada em 2026-11-16, acrescenta mais pedidos:

- **Grade** (§4.7): arrasto de um dedo com trava de eixo (8 pt decidem o eixo, diagonal só depois de 24 pt nos dois), pinça entre "caber a largura" e 24 pt, toque que abre o teclado, nenhum duplo toque.
- **Barra de teclas** (§4.8): fixa **acima do teclado do sistema**, acompanhando-o, e teclas de seta com repetição enquanto pressionadas.
- **Folhas** (§1, princípio 9): sobem em 200 ms, reordenações em 150 ms, e nada se move com "reduzir movimento" ligado; folha fechada por arrasto ([ADR-0011](0011-folhas-dialogos-e-avisos-proprios.md)).
- **Campos em folha** (renomear, nome do aparelho): o teclado não pode cobrir o campo.

O React Native 0.88 do SDK 58 roda *edge-to-edge* no Android, e o `KeyboardAvoidingView` dele não acompanha o teclado quadro a quadro.

## Decisão

**Gestos pelo `react-native-gesture-handler`, animação e valores compartilhados pelo `react-native-reanimated` (com o `react-native-worklets`, que ele exige), e o teclado pelo `react-native-keyboard-controller`.** Todos nas versões que o `bundledNativeModules.json` do Expo SDK pinado indica, gravadas exatas no `package.json` ([ADR-0007](0007-toolchain-pinada.md)): no SDK 58, Gesture Handler 3.3, Reanimated 4.7.1, Worklets 0.13.0 e Keyboard Controller 1.22.7.

1. **Gesture Handler.** Pinça, arrasto com trava de eixo, toque e toque longo, reconhecidos na thread de UI. Um `GestureHandlerRootView` envolve o app no `app/_layout.tsx`.
2. **Reanimated.** Zoom e deslocamento da grade são valores compartilhados que o canvas do Skia lê sem passar pelo React ([ADR-0002](0002-render-da-grade-com-skia.md) item 1). Folhas, botões flutuantes e reordenações animam por ele, com as durações dos tokens da anatomia, e a preferência "reduzir movimento" do sistema zera toda transição.
3. **Keyboard Controller.** A barra de teclas acompanha o teclado quadro a quadro (componente "grudado" no teclado); folhas com campo usam o evitar-teclado dele. O campo invisível de captura do terminal ([arquitetura](../arquitetura.md) §5) continua um `TextInput` comum; o Keyboard Controller só mede e acompanha o teclado.
4. **Repetição das setas.** O temporizador da repetição (400 ms, depois a cada 80 ms, anatomia §4.8) roda na thread de JS, porque cada repetição é um `key` enviado pelo protocolo; o gesto só marca início e fim do toque.
5. **Nenhum módulo nativo nosso.** Os três são módulos de terceiros mantidos dentro do conjunto do Expo; o item 4 do [ADR-0001](0001-expo-e-typescript.md) segue valendo.

> **Nota de implementação (2026-11-17):** instalados nas versões acima (Gesture Handler 3.3.0, Reanimated 4.7.1, Worklets 0.13.0, Keyboard Controller 1.22.7), exatas, e no `ignore` do Dependabot junto com o `react-native-svg` e o Skia. O `GestureHandlerRootView` e o `KeyboardProvider` envolvem o app em `ui/root/AppRoot.tsx`, que o `app/_layout.tsx` monta. Nos testes, os quatro rodam sobre os mocks oficiais deles (`test/setup/native.ts`), com o Reanimated de verdade no build de Jest; nada foi sentido num aparelho.
>
> - **Gestos da grade** (`ui/terminal/grid/useGridGestures.ts`): pinça entre "caber a largura" e 24 pt, em volta dos dedos; arrasto de um dedo com a trava de eixo da anatomia, com inércia (`withDecay`) que continua mesmo com "reduzir movimento", porque prolonga o movimento do dedo e não é transição; toque que abre o teclado. Nenhum duplo toque e nenhum toque longo no v1. Reconhecidos na thread de UI, mexem em valores compartilhados que o canvas lê e chamam só as funções *worklet* de `src/terminal/viewport.ts` ([ADR-0002](0002-render-da-grade-com-skia.md)).
> - **Gesto da folha** (`ui/overlay/Sheet.tsx`, [ADR-0011](0011-folhas-dialogos-e-avisos-proprios.md)): arrastar a alça ou o título para baixo fecha a folha; arrasto menor que um alvo de toque (48) volta ao lugar. Só ali, para a lista de dentro rolar livre. A folha sobe e desce pelo Reanimated em `duration.sheet`, sem transição com "reduzir movimento"; o mesmo vale para o rearranjo da lista do workspace (`duration.reflow`) e para o esmaecimento da campainha na barra do terminal, que fica acesa sem transição. O *spinner* continua girando com "reduzir movimento", como a anatomia pede (§2.9). "Reduzir movimento" é lido ao vivo pelo `ThemeProvider` (`useReducedMotion`).
> - **Keyboard Controller.** Na tela do terminal, a grade e a barra de teclas ficam num `KeyboardAvoidingView` do Keyboard Controller, e a barra só aparece enquanto o teclado está aberto (`useKeyboardState`): é assim que ela fica grudada no teclado, em vez de um componente "grudado" separado. As folhas com campo (`Sheet` com `avoidKeyboard`) e a tela do nome do aparelho usam o `KeyboardAvoidingView` dele, e o aviso (*snackbar*) acompanha o teclado com o `KeyboardStickyView`. O campo de captura continua um `TextInput` comum (`ui/terminal/CaptureInput.tsx`).
> - **Barra de teclas** (`ui/terminal/KeyBar.tsx`): a repetição das setas é `useKeyRepeat.ts`, com o temporizador na thread de JS (`duration.key-repeat-delay` e `duration.key-repeat-interval`, 400 e 80 ms); o toque só marca início e fim, e o leitor de tela, que ativa sem toque, dispara a tecla uma vez.

## Alternativas consideradas

- **`PanResponder` e `Animated` do próprio React Native.** Sem dependência. Rejeitada: os gestos passam pela thread de JS, que é justamente a que fica ocupada decifrando e aplicando diffs; a pinça disputaria com o protocolo.
- **`KeyboardAvoidingView` do React Native.** Rejeitada: comportamento diferente entre iOS e Android, inconsistente com *edge-to-edge*, e sem acompanhar o teclado quadro a quadro: a barra de teclas pularia depois do teclado.
- **Altura do teclado pelo Reanimated (`useAnimatedKeyboard`).** Dá o valor quadro a quadro sem outra dependência. Rejeitada: o app teria de reconstruir à mão os componentes de grudar e de evitar o teclado que o Keyboard Controller já entrega nas duas plataformas.

## Consequências

### Positivas

- Gesto e animação na thread de UI, como a arquitetura pede, com o mesmo valor compartilhado servindo gesto e canvas.
- Barra de teclas e folhas com campo sem salto nem cobertura pelo teclado, nos dois sistemas.

### Negativas

- Três dependências nativas novas (mais o Worklets), acopladas à versão do React Native; a atualização do SDK passa a arrastá-las juntas.
- Código em *worklet* tem regras próprias (o que roda na thread de UI não chama a lógica do app diretamente), que os testes em Node não exercitam.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Versões fora do conjunto do SDK quebram o build | Média | Alto | Sempre as versões do `bundledNativeModules.json` do SDK pinado; ao serem instaladas, as quatro (e o `react-native-svg`, [ADR-0008](0008-icones-lucide-em-svg.md)) entram no `ignore` do Dependabot ao lado de `react` e `react-native`, e sobem com o SDK, à mão |
| Pinça ou rolagem abaixo dos alvos do ADR-0002 | Média | Alto | Medidas no spike, com gesto e rajada de diffs ao mesmo tempo |
| Teclados de terceiros (SwiftKey, Samsung) informam altura de forma diferente | Média | Médio | Coberto pelos testes de teclado do M3 ([roadmap](../roadmap.md)) |
