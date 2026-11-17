# ADR-0011 — Folhas, diálogos e avisos próprios, desenhados dentro da janela do app

**Status:** Aceito
**Data:** 2026-11-16
**Relacionados:** [ADR-0010](0010-gestos-animacao-e-teclado.md), [PRD-001](../prd/prd-001-desktops-e-pareamento.md) RF-1.19, [PRD-004](../prd/prd-004-gestao-de-abas.md), [anatomia das telas](../design/proposta-de-anatomia.md) §1, §4.12 a §4.14 e §5

## Contexto

A [anatomia das telas](../design/proposta-de-anatomia.md), aprovada em 2026-11-16, põe toda ação sobre um item em **folha inferior** ou **diálogo central**, nunca em tela nova (§1, princípio 2): menus da aba e do grupo, nova aba, renomear, mover, cor, seletor de painéis, remover desktop, colar com prévia, confirmação de fechamento. Os avisos temporários (*snackbar*, §4.14) aparecem sobre qualquer tela. A anatomia também fixa como eles se comportam:

- sobem em 200 ms, sem animação com "reduzir movimento"; canto superior de raio 10 e demais valores dos tokens;
- o voltar do Android e o arrasto para baixo fecham a folha; o foco do leitor de tela fica preso nela e **volta ao elemento de origem** ao fechar (§5);
- o diálogo de `confirm-request` vive **por cima da tela atual**, e sair da tela com ele aberto o mantém, porque a pergunta é da sessão, não da tela (§4.13);
- a **cobertura do seletor de apps** (RF-1.19) troca o conteúdo por uma tela neutra antes da captura do sistema, e a tela do terminal usa `FLAG_SECURE` no Android.

Esse último ponto pesa na escolha. O `Modal` do React Native abre **outra janela** nativa (um `Dialog` no Android, uma apresentação modal no iOS). Uma folha aberta num `Modal` ficaria por cima da cobertura, que mora na janela principal: a prévia do colar ou o menu da aba apareceriam no seletor de apps.

## Decisão

**Folhas, diálogos e avisos são componentes do app, desenhados por uma camada única montada no `app/_layout.tsx`, por cima do navegador e por baixo da cobertura de privacidade, na mesma janela nativa, sem `Modal` e sem biblioteca de folhas.**

1. **Uma camada, uma pilha.** Um store `zustand/vanilla`, como os da sessão, guarda a pilha do que está aberto (folhas, diálogos, avisos). A camada desenha a pilha por cima do `Stack` do `expo-router`. Telas pedem "abrir folha X com tais dados" e não desenham sobreposições por conta própria.
2. **Ordem fixa das camadas**, de baixo para cima: navegador → folhas e diálogos → avisos → cobertura de privacidade. A cobertura fica acima de tudo, sempre.
3. **Vida própria.** Uma sobreposição pertence à sessão ou ao app, não à tela que a abriu: o diálogo de `confirm-request` continua aberto quando a tela muda e some quando a confirmação expira ou a sessão fecha ([PRD-004](../prd/prd-004-gestao-de-abas.md)). Folha de um item que sumiu do `workspace` fecha sozinha.
4. **Gestos e animação** pelo [ADR-0010](0010-gestos-animacao-e-teclado.md): subida e descida pelo Reanimated, arrasto para fechar pelo Gesture Handler, evitar-teclado pelo Keyboard Controller nas folhas com campo, e nenhuma transição com "reduzir movimento".
5. **Acessibilidade.** Enquanto há sobreposição, o conteúdo de baixo sai da árvore do leitor de tela (`importantForAccessibility="no-hide-descendants"` no Android, `accessibilityViewIsModal` no iOS); o foco vai para o título ao abrir e volta ao elemento de origem ao fechar. O voltar do Android fecha a sobreposição do topo antes de navegar. Os avisos são anunciados como região viva.
6. **Tokens.** Cores, raios, alturas de item e durações vêm da anatomia; o componente não tem valor próprio.

