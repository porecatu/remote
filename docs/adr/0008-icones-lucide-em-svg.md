# ADR-0008 — Ícones Lucide em SVG, por `lucide-react-native`

**Status:** Aceito
**Data:** 2026-11-16
**Relacionados:** [ADR-0001](0001-expo-e-typescript.md), [ADR-0006](0006-licenca-gpl-e-lojas.md), [ADR-0009](0009-iosevka-fixed-embutida.md), [anatomia das telas](../design/proposta-de-anatomia.md) §2.3, [ADR-0024 do desktop](https://github.com/porecatu/terminal/blob/main/docs/adr/0024-face-de-icones.md)

## Contexto

A [anatomia das telas](../design/proposta-de-anatomia.md), aprovada em 2026-11-16, pede os ícones da família do desktop, o [Lucide](https://lucide.dev), referidos pelo nome (`chevron-left`, `ellipsis-vertical`, `shield-off`, `panel-top-close`, `ungroup`…), em cerca de 40 lugares. A anatomia deixou a escolha do pacote para um ADR próprio (§8 dela).

O desenho exige três coisas do caminho escolhido:

- **Tamanho e traço por uso.** O traço padrão do Lucide é 2/24 da em, mas o estado vazio usa um ícone grande de traço mais fino e o cadeado do modificador travado usa um ícone de 10 com traço mais grosso. Em tamanho pequeno, um traço fixo some no antialiasing: é o problema que o desktop documentou no ADR-0024 dele.
- **Independência do ajuste de fonte do sistema.** As barras têm altura fixa; um ícone que cresce com o tamanho de texto do sistema estoura a barra.
- **Invisível ao leitor de tela.** O ícone é decorativo; quem tem rótulo é o botão (anatomia §5).

O desktop resolve com uma **face de ícones** (`Lucide.ttf`) porque o render dele não tem primitiva de caminho. O React Native tem: `react-native-svg` já faz parte do conjunto de módulos do Expo SDK 58.

## Decisão

**Os ícones do chrome são os componentes SVG do pacote `lucide-react-native` (ISC), desenhados por `react-native-svg` (MIT), importados um a um.**

1. **Dependências.** `lucide-react-native` e `react-native-svg`, em versão exata ([ADR-0007](0007-toolchain-pinada.md)); a do `react-native-svg` é a que o SDK pinado indica (15.16.0 no SDK 58).
2. **Import por ícone.** Cada ícone vem do subcaminho do ícone (`lucide-react-native/icons/<nome>`), **nunca** do índice do pacote: o Metro não garante *tree shaking*, e o índice levaria os mais de 2.000 ícones para o bundle. Uma regra `no-restricted-imports` do lint reprova o import do índice.
3. **Um ponto de entrada.** Um componente do app (`Icon`) recebe o nome e o papel e aplica cor, tamanho e traço dos tokens da anatomia. Nenhuma tela passa número de tamanho ou de traço solto ("nenhuma dimensão inventada no código").
4. **Acessibilidade.** O SVG é sempre oculto do leitor de tela (`accessible={false}` e `importantForAccessibility="no-hide-descendants"`); o rótulo fica no elemento tocável que o contém.
5. **Tamanho fixo.** O ícone não acompanha o ajuste de fonte do sistema; os limites de crescimento de texto da anatomia (§2.3) valem só para texto.
6. **Licença.** ISC e MIT estão na lista do `scripts/check-licenses.mjs`; nada a acrescentar. O aviso de terceiros do app (M5, [ADR-0006](0006-licenca-gpl-e-lojas.md)) lista os dois.

> **Nota de implementação (2026-11-17):** instalados `lucide-react-native` 1.73.0 e `react-native-svg` 15.16.0, exatos; o `react-native-svg` está no `ignore` do Dependabot e sobe com o SDK.
>
> - **O componente `Icon`** (`ui/components/Icon.tsx`, exportado por `ui/components/index.ts`) é o único arquivo do app que importa o `lucide-react-native`. Ele tem a lista fechada dos ícones que a anatomia usa (49), cada um importado do próprio subcaminho (`lucide-react-native/icons/<nome>`), e recebe o nome do ícone, o papel e um token de cor. Tamanho e traço vêm do papel (`icon` em `ui/theme/tokens.ts`, anatomia §2.7): o de 48 com traço fino no estado vazio, o de 10 com traço grosso no cadeado do modificador travado, e os demais com o traço padrão. Ícone fora da lista não compila.
> - **Importações por subcaminho:** a regra `no-restricted-imports` do `eslint.config.js` reprova o índice do pacote (`lucide-react-native`) e o índice dos ícones (`lucide-react-native/icons`). Nos testes, o Jest compila os módulos `.mjs` que o pacote entrega pela condição `react-native`, como o Metro faz (`jest.config.js`).
> - **Acessibilidade e tamanho:** o SVG sai com `accessible={false}`, `importantForAccessibility="no-hide-descendants"` e `accessibilityElementsHidden`; o tamanho é número fixo, fora do ajuste de fonte do sistema.
> - O `react-native-svg` também é usado direto em dois desenhos que não são ícones: o anel de contagem do pareamento (`ui/screens/pairing/CountdownRing.tsx`) e o esmaecimento da borda da barra de teclas (`ui/terminal/KeyBar.tsx`).

## Alternativas consideradas

- **`Lucide.ttf` como face, igual ao desktop.** Sem `react-native-svg` e com o mesmo arquivo do desktop. Rejeitada: o traço fica fixo na face (o caso do cadeado de 10 e do ícone grande do estado vazio não tem saída), o glifo de Área de Uso Privado precisa ser escondido à mão do leitor de tela em cada uso, e o `<Text>` cresce com a fonte do sistema a não ser que cada uso desligue isso.
- **Copiar os caminhos SVG dos ícones usados para dentro do repositório.** Sem dependência além do `react-native-svg`; a ISC permite. Rejeitada: cada ícone novo vira cópia manual, e a atualização do desenho do Lucide deixa de chegar por versão de pacote.
- **`@expo/vector-icons`.** Já vem com o Expo. Rejeitada: não tem o conjunto Lucide; o Feather, antecessor dele, não tem vários ícones que a anatomia usa (`ungroup`, `panel-top-close`, `chevrons-down-up`).
- **Desenhar os ícones no Skia.** O Skia entra para a grade ([ADR-0002](0002-render-da-grade-com-skia.md)). Rejeitada: o ADR-0002 ainda é Proposto, e um canvas por botão para desenhar ícone é custo sem ganho.

## Consequências

### Positivas

- Mesma família e mesmos nomes de ícone do desktop, com traço e tamanho por token.
- Ícone fora do ajuste de fonte e fora do leitor de tela por construção, num componente só.
- Só o que é usado vai para o bundle.

### Negativas

- Duas dependências novas, uma delas nativa (`react-native-svg`, mantida dentro do conjunto do Expo).
- O nome do ícone no app e no desktop pode divergir se o Lucide renomear um ícone entre as versões que cada um usa.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Import do índice escapa e infla o bundle | Média | Médio | Regra de lint `no-restricted-imports`; o CI roda o lint |
| `lucide-react-native` renomeia ou remove um ícone numa versão nova | Média | Baixo | Versão exata; o Dependabot abre o PR e o `tsc` acusa o subcaminho que sumiu |
| Lista longa de ícones SVG pesa ao rolar a árvore | Baixa | Médio | Medido junto com o spike de render, numa árvore grande; se pesar, a linha reaproveita o elemento (lista virtualizada) |