> **Nota de implementação (2026-11-17):** a camada existe e é usada por todas as folhas, diálogos e avisos das telas; nenhum `Modal` no app.
>
> - **O store** é `src/controllers/overlay.ts`, um `zustand/vanilla` para o app inteiro, sem React: a pilha de folhas e diálogos, cada entrada com dono (`app` ou `session:<desktopId>`), e a fila de avisos. Fechar tem dois passos: `close` tira a entrada do topo na hora (o voltar já a pula, e o `onClose` roda uma vez) e `remove` a apaga quando a animação de saída termina. Um aviso por vez: o seguinte substitui o atual, a menos que o atual seja mais grave; aí espera na fila. `closeOwnedBy` fecha tudo de uma sessão: `ui/session/SessionOverlays.tsx` o chama quando a sessão termina, quando o desktop reinicia (os ids passam a significar outras coisas) e quando o usuário sai do desktop.
> - **A camada** é `ui/overlay/`: `OverlayProvider` (o store por contexto e o `OverlayUnderlay`, que tira o navegador da árvore do leitor de tela enquanto há sobreposição), `OverlayHost` (desenha a pilha e o aviso por cima dela, e trata o voltar do Android), `Sheet`, `Dialog`, `LiveDialog`, `Toast` e `useOverlay`, com que as telas abrem e fecham. A ordem do item 2 está em `ui/root/AppRoot.tsx`, com a tela de bloqueio entre os avisos e a cobertura: navegador → folhas e diálogos → avisos → tela de bloqueio → cobertura de privacidade.
> - **Descritor vivo de diálogo.** Além do diálogo estático, cujas propriedades são lidas uma vez na abertura, `openDialog({ useProps })` abre um `LiveDialog`, que roda o *hook* `useProps` a cada render: título, corpo e botões acompanham o idioma e qualquer store. A prévia do colar (`ui/terminal/PasteDialog.tsx`, cujo botão Colar acompanha o estado do painel) e a confirmação de fechamento (`ui/session/ConfirmCloseDialog.tsx`) usam a forma viva.
> - **Devolução do foco à origem** (item 5). Quem abre passa a referência do elemento tocado (`origin`); as primitivas e as linhas que abrem sobreposições a repassam (`Button`, `IconButton`, `ListRow`, `TabRow`, `GroupCard`, `TerminalBar`). Ao sair a entrada, o foco do leitor de tela volta à origem, **exceto** quando outra sobreposição continua aberta: um item de menu que abre um formulário deixa o foco no formulário, porque a origem está debaixo dele. Os botões de menu das linhas ficam ocultos ao leitor de tela (o menu é uma ação da linha), então com leitor a origem é a própria linha.
> - **Aviso com código em mono** (anatomia §4.14). O aviso aceita, além do texto, um código: onde ele aparece no texto, é desenhado em `type.mono-body`; se o texto não o traz, vai embaixo. É o que os avisos de ação falha usam para o código do protocolo (`actionToastOptions`, `ui/session/actionMessages.ts`). Erro fica 8 s e tem o `x`; aviso e informação ficam 6 s, sem `x`; o tempo para enquanto o usuário toca.
> - **O *scrim* do diálogo não fecha.** Tocar fora do diálogo não faz nada: fecham o voltar do Android, o gesto de escape do leitor de tela e o Cancelar. O *scrim* da folha fecha ao toque. O diálogo não tem transição (a anatomia só anima folhas).
> - Para o dono: o limiar do arrasto da folha (um alvo de toque, 48) não tem token; e, com uma folha aberta, o aviso fica fora do alcance do VoiceOver (`accessibilityViewIsModal` da folha).

## Alternativas consideradas

- **`@gorhom/bottom-sheet`.** Biblioteca MIT madura, com arrasto e pontos de parada. Rejeitada: a última versão é de maio de 2026, e a faixa aberta que ela declara (Gesture Handler `>=2.16.1`) não diz se foi testada com o Gesture Handler 3.3 e o Reanimated 4.7 do SDK 58; o app ficaria preso ao ritmo dela a cada SDK. Também não resolve diálogo nem aviso, que seriam outra peça.
- **Folha nativa (`formSheet` do `react-native-screens`, como rota do `expo-router`).** Nenhuma dependência nova. Rejeitada: cada folha vira rota, contra o "folhas não são telas" da anatomia; o diálogo de confirmação não sobreviveria à troca de tela; e a aparência fica em parte com o sistema, fora dos tokens.
- **`Modal` do React Native com conteúdo próprio.** Simples e com o foco de acessibilidade resolvido pelo sistema. Rejeitada pela janela nativa separada: ficaria por cima da cobertura do seletor de apps (RF-1.19) e fora do alcance do `FLAG_SECURE` aplicado à janela principal.

## Consequências

### Positivas

- Um só mecanismo para folhas, diálogos e avisos, com os valores da anatomia e sem dependência que atrasa o SDK.
- A cobertura de privacidade cobre tudo o que o app desenha.
- A confirmação de fechamento independe da tela, como a sessão exige.

### Negativas

- Código próprio para manter: arrasto, foco, voltar do Android, evitar-teclado, anúncio ao leitor de tela.
- Acessibilidade de modal feita à mão, nos dois sistemas, em vez de herdada do sistema.

### Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Leitor de tela escapa da sobreposição para o conteúdo de baixo | Média | Alto | Teste manual com TalkBack e VoiceOver em cada folha antes do critério de saída do marco |
| Pilha e navegação dessincronizam (folha de item que sumiu) | Média | Médio | A pilha é lógica pura, testada em Node, e reage à sessão e ao `workspace` |
| Arrasto da folha conflita com a rolagem da lista dentro dela | Média | Baixo | Arrasto só pela alça e pelo título, ou com a lista no topo |
