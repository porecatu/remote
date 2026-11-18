# Anatomia das telas

**Status:** **Aprovada** pelo dono do produto em 2026-11-16, com as oito recomendações do §7. É a especificação visual das telas: tokens, anatomia, gestos e textos daqui valem para a implementação ([README do design](README.md)). Implementada em 2026-11-17; as escolhas do código onde a anatomia não fixava nada esperam o aval do dono no §9.
**Data:** 2026-11-15 (proposta); 2026-11-16 (aprovação); 2026-11-17 (revisão pela especificação 0.4 do protocolo e escolhas da implementação, §9)
**Relacionados:** [PRD-000](../prd/prd-000-visao-de-produto.md) a [PRD-004](../prd/prd-004-gestao-de-abas.md), [arquitetura](../arquitetura.md) (mapa de telas, §7), [ADR-0002](../adr/0002-render-da-grade-com-skia.md), [ADR-0005](../adr/0005-catalogo-de-textos-e-idiomas.md), [ADR-0008](../adr/0008-icones-lucide-em-svg.md) a [ADR-0011](../adr/0011-folhas-dialogos-e-avisos-proprios.md), [especificação visual do desktop](https://github.com/porecatu/terminal/blob/main/docs/design/especificacao-visual.md)

Este é o primeiro documento de `docs/design/`: o desenho em ASCII, os tokens e os gestos de cada tela do [mapa de telas](../arquitetura.md). Foi escrito como proposta, para o dono aprovar, corrigir ou recusar antes de existir uma linha de tela, e aprovado em 2026-11-16; as decisões do dono do mesmo dia nos PRDs (RF-1.20, RF-2.8 e RF-3.17) já estão incorporadas ao texto. Segue a regra do Porecatu: nenhuma cor, dimensão ou espaçamento é inventado no código; o que não sai do desktop entra aqui.

## Como ler

- **Unidades.** Medidas em pontos lógicos (pt no iOS, dp no Android); tamanho de texto em pt/sp, que acompanha o ajuste de fonte do sistema.
- **Proposta.** A marca **(proposta)** identifica o valor, comportamento ou arranjo criado para o mobile, sem origem no PRD, na spec do protocolo ou na especificação visual do desktop. Com a aprovação, ele vale como os demais; a marca fica para dizer de onde o valor veio. Valor sem marca vem de um daqueles documentos, com a origem dita.
- **Textos.** As frases entre aspas são os valores em pt_BR aprovados. Entram no catálogo ([ADR-0005](../adr/0005-catalogo-de-textos-e-idiomas.md)) com o par em en_US, e o código só guarda códigos e identificadores.
- **Fora do alcance.** Mudar o protocolo, o PRD ou o desktop; a implementação do render Skia (ADR-0002, ainda Proposto). Ícones, fonte embutida, gestos e folhas estão decididos nos ADRs [0008](../adr/0008-icones-lucide-em-svg.md) a [0011](../adr/0011-folhas-dialogos-e-avisos-proprios.md).
- **Esboços.** ASCII sem escala; `[ ]` é botão, `( )` é escolha, `<` é voltar.

---

## 1. Princípios de desenho (propostas transversais)

1. **Uma coluna, uma mão.** Tudo cabe numa coluna de celular em retrato, com os controles frequentes ao alcance do polegar (barra de teclas, folhas de ação embaixo). Paisagem funciona, sem layout próprio; tablet usa o layout do celular ([PRD-000](../prd/prd-000-visao-de-produto.md), não-objetivos).
2. **Navegação em pilha.** Telas empilham (expo-router `Stack`); o voltar do sistema e o gesto de voltar do iOS fazem sempre o mesmo que a seta da barra. Ações sobre um item (menus, escolhas, confirmações) abrem **folhas inferiores** (*bottom sheets*) ou diálogos centrais, nunca telas novas; folhas, diálogos e avisos são componentes do app, numa camada própria ([ADR-0011](../adr/0011-folhas-dialogos-e-avisos-proprios.md)).
3. **Estado nunca só por cor.** Todo estado tem rótulo de texto ou ícone além da cor (acessibilidade e daltonismo). O desktop usa pontos coloridos; no celular o ponto acompanha um rótulo ou ícone.
4. **Ver é barato, agir é deliberado** ([PRD-000](../prd/prd-000-visao-de-produto.md)). Navegar é um toque; ações destrutivas ficam no fim das folhas, em tom destrutivo, e as que o desktop confirma abrem o diálogo de confirmação.
5. **Offline é um estado normal.** Tem tela, ícone e texto próprios, com tom neutro; só erro de verdade usa o vermelho.
6. **O app não fala por si.** O que a tela mostra é o último estado recebido do desktop; enquanto uma ação não tem `action-result`, o item mostra pendência e a árvore só muda quando o `workspace` novo chega ([PRD-004](../prd/prd-004-gestao-de-abas.md)).
7. **Modo claro e escuro do sistema** para o chrome ([PRD-002](../prd/prd-002-navegacao-do-workspace.md) RF-2.13); a grade do terminal usa só o `theme` do desktop, nos dois modos do sistema.
8. **Ícones Lucide**, a família do desktop, referidos por nome; terminologia "abas", grupos, fixadas.
9. **Sem animação decorativa.** Folhas sobem em 200 ms; reordenações da árvore em 150 ms lineares (a duração do `reflow` do desktop); spinners onde há espera. Com "reduzir movimento" ligado no sistema, tudo troca sem transição. O cursor da grade **não pisca** (proposta: poupa bateria e redesenho; o desktop pisca a 1,1 s).

---

## 2. Tokens propostos

A regra: **derivar** dos tokens do desktop ([especificação visual](https://github.com/porecatu/terminal/blob/main/docs/design/especificacao-visual.md) §1, tema [`thm_default.toml`](https://github.com/porecatu/terminal/blob/main/docs/config/thm_default.toml) e `thm_default_light.toml`). Coluna "Origem" diz o token do desktop; "proposta" marca o que é valor novo do mobile. Contrastes medidos pela razão WCAG 2.x.

O código espelha estes tokens em `ui/theme/`, um para um, com o nome em inglês e em *camelCase* (`bg.base` vira `bgBase`, `row.padding-x` vira `row.paddingX`): nenhum valor do chrome existe só no código, e o valor que faltar entra primeiro aqui.

### 2.1 Superfícies e bordas

| Token do app | Escuro | Claro | Origem no desktop |
|---|---|---|---|
| `bg.base` (fundo das telas de lista) | `#171b21` | `#eff1f5` | painel de configurações (`[settings] panel_background`) |
| `bg.bar` (barra superior, barra de teclas) | `#1b1f26` | `#e6e9ef` | barras (`[tabs] bar_background`) |
| `bg.row` (linha, cartão) | `#1c2028` | `#dce0e8` | linha de opção (`[settings] row_background`) |
| `bg.sheet` (folha, diálogo, menu) | `#1a1e25` | `#dce0e8` | popover (`[context_menu] background`) |
| `bg.field` (campo de texto) | `#0f1216` | `#eff1f5` | campo (`[group_editor] input_background`) |
| `bg.pressed` (toque em linha ou item) | `#242a33` | `#ccd0da` | hover de menu (`item_hover_background`); toque substitui hover |
| `bg.selected` (item escolhido, aba ativa no desktop) | `#282e37` | `#ccd0da` | aba ativa (`[tabs] active_background`) |
| `bg.key` (tecla da barra) | `#1d222a` | `#dce0e8` | chip de tecla (§1.2 do desktop) |
| `bg.key.pressed` | `#39404b` | `#bcc0cc` | hover do botão de fechar (`close_button_hover_background`) |
| `bg.terminal` | `theme.bg` do desktop | `theme.bg` do desktop | mensagem `theme`; antes de chegar, `#0f1216` / `#eff1f5` (`[terminal] background`) |
| `bg.scrim` (película atrás de folha e diálogo) | `#060709` a .45 | `#4c4f69` a .40 | `[dialog] overlay` (o claro, `#4c4f6966`, é .40) |
| `border.row` | `#262b34` | `#ccd0da` | borda de controle |
| `border.sheet` | `#2e343e` | `#bcc0cc` | borda de popover |
| `border.field` / foco | `#333a45` / `#5ed3bc` | `#bcc0cc` / `#179299` | `input_border` / `input_border_focus` |
| `scrollbar.thumb` (barra de rolagem da grade, §4.7) | `#c7ccd6` a .45 | `#4c4f69` a .45 | **proposta**; o claro usa o tom do `text.title` |
| `scrollbar.track` (trilho da barra de rolagem) | `#ffffff` a .06 | `#4c4f69` a .06 | **proposta** |
| `switch.thumb` (polegar do interruptor) | `#f0f3f6` | `#f0f3f6` | o do desktop (§4.4.1) |

### 2.2 Texto, acento e semânticas

| Token | Escuro | Claro | Origem / nota |
|---|---|---|---|
| `text.title` | `#e6eaef` | `#4c4f69` | título de diálogo / `title_foreground` (claro 7,1:1) |
| `text.body` | `#d7dce3` | `#4c4f69` | item de menu |
| `text.secondary` | `#a8b0bb` | `#5c5f77` | corpo do aviso (7,5:1 no escuro; 4,7:1 no claro sobre `bg.row`) |
| `text.tertiary` | `#828a96` | `#5c5f77` | terciário. **Proposta no claro:** o `#8c8fa1` do desktop dá 2,8:1 e o `#6c6f85` dá 3,7:1 sobre `bg.row`; ficam iguais ao secundário, e a hierarquia vem de tamanho e peso |
| `text.disabled` | `#5c646f` | `#8c8fa1` | item indisponível (`disabled_foreground`); só para desabilitado, onde o contraste não é exigido |
| `text.section` (rótulo de seção) | `#828a96` | `#5c5f77` | **Proposta:** o desktop usa `#5c646f` a 10 px (2,9:1), que reprova no celular; sobe para o terciário |
| `accent` (foco, link, ativo) | `#5ed3bc` | `#179299` | acento (`[status_bar] shell`); no claro serve a ícone e borda (3,3:1), nunca a texto pequeno |
| `accent.text` (texto de ação, no claro) | `#5ed3bc` | `#0d6a70` | **proposta:** o claro precisa de um tom mais escuro para texto (5,6:1 sobre `bg.base`, 4,8:1 sobre `bg.row`) |
| `on.accent` (texto sobre fundo primário) | `#f0f3f6` | `#ffffff` | botão primário do desktop (`#3f8f80` com `#f0f3f6`) |
| `primary` (fundo do botão primário, trilho ligado) | `#3f8f80` | `#179299` | Salvar do desktop; o rótulo é 16 pt/600 (texto grande, mínimo 3:1: 3,5:1 e 3,7:1) |
| `success` | `#86c56a` | `#40a02b` | sucesso; **indicador de atividade** |
| `warning` | `#e0b060` | `#df8e1d` | aviso |
| `warning.text` | `#e0b060` | `#7f4b00` | **proposta:** texto de aviso no claro (6,4:1; o `#df8e1d` dá 2,3:1) |
| `error` | `#ef8a8a` | `#d20f39` | erro; **indicador de campainha** |
| `error.text` | `#ef8a8a` | `#b80d32` | **proposta:** erro como texto sobre `bg.row` no claro (5,1:1; o `#d20f39` dá 4,1:1) |
| `destructive` | `#e08585` | `#d20f39` | item destrutivo (`destructive_foreground`); fundo de toque `#2e2224` / `#f2dee1` |
| `destructive.pressed` | `#2e2224` | `#f2dee1` | o fundo de toque do item destrutivo, acima, como token |
| `ungrouped` | `#7b838f` | `#8c8fa1` | cor de aba sem grupo (`ungrouped_color`) |
| `on.camera` (texto e ícones sobre a câmera) | `#ffffff` | `#ffffff` | **proposta:** a tela da câmera é sempre escura (§4.3.2) e usa os tokens do modo escuro nos dois modos; o texto sobre a imagem é branco |

**Cor de grupo.** Vem de `theme.group_colors` (na falta, as seis do desktop: `#ef8a8a #e0b060 #5ed3bc #6fa8f5 #a68cf0 #86c56a`). **Nunca é cor de texto**: sobre o fundo claro ela dá de 1,6:1 a 2,4:1. Vira só faixa, ponto, amostra e tingimento (alfa .14, o "fundo do badge" do desktop).

### 2.3 Tipografia

| Uso | Família | Tamanho / peso | Origem |
|---|---|---|---|
| Chrome (títulos, linhas, botões, menus) | fonte do sistema (San Francisco no iOS, Roboto no Android) | ver escala abaixo | o desktop usa a fonte de interface do sistema ([ADR-0084](https://github.com/porecatu/terminal/blob/main/docs/adr/0084-fonte-do-sistema-e-ajustes-da-barra-de-abas.md)) |
| Grade do terminal | Iosevka Fixed 400/500, embutida | calculado (ver §4.7) | `[terminal.font]`; ADR-0002 |
| Mono do chrome: badge de perfil, `usuário@host`, `cwd`, nome de processo, chips e rótulos de tecla, impressão digital, prévia de colagem | Iosevka Fixed | 11 no badge, 12–13 no resto; 24 na impressão digital (ver escala abaixo) | desktop: badges, chips, campo de senha. **Proposta:** estender a `usuário@host` e `cwd`, onde caminho e host leem melhor em mono |
| Ícones | Lucide | 24 de em; desenho ~0,6 da em; tamanho e traço por papel no §2.7 | ADR-0024 do desktop |

**Decisão (2026-11-16):** o badge de perfil em mono (§4.5.2, "chip mono 11") fica no tamanho dos chips, 11, para caber no `badge.height` de 20; o "12–13" vale para o resto do mono do chrome. A Iosevka embutida só tem os pesos 400 e 500: mono que pediria 600 usa 500.

Escala do chrome **(proposta)**, em sp (acompanha o ajuste de fonte; limite de 1,3× nas barras e na barra de teclas, que têm altura fixa; sem limite no corpo das listas, que crescem). Entrelinha **(proposta)**: 1,25 do tamanho nos papéis de uma linha e 1,45 no corpo e na linha secundária, que quebram; arredondada ao ponto inteiro.

| Papel | Tamanho / peso | Entrelinha | Token |
|---|---|---|---|
| Título de tela | 20 / 600 | 25 | `type.screen-title` |
| Título de diálogo e de folha | 17 / 600 | 21 | `type.dialog-title` |
| Nome de grupo e de janela (§4.5.2) | 16 / 600 | 20 | `type.group-title` |
| Botão: primário, de texto e de diálogo (o rótulo do `primary`, §2.2) | 16 / 600 | 20 | `type.button` |
| Linha principal (título de aba, nome de desktop) | 16 / 500 | 20 | `type.row-title` |
| Corpo; item de folha e de menu; nome da linha de configuração | 15 / 400 | 22 | `type.body` |
| Linha secundária; subtítulo de folha; prazo do diálogo | 13 / 400 | 19 | `type.secondary` |
| Rótulo de seção (caixa alta, espaçamento .6) | 12 / 600 | 15 | `type.section` |
| Chip, badge, contador, rótulo de estado, marca "Padrão", chip de zoom | 11 / 600 | 14 | `type.chip` |
| Rótulo de tecla (mono) | 13 / 500 | 16 | `type.key` |
| Badge de perfil (mono) | 11 / 500 | 14 | `type.mono-chip` |
| `usuário@host`, `cwd`, prévia de colagem (mono) | 12 / 400 | 17 | `type.mono-secondary` |
| Nome de processo, host do relay (mono) | 13 / 400 | 19 | `type.mono-body` |
| Impressão digital (mono, §4.3.4) | 24 / 500 | 30 | `type.fingerprint` |

Papel fora da escala usa o mais próximo dela: item de folha é corpo (15/400), botão de texto é botão (16/600), índice de painel na lista do §4.9 é corpo em `text.secondary`, rótulo de estado e marca "Padrão" são chip (11/600).

### 2.4 Raios

| Token | Valor | Origem |
|---|---|---|
| `radius.sheet` (canto superior da folha) | 10 | modal do desktop (10) |
| `radius.card` (linha, cartão, diálogo central) | 8 | janela, popover, cápsula de grupo (8) |
| `radius.control` (botão, campo, tecla, item de menu) | 6 | aba, botões da barra (6); campo 5 do desktop sobe a 6 por consistência com o botão, **proposta** |
| `radius.chip` (badge, chip, contador) | 4 | botão de fechar da aba (4); badge do desktop 3 |
| `radius.round` (ponto, trilho do interruptor, rádio, alça, barra de rolagem, chip de zoom) | 50% | ponto de status (50%) |

### 2.5 Dimensões próprias do mobile (todas propostas)

O desktop não tem equivalente: a precisão de um dedo exige alvos maiores que os 30 px dos botões dele.

| Token | Valor | Razão |
|---|---|---|
| `target.min` | **48** × 48 (Android Material); nunca abaixo de **44** (iOS HIG) | regra: alvo primário 48; 44 só onde falta altura (barra de teclas, §4.8) |
| `target.gap` | 8 | espaço mínimo entre alvos |
| `row.single` / `row.double` | 56 / 64 | linha de lista de uma e de duas linhas de texto |
| `row.group-header` | 52 | cabeçalho de grupo |
| `row.sheet` | 52 | item de folha de ação |
| `button.height` | 48 | o botão do desktop tem 30 |
| `field.height` | 48 | o campo do desktop tem 30 |
| `bar.height` | 56 (barra de tela), 48 (barra do terminal), 40 (terminal em paisagem, §4.6) | |
| `keybar.height` | 52 (teclas de 44, margem de 4) | |
| `gutter` | 16 | margem lateral das telas, mais a área segura do aparelho |
| `space.scale` | 4, 8, 12, 16, 24, 32 | o desktop usa 3, 6, 8, 10, 12, 18, 24; escala de 4 pt do mobile |
| `badge.height` | 20 | |
| `swatch` | 40 desenho, alvo 48 | amostra de cor do grupo (o desktop tem 28) |
| `dialog.width` | até 360 e margem de 24 de cada lado | o diálogo do desktop tem piso 360 e teto 720; no celular a largura é a da tela |
| `terminal.min-font` | 8 pt (de [RF-3.7](../prd/prd-003-terminal.md)) | limiar de "caber a largura" |
| `terminal.read-font` | 12 pt; máximo 24 pt | tamanho de leitura quando a largura não cabe (proposta; o PRD não fixa o valor) |
| `terminal.line-height` | 1,3 da fonte | **proposta:** o desktop usa 1,75; no celular, mais linhas visíveis |
| `border.width` | 1 | borda de cartão, de barra (a inferior, `border.row`), de folha (só a de cima) e de diálogo; divisor |
| `border.emphasis` | 2 | borda de destaque: tecla armada, painel focado na miniatura, anel da amostra escolhida, aro do rádio |
| `focus.width` / `focus.offset` | 2 / 2 | contorno de foco (`accent`) afastado do controle, como o Cancelar do §4.13 |
| `group.stripe` | 4 | faixa de cor do grupo (§4.5.2) |
| `indicator.slot` | 24 | espaço do indicador à esquerda da linha de aba (§4.5.2) |
| `dot` | 8 | ponto de estado, **um tamanho só**: linha de aba, rótulo de estado, barra ("Conectado"), miniatura de painéis |
| `sheet.handle` | 48 × 4 | alça de arrasto da folha, `border.sheet`, `radius.round` (§4.12) |
| `scrollbar.width` | 3 | barra de rolagem da grade, horizontal e vertical |
| `radio` | 20, aro 2, miolo 10 | rádio de escolha única (§4.12.8): aro `accent` escolhido, `border.field` não |
| `key.size` | 44 × 44 | tecla da barra (§4.8) |
| `keybar.separator` | 1 × 24 | separador entre os grupos de teclas, `border.row` |
| `keybar.fade` | 40 | largura do degradê da borda direita da barra de teclas, de `bg.bar` transparente a `bg.bar` |
| `banner.height` | 36 | faixa de conexão (§4.5.4) |
| `bottom-banner.height` | 56 | faixa inferior do painel `exited` e `disconnected` (§4.10) |
| `severity.width` | 3 | barra de severidade do aviso temporário (§4.14) |
| `deadline.height` | 2 | barra de prazo do diálogo (§4.13) |
| `state-card.max-width` | 300 | cartão central de estado do painel (§4.10) |
| `button.wide` | 240 | botão primário do estado vazio e da tela de estado |
| `lock.button` | 280 | botão "Desbloquear" (§4.1) |
| `app-icon` | 72 | ícone do app na tela de bloqueio (§4.1) |
| `camera.frame` | 260 | moldura do QR (§4.3.2) |
| `camera.corner` | 24 × 4 | **proposta:** comprimento e espessura de cada canto marcado da moldura |
| `zoom-chip.height` | 28 | chip temporário de zoom (§4.7) |
| `swatch.small` | 16 | amostra de cor na lista de Mover para grupo (§4.12.4) |
| `thumbnail.ratio` | 16 : 10 | miniatura da disposição de painéis (§4.9) |
| `grid.padding-top` | 12 | folga entre a barra do terminal e a primeira linha da grade |
| `grid.padding-x` | 8 | **proposta:** folga entre a grade e as bordas esquerda e direita do quadro; a largura de "ajustar à largura" já a desconta |
| `grid.padding-bottom` | 16 | **proposta:** folga entre a última linha e a borda de baixo do quadro |

### 2.6 Espaçamentos de componente (propostos)

Todos saem do `space.scale` (4, 8, 12, 16, 24, 32). Onde um valor intermediário (3, 5, 6, 10, 14, 18, 20) seria o natural, vale o da escala mais próximo que não quebra o alvo mínimo, como dito em cada linha. Duas exceções vêm de seções que já fixam o valor: o `padding` 20 do diálogo (§4.13) e o vão de 6 entre teclas (§4.8).

| Token | Valor | Uso e normalização |
|---|---|---|
| `list.padding` | 16 | margem da lista de cartões (= `gutter`) |
| `list.gap` | 8 | vão entre cartões |
| `row.padding-x` / `row.padding-y` | 16 / 12 | linha de desktop, de configuração e item de folha; a linha tem a altura mínima de `row.*` e centra o conteúdo |
| `row.icon-gap` | 16 | ícone à esquerda até o texto (14 → 16) |
| `row.line-gap` | 0 | entre a linha 1 e a 2: a entrelinha de 1,45 da secundária já dá o respiro (3 → 0; com 4, a linha de 64 não fecha) |
| `row.inline-gap` | 4 | entre título, badge e chips na mesma linha |
| `tab-row.padding-x` | 12 | linha de aba (10 → 12) |
| `tab-row.gap` | 8 | do indicador de 24 ao título (10 → 8: o próprio espaço do indicador já afasta) |
| `tree.loose-indent` | 4 | recuo do cartão de aba solta, que alinha com o texto dos grupos (= `group.stripe`) |
| `divider.inset` | 16 | recuo lateral do divisor do menu (20 → 16, a margem da folha) |
| `divider.margin-y` | 8 | vão acima e abaixo do divisor do menu (6 → 8) |
| `window.gap` | 12 | margem do divisor no topo de cada janela a partir da segunda |
| `bar.padding-x` | 4 | barras: os botões de 48 ficam a 4 da borda |
| `bar.title-inset` | 16 | título da barra sem voltar à esquerda (lista de desktops) |
| `section.padding-top` | 24 | rótulo de seção entre blocos (20 → 24) |
| `section.padding-top-first` | 4 | rótulo de seção no topo da janela |
| `section.padding-x` / `section.padding-bottom` | 16 / 8 | rótulo de seção |
| `chip.padding-x` | 8 | badge e chip (6 → 8: o texto de 11 não encosta na borda) |
| `chip.gap` | 4 | ícone ou ponto até o texto no chip (5 → 4) |
| `sheet.padding-x` | 16 | margem lateral da folha (20 → 16, o `gutter`) |
| `sheet.padding-bottom` | 24 | fim da folha, mais a área segura |
| `sheet.handle-padding` | 8 em cima, 4 embaixo | em volta da alça |
| `sheet.title-padding` | 8 em cima, 12 embaixo | título e subtítulo da folha |
| `dialog.padding` | 20 | diálogo central (§4.13) |
| `dialog.gap` | 12 | vão entre título, corpo, lista e botões |
| `dialog.list-indent` | 12 | recuo da lista de processos (14 → 12) |
| `button.padding-x` | 16 | botão de diálogo e de texto (18 → 16) |
| `button.gap` | 8 | vão entre botões (= `target.gap`) |
| `field.padding-x` | 12 | texto dentro do campo |
| `form.gap` | 8 | rótulo, campo e linha de apoio |
| `card.padding` | 16 | cartão da impressão digital, prévia de colagem, cartão de estado do painel |
| `state.padding-x` | 32 | tela de estado e estado vazio |
| `state.gap` | 12 | entre título e corpo |
| `state.block-gap` | 24 | do ícone ao título e do corpo ao botão (20 → 24) |
| `banner.padding-x` / `banner.gap` | 16 / 8 | faixas de conexão e de aviso |
| `snackbar.margin` | 16 | do fim da tela e acima da barra de teclas (§4.14) |
| `snackbar.padding` | 12 | dentro do aviso temporário |
| `key.margin` / `key.gap` | 4 / 6 | barra de teclas (§4.8) |
| `key.padding-x` | 8 | rótulo dentro da tecla (10 → 8) |
| `zoom-chip.padding-x` / `zoom-chip.top` | 12 / 12 | chip de zoom, centrado no topo da grade |
| `scrollbar.inset` | 4 | da barra de rolagem à borda da grade (3 e 6 → 4) |
| `thumbnail.padding` | 4 | título e ponto dentro de cada painel da miniatura |

### 2.7 Ícones (propostos)

Lucide, tamanho fixo (não acompanha o ajuste de fonte, [ADR-0008](../adr/0008-icones-lucide-em-svg.md)), traço **2** salvo onde dito. A cor é sempre um token de §2.1/§2.2.

| Papel | Tamanho | Traço | Onde |
|---|---|---|---|
| `icon.bar` | 24 | 2 | barras: voltar, `plus`, `settings`, `search`, `keyboard`, `ellipsis-vertical` da barra; `x` e `flashlight` da câmera |
| `icon.row` | 24 | 2 | ícone à esquerda da linha (`monitor` da linha de desktop) |
| `icon.item` | 22 | 2 | item de folha; botão `ellipsis-vertical` da linha e do cabeçalho de grupo |
| `icon.chevron` | 20 | 2 | chevrons de janela, de grupo e de linha que navega |
| `icon.inline` | 20 | 2 | ícone junto do texto de botão ("Nova aba"), `check` de escolha e da amostra, `x` do aviso |
| `icon.key` | 18 | 2 | setas e `clipboard-paste` da barra de teclas |
| `icon.indicator` | 16 | 2 | `bell`, `pin`, ícone das faixas |
| `icon.spinner` | 16 | 2 | spinner, **um tamanho só** (§4.2, §4.7): `loader-circle` em `accent`, uma volta por segundo, linear |
| `icon.chip` | 14 | 2 | ícone dentro de chip; `monitor` de "ativa no desktop" |
| `icon.thumb` | 12 | 2 | `monitor` do painel focado na miniatura (§4.9) |
| `icon.lock` | 10 | 2,5 | cadeado da tecla travada (§4.8): o traço mais grosso não some no tamanho pequeno |
| `icon.state` | 48 | 1,5 | estado vazio, tela de estado, permissão da câmera, resultado do pareamento, cartão de estado do painel |

### 2.8 Sombras (propostas)

Iguais nos dois modos, em preto.

| Token | Deslocamento vertical | Desfoque | Opacidade |
|---|---|---|---|
| `shadow.sheet` | −8 | 24 | .30 |
| `shadow.dialog` | 16 | 40 | .45 |

### 2.9 Opacidades e durações

| Token | Valor | Uso |
|---|---|---|
| `opacity.pending` | .60 | linha com ação pendente (§4.5.2) |
| `opacity.read-only` | .60 | árvore durante a reconexão (§4.5.4); grade esmaecida em `reconnecting` (§4.10) |
| `opacity.zoom-chip` | .92 | fundo `bg.sheet` do chip de zoom, com borda `border.sheet` **(proposta)** |
| `opacity.group-tint` | .14 | tingimento da cor do grupo (§2.2) |
| `duration.sheet` | 200 ms | folha sobe e desce (§1, princípio 9) |
| `duration.reflow` | 150 ms, linear | entrada, saída e reordenação de linhas da árvore |
| `duration.spinner` | 1 s, linear | uma volta do spinner |
| `duration.qr-invalid` | 400 ms | moldura vermelha no QR inválido (§4.3.2) |
| `duration.pair-success` | 800 ms | "Pareado com …" antes do workspace (§4.3.4) |
| `duration.zoom-chip` | 1 s | chip de zoom depois da pinça (§4.7) |
| `duration.bell` | 2 s | `bell` piscando na barra do terminal (§4.6) |
| `duration.snackbar-info` / `duration.snackbar-error` | 6 s / 8 s | aviso temporário (§4.14) |
| `duration.key-repeat-delay` / `duration.key-repeat-interval` | 400 ms / 80 ms | repetição das setas (§4.8) |

Com "reduzir movimento" ligado, as durações de transição (`sheet`, `reflow`) viram zero; spinner, prazos e avisos ficam (§5, item 6).

### 2.10 Conferência com o código (2026-11-17)

Todo valor de `ui/theme/` (`colors.ts`, `tokens.ts`, `typography.ts`, `fonts.ts`) tem a sua linha de §2.1 a §2.9, com o mesmo valor. O inverso não vale por inteiro: o código usa alguns valores que **nenhum token** desta seção nomeia. Não foram acrescentados aqui, porque nenhum tem o aval do dono; estão no §9.2 (transversais, Parear e Terminal), cada um com o valor que o código usa:

- `primary.pressed`: não existe; o botão primário não muda ao toque.
- primário desabilitado: não existe; o código usa `bg.pressed` com o rótulo em `text.disabled`.
- `banner.padding-y`: não existe; a faixa usa `space.s` (8).
- distância de arrasto que fecha a folha: não existe; o código usa `target.min` (48).
- `bg.field` como fundo de chip e badge: a §2.1 só dá o campo de texto.
- anel de contagem do pareamento (§4.3.4): o código usa `icon.state` (48, traço 1,5), com `space.s` entre o anel e o tempo; na câmera, `space.l` entre a moldura e a instrução.
- proporções do render da grade: polegar mínimo da barra de rolagem = `scrollbar.width` (3); espessura do cursor sublinhado e barra = 2 × o sublinhado da fonte; traço de box-drawing = o sublinhado (0,05 em), o pesado o dobro; vão do tracejado de 1/3; inclinação do itálico de −0,2; sombreamentos de 25%, 50% e 75%.

---

## 3. Mapa de navegação

É o [mapa de telas](../arquitetura.md) §7, já com o ajuste aprovado (§7, item 8): "Sobre este aparelho" entra por **Configurações** (rara demais para ocupar a barra da lista).

```
Bloqueio -> Lista de desktops --+--> Parear: permissão da câmera -> câmera -> Nome do aparelho
                |               |                                              |
                |               |   deep link porecatu://pair ------------------+
                |               |                                              v
                |               |                              Aguardando confirmação -> (erro | aceito)
                |               |                                              |
                |               +--> Configurações --> Este aparelho            |
                v                                                              v
           Conectando -> Workspace  <-------------------------------------------+
                          |   (busca; janelas; fixadas; grupos; abas)
                          |
                          +--> folhas: Menu da aba · Menu do grupo · Nova aba · Renomear ·
                          |            Mover (grupo, janela) · Novo grupo · Cor
                          v
                       Terminal (grade; barra de teclas; seletor de painéis; colar)
                          +--> diálogo: Confirmação de fechamento
```

Transversais: **Cobertura do seletor de apps** (RF-1.19), **Faixa de conexão** (§4.5.4), **Aviso temporário** (*snackbar*, §4.14).

---

## 4. Telas

Cada tela traz: objetivo e RF, hierarquia, estados, gestos e navegação, acessibilidade e esboço.

### 4.1 Bloqueio (biometria)

**Objetivo.** Impedir que o aparelho desbloqueado nas mãos erradas abra o desktop do usuário. RF-1.17, RF-1.18, RF-1.19.

**Quando aparece.** Ao abrir o app e ao voltar do segundo plano depois de 1 minuto (RF-1.17: valor fixo, sem ajuste na v1). Antes de qualquer lista de desktops; o *deep link* de pareamento também espera o desbloqueio.

**Conteúdo.** Fundo `bg.base`; ao centro o ícone do app (72), o nome "Porecatu Remote" e uma linha "Bloqueado". Botão primário "Desbloquear" (48 de altura, largura de 280). O prompt do sistema (Face ID, impressão digital, código do aparelho) abre **sozinho** ao aparecer a tela; o botão serve para tentar de novo.

```
+-----------------------------+
|                             |
|                             |
|          [ icone ]          |
|      Porecatu Remote        |
|          Bloqueado          |
|                             |
|     [     Desbloquear    ]  |
|                             |
+-----------------------------+
```

**Estados.**

| Estado | Tela |
|---|---|
| Aguardando o sistema | Só a tela acima; o prompt do sistema por cima. |
| Cancelado ou recusado | Texto "Não foi possível desbloquear." e o botão. Nenhum contador próprio de tentativas: quem limita é o sistema. |
| Bloqueio do sistema por excesso de tentativas | Texto "Biometria indisponível por enquanto. Use o código do aparelho." e o botão abre o fluxo do código. |
| Sem biometria nem código cadastrado | A tela de bloqueio **não aparece**: o app abre sem bloqueio (RF-1.20) e mostra um **aviso permanente**: faixa de aviso no topo da lista de desktops (a mesma faixa do erro de leitura, §4.2), "Este aparelho não tem tela bloqueada, então o app não pode ser bloqueado. Configure uma nas configurações do sistema.", com o botão "Abrir configurações do sistema". A faixa some quando o sistema passa a ter bloqueio. Nesse estado, desligar o bloqueio nas configurações do app não pede autenticação. |

**Cobertura do seletor de apps (RF-1.19).** Ao ir para o segundo plano, o app troca a árvore por uma tela neutra (o ícone sobre `bg.base`) **antes** da captura do sistema, com ou sem bloqueio ligado. No Android, a tela do terminal usa `FLAG_SECURE`: grade e histórico também não saem em captura de tela ou gravação.

**Navegação.** Sem voltar: o voltar do sistema leva o app ao segundo plano.

**Acessibilidade.** O foco do leitor de tela inicia no botão "Desbloquear"; rótulo "Desbloquear o app". O ícone é decorativo.

### 4.2 Lista de desktops

**Objetivo.** Tela inicial: os desktops pareados, o estado de cada um, o caminho para parear. RF-1.12 a RF-1.16.

**Hierarquia.** Barra de 56: título "Desktops"; à direita `plus` ("Parear desktop") e `settings` ("Configurações"), alvos de 48. Corpo: lista rolável, puxar para atualizar.

**Linha de desktop** (`row.double`, 64):

```
+----------------------------------------------+
| [monitor]  Casa                    (o) Online|
|            relay.exemplo.com.br  ·  agora    |  ... menu (3 pontos)
+----------------------------------------------+
```

- Ícone `monitor` (24, `text.secondary`) à esquerda.
- Linha 1: nome do desktop (16/500); à direita o **rótulo de estado** (chip com ponto + texto).
- Linha 2: só o host da URL do relay e a hora da última tentativa ("agora", "há 3 min", "ontem"); 13/400 `text.secondary`.
- Botão `ellipsis-vertical` (alvo 48) abre a folha da linha: **Renomear**, **Remover**. É o caminho garantido; o toque longo na linha abre a mesma folha (atalho, nunca o único caminho).

| Rótulo de estado (RF-1.12) | Visual |
|---|---|
| Online (presença) | ponto `success` + "Online" |
| Offline (`host-unavailable`, ou presença offline) | ponto neutro `text.tertiary` + "Offline"; **sem vermelho** (princípio 5) |
| Conectando | spinner de 16 + "Conectando…" |
| Erro (relay inalcançável, versão incompatível) | ícone `triangle-alert` em `warning` + "Erro"; a linha 2 troca o host pelo motivo curto ("Relay inalcançável", "Versão incompatível") |
| Não pareado | ícone `shield-off` em `warning` + "Não pareado"; a linha 2: "Pareie de novo ou remova". Dois botões de texto na própria linha, "Parear de novo" e "Remover", substituem o menu (RF-1.16) |

**Presença (RF-1.13).** O app consulta ao abrir a lista, ao puxar para atualizar e a cada 30 s com a lista visível; nada em segundo plano. Enquanto consulta, o rótulo mantém o último valor (sem piscar). O estado "Conectando" é só o da tentativa de abrir o workspace.

**Toque (RF-1.14).** Em desktop online ou ainda sem estado, abre o workspace (tela "Conectando"). Em offline: o rótulo vira "Conectando…", tenta e volta a "Offline" com a hora atual.

**Estado vazio.** Ícone `monitor-smartphone` (48, `text.tertiary`), título "Nenhum desktop pareado", texto "No Porecatu do seu computador, abra o acesso remoto e mostre o código QR. Depois toque em Parear desktop." e botão primário "Parear desktop". (O caminho exato nas configurações do desktop é do PRD do desktop; o texto final se ajusta a ele.)

**Estado carregando.** Primeira abertura: linhas-esqueleto (3) por até 1 s, enquanto o `desktops.v1` é lido do armazenamento seguro.

**Erro de leitura da lista** (armazenamento seguro falhou): faixa de aviso "Não foi possível ler os desktops pareados." com "Tentar de novo". Nunca apaga nada sozinho.

**Remover (RF-1.15).** Diálogo central: título "Remover Casa?"; corpo "O aparelho continua aparecendo como pareado no Porecatu desse computador até você revogá-lo lá."; botões **Cancelar** e **Remover** (destrutivo).

**Renomear.** Folha com um campo, só local (diz isso em linha de apoio: "Só neste aparelho").

**Acessibilidade.** Cada linha é um elemento único com rótulo composto: "Casa, online, relay relay.exemplo.com.br, última tentativa agora", ação padrão "Abrir"; ações personalizadas do leitor de tela "Renomear" e "Remover" (o toque longo não é exigido). Barra: botões com rótulo ("Parear desktop", "Configurações"). Atualizar por gesto tem ação equivalente no leitor de tela.

### 4.3 Parear

Quatro passos: permissão e câmera, nome do aparelho, aguardando confirmação, resultado. RF-1.4 a RF-1.11.

#### 4.3.1 Permissão da câmera

**Objetivo.** Explicar por que a câmera, antes do prompt do sistema (RF-1.4). Aparece só enquanto a permissão não foi dada.

```
+-----------------------------+
| <  Parear desktop           |
|                             |
|         [ camera ]          |
|   O app precisa da câmera   |
|   para ler o código QR que  |
|   o Porecatu mostra no seu  |
|   computador. A imagem não  |
|   sai do aparelho.          |
|                             |
|    [  Permitir a câmera  ]  |
+-----------------------------+
```

Permissão negada e sem como perguntar de novo: o botão vira "Abrir configurações do sistema" e o texto diz que a permissão foi negada. Não há alternativa de digitar código (RF-1.4, fora de escopo).

#### 4.3.2 Câmera

**Objetivo.** Ler o QR. Tela cheia escura (independe do modo do sistema), com a câmera ao fundo.

- Barra translúcida no topo: `x` (fechar, 48) e, à direita, `flashlight` (lanterna, alterna; **proposta**, ajuda com o QR em monitor, risco do [PRD-001](../prd/prd-001-desktops-e-pareamento.md)).
- Moldura quadrada de 260 com cantos marcados em `accent`; fora dela a imagem escurece (`bg.scrim`).
- Instrução abaixo da moldura: "Aponte para o código QR do Porecatu" (15, branco).

```
+-----------------------------+
|  x                    (luz) |
|                             |
|      +-               -+    |
|                             |
|      |   [ camera ]   |    |
|                             |
|      +-               -+    |
|  Aponte para o código QR    |
|       do Porecatu           |
+-----------------------------+
```

**Leitura e validação (RF-1.6).** O primeiro QR lido trava a leitura (nenhuma segunda leitura enquanto a tela trata a primeira). Se a URI é inválida, a moldura fica vermelha por 400 ms e entra uma **folha de erro** com o motivo e "Ler de novo", a leitura só retoma ao fechá-la:

| Motivo | Texto |
|---|---|
| Versão incompatível | "Este código é de uma versão do Porecatu que o app não entende. Atualize o app ou o Porecatu." |
| Relay inseguro | "O código aponta para um relay sem conexão segura (wss). Por segurança o app não conecta." |
| Não é do Porecatu | "Este código QR não é do Porecatu." |
| Campo faltando | tratado como "não é do Porecatu" |

Câmera ocupada ou sem câmera no aparelho: tela de estado com `camera-off` e o motivo.

**Pelo *deep link*.** Ler o QR com a câmera do sistema abre `porecatu://pair` e pula esta tela; vai direto ao nome do aparelho (depois do bloqueio, §4.1).

**Acessibilidade.** Para quem não vê a moldura: a câmera mantém a leitura contínua; o leitor de tela anuncia "Procurando o código QR… " e, ao ler, "Código lido". Instruções também em texto na tela. O fechar fica sempre disponível.

#### 4.3.3 Nome do aparelho

**Objetivo.** RF-1.7: pedir o nome deste aparelho e mostrar o nome do desktop que veio no QR.

```
+-----------------------------+
| <  Parear desktop           |
|                             |
|  Desktop                    |
|  Casa                       |
|  relay.exemplo.com.br       |
|                             |
|  NOME DESTE APARELHO        |
|  +-----------------------+  |
|  | Pixel 8 de Leonardo   |  |
|  +-----------------------+  |
|  Aparece no Porecatu para   |
|  você reconhecer o aparelho.|
|                             |
|  [        Conectar        ]  |
+-----------------------------+
```

- O campo vem pré-preenchido com o modelo do aparelho; máximo de **64** caracteres, com contador "52/64" a partir dos 48; vazio desabilita "Conectar".
- Bloco do desktop: ícone `monitor`, nome do QR em 16/500 e o host do relay em mono 13.
- Voltar descarta a leitura (o token de uso único e de 5 minutos não é gasto até conectar).

**Acessibilidade.** Rótulo do campo "Nome deste aparelho"; o contador é anunciado ao passar de 48. O botão fica acima do teclado (a tela rola e o botão acompanha).

#### 4.3.4 Aguardando confirmação

**Objetivo.** RF-1.8 a RF-1.10: conectar, conferir a chave do desktop e esperar a confirmação **no desktop**, mostrando a impressão digital deste aparelho para comparação.

Duas fases na mesma tela:

1. **Conectando.** Spinner e a lista de passos em texto: "Conectando ao relay…", "Verificando o desktop…". Cancelar disponível.
2. **Esperando o desktop** (até 120 s):

```
+-----------------------------+
| x  Parear com Casa          |
|                             |
|   Confirme no Porecatu do   |
|   seu computador.           |
|                             |
|   Compare esta impressão    |
|   digital com a que ele     |
|   mostra:                   |
|                             |
|   +---------------------+   |
|   | ABCD EFGH IJKL MNOP |   |
|   +---------------------+   |
|                             |
|     (  anel de espera  )    |
|          1:42               |
|                             |
|   [       Cancelar       ]  |
+-----------------------------+
```

- A impressão digital em **mono 24/500**, `text.title`, em uma linha (`ABCD EFGH IJKL MNOP` cabe em 360); com ajuste de fonte alto quebra em duas linhas de dois grupos. Cartão `bg.row`.
- O anel de progresso e o tempo restante ("1:42") substituem o "indicador de espera" do RF-1.9; os 120 s contam a partir do envio.
- Cancelar fecha o canal e não grava nada.

**Resultados (RF-1.10).**

| Resultado | Tela |
|---|---|
| `pair-accepted` | Ícone `circle-check` em `success` e "Pareado com Casa" por 800 ms; o desktop entra na lista (nome vindo do desktop, RF-1.10) e o app abre o workspace dele na mesma sessão. |
| `token-invalid` | Tela de estado: ícone `triangle-alert`, "O código QR expirou ou já foi usado. Gere outro no Porecatu." e botões "Ler outro código" e "Fechar". |
| `user-declined` | "O pareamento foi recusado no computador." |
| `timeout` | "O computador não respondeu a tempo. Tente de novo." |
| Identidade diferente (RF-1.8) | **Tela de erro de segurança**, ícone `shield-alert` em `error`, título "Este computador não é quem o código dizia ser". Corpo: "A identidade que ele apresentou não confere com a do código QR. Nada foi enviado nem guardado. Não tente de novo com este código." Botão "Fechar". Nenhum botão de "continuar assim mesmo". |
| Relay inalcançável | "Não foi possível alcançar o relay relay.exemplo.com.br." e "Tentar de novo". |

Nada é gravado em nenhum caso de erro (RF-1.10).

**Parear de novo um desktop existente (RF-1.11).** Substitui a entrada; o texto de sucesso é o mesmo, sem duplicar na lista.

**Acessibilidade.** A impressão digital tem rótulo de leitura **caractere a caractere** com pausa entre os grupos ("A B C D, E F G H…"), para a conferência por voz. O tempo restante é anunciado a cada 30 s e aos 10 s finais (região viva educada). Alvos de 48; o botão cancelar não muda de posição entre as fases.

### 4.4 Configurações e Sobre este aparelho

#### 4.4.1 Configurações

**Objetivo.** Idioma, bloqueio, vibração; entrada para o aparelho. RF-1.17, RF-1.18, RF-3.23 e [ADR-0005](../adr/0005-catalogo-de-textos-e-idiomas.md).

Lista de linhas no padrão da tela de configurações do desktop (§2.12 dele: linha `bg.row`, nome 15, descrição 13 `text.secondary`, controle à direita), agrupada por rótulo de seção:

```
+-----------------------------+
| <  Configurações            |
|                             |
|  APARELHO                   |
|  +-----------------------+  |
|  | Este aparelho       > |  |
|  +-----------------------+  |
|  SEGURANÇA                  |
|  +-----------------------+  |
|  | Bloquear o app  [ON ] |  |
|  | Pede biometria ao     |  |
|  | abrir e após 1 minuto |  |
|  +-----------------------+  |
|  TERMINAL                   |
|  +-----------------------+  |
|  | Vibrar na campainha   |  |
|  |                  [ON ]|  |
|  +-----------------------+  |
|  IDIOMA                     |
|  +-----------------------+  |
|  | Idioma  Sistema     > |  |
|  +-----------------------+  |
|  SOBRE O APP                |
|   Versão 0.1.0 · GPL-3.0    |
+-----------------------------+
```

- **Bloquear o app.** Interruptor, ligado por padrão. Desligar exige o desbloqueio (RF-1.18): o toque abre o prompt do sistema e só então muda. Ligar não exige. Interruptor com o trilho `primary` ligado e `border.field` desligado, polegar `#f0f3f6` (o do desktop, `#3f8f80`/`#2a3038`).
- **Vibrar na campainha.** Interruptor; some a linha quando o aparelho não tem vibração. Tem descrição "Uma vibração curta quando o painel aberto toca a campainha."
- **Idioma.** Abre uma lista com escolha única: "Seguir o sistema" (padrão), "English (United States)", "Português (Brasil)", cada nome no próprio idioma. A troca vale na hora, sem reiniciar.
- **Sobre o app.** Linha informativa com versão e licença (**proposta**: o PRD não pede; custo mínimo e útil para suporte).
- **Tema.** Não há opção: o chrome segue o sistema (RF-2.13).

#### 4.4.2 Este aparelho (RF-1.1 a RF-1.3)

```
+-----------------------------+
| <  Este aparelho            |
|                             |
|  NOME                       |
|  Pixel 8 de Leonardo        |
|                             |
|  IMPRESSÃO DIGITAL          |
|  +-----------------------+  |
|  | ABCD EFGH IJKL MNOP   |  |
|  +-----------------------+  |
|  [ Copiar ]                 |
|  Confira esta sequência no  |
|  Porecatu ao parear.        |
|                             |
|  [ Recriar identidade ]     |
|  (destrutivo, texto)        |
+-----------------------------+
```

- Nome e impressão digital em leitura apenas (o nome vem do pareamento; o PRD não prevê renomear o aparelho). "Copiar" copia só a impressão digital, que é pública (**proposta**).
- A chave privada **nunca** aparece (RF-1.1).
- **Recriar identidade (RF-1.3).** Diálogo central, título "Recriar a identidade deste aparelho?"; corpo "Todos os pareamentos serão perdidos: o app apaga a chave e a lista de desktops. Você terá de parear de novo cada um e revogar este aparelho nos computadores."; botões **Cancelar** (foco) e **Recriar** (destrutivo). Com o bloqueio ligado, o app pede o desbloqueio antes do diálogo **(proposta: ação irreversível sobre credencial)**.

**Acessibilidade.** Impressão digital lida por caractere, como no §4.3.4. Linhas são rótulo + valor num só elemento.

### 4.5 Workspace

**Objetivo.** O mesmo workspace do desktop: janelas, abas fixadas, grupos e abas, ao vivo; achar a aba do projeto B em dois toques. RF-2.1 a RF-2.13.

#### 4.5.1 Conectando (RF-2.1)

Antes de `ready` a tela mostra a barra com o nome do desktop e, no corpo, o spinner com a etapa atual em texto: "Conectando…", "Autenticando…", "Carregando o workspace…". Voltar cancela.

Falhas na entrada: `incompatible` (RF-2.2) e erros fatais vão para uma **tela de estado** (ícone grande, título, texto, botão):

| Caso | Tela |
|---|---|
| `incompatible`, app mais velho | `refresh-cw`: "É preciso atualizar o app." e a versão de cada lado |
| `incompatible`, desktop mais velho | "É preciso atualizar o Porecatu no computador." idem |
| `host-unavailable` | `monitor-off`, "Casa está offline." e "Tentar de novo" |
| `not-paired` | `shield-off`, "Este aparelho não está pareado com Casa. Pareie de novo." (RF-2.3); botão "Parear de novo" |

Todas voltam à lista ao fechar, com o desktop já marcado.

#### 4.5.2 A árvore

**Hierarquia.**

```
+-----------------------------+
| <  Casa              (lupa) |
|    Conectado                |
+-----------------------------+
|  v Janela 1                 |   (so se houver mais de uma)
|    FIXADAS                  |
|  +-----------------------+  |
|  | > ssh  deploy@srv  (o)|  |
|  +-----------------------+  |
|    TRILHA                   |
|  +-[ vermelho ]----------+  |
|  | Servidores  3   v   : |  |
|  |  build            (.) |  |
|  |  api         2 pain.  |  |
|  |  logs      saiu (0)   |  |
|  |  + Nova aba           |  |
|  +-----------------------+  |
|  +-----------------------+  |
|  |  docs                 |  |
|  +-----------------------+  |
|  + Nova aba                 |
|  > Janela 2                 |
+-----------------------------+
```

1. **Barra.** Voltar; título = nome do desktop; linha de apoio = estado da conexão (§4.5.4). À direita, `search` (48) que abre o campo de busca.
2. **Janelas (RF-2.6).** Na ordem recebida (mais recente primeiro). Com **uma** janela, o cabeçalho some e o conteúdo ocupa a tela. Com várias, cada janela é uma **seção recolhível**: cabeçalho de 52 com chevron, "Janela N" (N pela ordem) e, na linha de baixo, o título da aba ativa dela (`window.title`, 13 `text.secondary`) para o usuário reconhecer qual é; à direita a contagem de abas. Todas começam expandidas, e o estado recolhido fica na memória do app (como a expansão local de grupo, [arquitetura](../arquitetura.md) §2). Seções recolhíveis numa só rolagem, e não uma janela por vez com seletor de chips (§7, item 1).
3. **Fixadas (RF-2.7).** Primeiro bloco da janela, com o rótulo de seção "Fixadas" (**proposta**: o desktop não rotula, mas numa lista vertical o rótulo explica por que o bloco vem separado). Abas soltas, sem grupo, com o ícone `pin` (16, `text.tertiary`) à esquerda do título.
4. **Trilha (RF-2.7).** Grupos e abas soltas na ordem do desktop. Sem rótulo "Trilha" quando não há fixadas (o rótulo só existe para separar).
5. **Grupo.** Cartão `bg.row` com **faixa de 4 de largura na cor do grupo** na borda esquerda, tingimento .14 da cor no cabeçalho, e o cabeçalho de 52: nome (16/600), contagem de abas em chip (`badge`) e `ellipsis-vertical` (alvo 48) do menu do grupo. A cor é só faixa e tingimento, nunca o texto (§2.2). Grupo aberto no desktop aparece aberto e **não se recolhe só no app**: o cabeçalho não tem chevron nem toque de recolher (RF-2.8). Grupo colapsado **no desktop** abre recolhido, com a linha "Colapsado no desktop" (13, `text.tertiary`) sob o nome e um chevron à direita; o toque no cabeçalho o **expande só no app**, e um novo toque o recolhe de volta ao estado do desktop. O app não muda o desktop (colapsar e expandir lá é ação do menu do grupo, §4.12.2).
6. **Aba solta.** Cartão próprio `bg.row` (aba dentro de grupo é uma linha do cartão do grupo, sem borda própria).
7. **"Nova aba".** Última linha de cada janela e de cada grupo expandido: ícone `plus` e "Nova aba" em `accent.text`, 48 de altura. Toque abre a folha de §4.12.8, já com o contexto (janela ou grupo).

**Linha de aba (RF-2.9)** (`row.double`, 64; toque abre o terminal; toque longo ou `ellipsis-vertical` abre o menu):

```
+--------------------------------------------+
| (o) build                      [2 pain.]  : |
|     ssh  deploy@srv:  ~/projetos            |
+--------------------------------------------+
```

- **Indicador à esquerda** (24): ponto 8 `success` (atividade) ou ícone `bell` 16 `error` (campainha); **um só**, campainha vence, como no desktop (§2.17 dele: um ponto só). Proposta: a campainha é ícone e a atividade é ponto, para não depender só da cor. Aba do estado `exited` não mostra nenhum dos dois, como no desktop. Sem indicador, o espaço fica reservado (o título não pula).
- **Título** (16/500, uma linha, reticências), exatamente o do desktop (`title`); em aba SSH, `remote` (`usuário@host`) na linha 2 em mono 12, e o `cwd` do painel focado quando existe.
- **Badge do perfil** quando não é o padrão: chip mono 11 à direita do título, com o `name` do perfil (cor neutra: o desktop não dá cor por perfil).
- **Estado** (derivado do painel focado): `running` não mostra nada; os demais são **chips com ícone e texto** à direita da linha 2: `exited` com o código ("saiu 0", `circle-check` se 0, `circle-x` em `error` se não), `not-started` ("não iniciada", `circle-dashed`), `connecting` / `reconnecting` ("conectando…", spinner), `disconnected` ("desconectada", `unplug`), `awaiting-desktop` ("aguardando o desktop", `monitor`).
- **Painéis.** Mais de um: chip `layout-panel-left` + contagem ("2"). O toque na linha abre o **painel focado** daquela aba no desktop (RF-2.10); o seletor está no terminal (§4.9).
- **Aba ativa no desktop** (RF-2.9): ícone `monitor` 14 `text.tertiary` no fim da linha 1 e fundo `bg.selected`. Rótulo de acessibilidade "ativa no desktop". É informação, não seleção do app. Abrir a aba no terminal a torna a ativa no desktop (§4.6), e o marcador muda com o `workspace` seguinte, como toda a árvore.

**Ao vivo (RF-2.11).** O `workspace` substitui o anterior inteiro; a comparação é por id. Linhas que não mudaram não redesenham; a posição da rolagem se mantém por ancoragem na primeira linha visível; entrada e saída de linhas com transição de 150 ms (nenhuma, com "reduzir movimento"). **Se a aba que o usuário vê no terminal deixa de existir**, o app volta à árvore e mostra um aviso: "A aba foi fechada no desktop."

**Pendência de ação (RF-4.9).** A linha afetada fica a 60% de opacidade com o spinner no lugar do `ellipsis-vertical`; menu e toque ficam desativados até o `action-result`.

**Estado vazio.** Um desktop sem abas nunca ocorre (o desktop não fecha a última, `last-tab`); se a janela vier sem itens, mostra "Esta janela não tem abas." com "Nova aba".

#### 4.5.3 Busca (RF-2.12)

`search` na barra troca o título por um campo (48, foco automático, teclado de texto sem autocorreção) com `x` de limpar e "Cancelar". Filtra a cada tecla, em **todas** as janelas, por título, nome do grupo, `cwd` e `usuário@host`.

- O resultado **mantém a árvore**: janela, grupo e aba, só com o que combina. Combinação no nome do grupo mostra o grupo inteiro; combinação em título, `cwd` ou `usuário@host` mostra a aba (dentro do cartão do grupo dela). Seções recolhidas expandem enquanto a busca existe.
- Quando a combinação foi pelo `cwd` ou `usuário@host`, a linha 2 mostra esse texto com o trecho em negrito.
- Sem resultado: ícone `search-x` e "Nada encontrado para “…”.".
- Cancelar restaura a árvore e a rolagem anteriores.
- O texto buscado **não vai para log** (RF-3.24 estendido, regra de privacidade do app).

#### 4.5.4 Conexão, reconexão e offline (RF-2.4, RF-2.5)

**Faixa de conexão**, de 36, abaixo da barra (workspace e terminal), só quando o estado não é "conectado":

| Estado | Faixa |
|---|---|
| Reconectando | `bg.sheet`, spinner, "Reconectando… tentativa 2 de 5" (1, 2, 4, 8, 16 s) |
| Falhou (esgotadas as tentativas) | `warning`: ícone `wifi-off`, "Sem conexão com o desktop." e botão de texto "Tentar de novo" |
| Voltando do segundo plano | "Atualizando…" |

- **A árvore fica à vista** durante a reconexão, a 60% de opacidade e **somente leitura** (nenhuma ação, nenhum menu): é o último estado conhecido, não o atual (princípio 6). Ao reconectar, o `workspace` novo substitui tudo.
- `goodbye { remote-disabled }` e `{ host-quitting }`: volta à lista com o desktop **offline** e o motivo em aviso temporário ("O acesso remoto foi desativado no Porecatu." / "O Porecatu foi encerrado.").
- `goodbye { revoked }` e `not-paired`: volta à lista com o desktop "Não pareado" e o aviso "Este aparelho foi revogado no Porecatu." (RF-2.3).
- Na barra, a linha de apoio mostra "Conectado", "Reconectando…" ou "Sem conexão".

**Acessibilidade da tela.** Ordem de leitura: barra, faixa, seções. Cada aba é um elemento com rótulo composto: "build, aba, em execução, 2 painéis, campainha, ativa no desktop" na ordem dita; ações personalizadas "Abrir", "Menu da aba". Cabeçalho de grupo: a cor não é lida (o protocolo manda só RGB, sem nome de cor); o rótulo é "Servidores, grupo, 3 abas" e, só no grupo colapsado no desktop, mais "colapsado no desktop" ou "expandido só neste aparelho", com a ação padrão de expandir ou recolher. Cabeçalhos de janela e de seção são marcados como cabeçalho (navegação por cabeçalho do leitor de tela). Mudanças ao vivo **não** são anunciadas linha a linha (poluiria); só a perda da aba aberta e o estado de conexão são anunciados.

### 4.6 Terminal: estrutura

**Objetivo.** Ver e digitar numa aba. RF-3.1 a RF-3.24.

```
+-----------------------------+
| <  build            [2/3] ::|   barra do terminal (48)
|    deploy@srv                |
+-----------------------------+
| ~/projetos $ make           |
| cc -o ...                   |   grade (Skia): theme do desktop
| ...                         |
|                      (fim)  |
+-----------------------------+
| Esc Tab Shift Ctrl Alt | < v ^ > | Home...|   barra de teclas (52), rola
+-----------------------------+
|     teclado do sistema      |
+-----------------------------+
```

**Barra do terminal** (48, `bg.bar`):
- `chevron-left` voltar à árvore (cancela a assinatura, RF-3.1).
- Centro: título da aba (16/500), e a linha 2 com `usuário@host` (aba SSH) ou o `cwd` do painel; um chip de estado quando não está `running`.
- À direita: seletor de painéis (só com mais de um, chip "2/3", §4.9), `keyboard` (mostra ou esconde o teclado) e `ellipsis-vertical` (menu da aba, RF-4.6).
- **Campainha:** ícone `bell` pisca por 2 s na barra (vermelho `error`) no painel visível. Junto, a vibração curta quando ligada nas configurações (RF-3.23). Proposta: o aviso visual existe sempre, para quem desligou a vibração ou não sente.

**Grade.** Fundo `bg.terminal`, preenchendo o espaço entre a barra e a barra de teclas. Margem de 0 nas laterais (cada ponto conta); a grade respeita a área segura (*notch*, cantos). O texto sai do `theme` do desktop. A tela de terminal é **imersiva em paisagem**: a barra sobe para 40, e a barra de teclas é a mesma (já é uma linha só).

**Privacidade.** `FLAG_SECURE` no Android; cobertura no seletor de apps no iOS (§4.1). Nenhum texto da grade em log.

**Aba ativa no desktop** ([PRD-003](../prd/prd-003-terminal.md) RF-3.26, especificação 0.4). Abrir a aba no terminal a ativa no desktop (`activate-tab`): o computador passa a mostrar a mesma aba. Não há nada na tela para isso: o envio é automático, uma vez por abertura, e a falha é silenciosa (nenhum aviso, nenhuma pendência). O painel focado no desktop e a janela do sistema não mudam.

### 4.7 Terminal: grade, zoom e rolagem (RF-3.4 a RF-3.13)

**Tamanho (RF-3.6, RF-3.7).** O tamanho em colunas × linhas é sempre o do desktop. Como a Iosevka Fixed avança 0,5 em, a fonte que faz as `cols` colunas caberem na largura L é `2·L / cols`. O padrão ao abrir é **"caber a largura"** quando essa fonte é ≥ 8 pt; senão, o **tamanho de leitura** (12 pt, proposta) com rolagem horizontal. Em 360 de largura, 8 pt é o limite de **90 colunas**; 80 colunas dão 9 pt; 120 colunas (6 pt) abrem em leitura.

**Gestos** (todos na thread de UI, [arquitetura](../arquitetura.md) §6):

| Gesto | Efeito |
|---|---|
| Toque na grade | abre o teclado (RF-3.14), se o painel está `running` e assinado (RF-3.18) |
| Arrasto de um dedo | rola; vertical: histórico (RF-3.11); horizontal: grade larga. **Trava de eixo (proposta):** o primeiro movimento de 8 pt decide o eixo dominante, e o arrasto diagonal só vale depois de passar de 24 pt nos dois |
| Pinça | zoom entre "caber a largura" e 24 pt (RF-3.7), e chip temporário com a porcentagem ("120%") por 1 s |
| Arrasto vertical na tela alternativa | rola a grade se ela é mais alta que a tela; senão não faz nada (RF-3.13) |
| Toque longo | sem efeito na v1 (seleção e cópia estão fora do escopo) |

**Duplo toque não existe**: atrasaria o toque simples que abre o teclado. Os atalhos de zoom e de posição são **itens do menu da aba** (`ellipsis-vertical`, §4.12.1), no topo, antes de "Renomear". Não há botões flutuantes sobre a grade (decisão do dono em 2026-11-18: a grade fica livre):

| Item do menu | Disponível quando | Efeito |
|---|---|---|
| `scan` "Caber a largura" | o zoom não é o de caber | volta ao padrão |
| `locate-fixed` "Seguir o cursor" (RF-3.8) | a grade é mais larga que a tela | enquadra a coluna do cursor e passa a segui-lo enquanto o usuário digita; é um item de marcar (ícone `check` à direita quando ligado) |
| `arrow-down-to-line` "Voltar ao fim" (RF-3.12) | o usuário está fora do fundo | rola ao fim da grade viva |

Os três ficam sempre no menu e **esmaecem** quando não se aplicam (regra do §4.12.1), e "Seguir o cursor" diz o motivo ("A grade já cabe na tela"). O menu mostra o estado da grade **no momento em que abre**; cada item fecha a folha e age.

**Histórico (RF-3.11, RF-3.12).** Páginas de scrollback pedidas conforme o usuário avança; enquanto lê o histórico, a grade viva continua a atualizar embaixo, e o texto lido **não anda** quando `history` cresce. Entre a grade viva e o histórico não há separador (o desktop também não tem): o texto é contínuo. Carregando uma página, uma linha fina de spinner (16) no topo do histórico; sem mais histórico, nada.

**Mudança de tamanho no desktop (RF-3.10).** Um novo `grid-snapshot` com outras dimensões mantém o zoom relativo; a rolagem horizontal vai ao cursor. Sem animação.

**Zoom por aba (RF-3.9).** Lembrado na sessão do app; não persiste.

**Acessibilidade da grade.** O canvas do Skia não expõe texto ([ADR-0002](../adr/0002-render-da-grade-com-skia.md), dívida registrada). Proposta mínima, a validar no spike: um elemento único de acessibilidade sobre a grade com rótulo "Terminal, <título>" e **valor** "últimas N linhas" (resumo textual das 5 a 10 últimas linhas não vazias, atualizado no máximo a cada 2 s e **só quando o leitor de tela está ligado**, e nunca a um log). Fica **dívida de acessibilidade** assumida, como no desktop, até o ADR-0002 definir a camada paralela. A barra de teclas e o menu da aba são plenamente acessíveis.

### 4.8 Terminal: barra de teclas especiais

**Objetivo.** O que o teclado virtual não tem: `Esc`, `Tab`, `Shift`, `Ctrl`, `Alt`, setas, navegação, `F1`–`F12`. RF-3.15, RF-3.16, RF-3.19.

**Onde.** Fixa **acima do teclado do sistema** (acompanha o teclado), só enquanto o teclado está aberto. Altura 52, `bg.bar`, borda superior `border.row`. Teclas de 44 × 44 (`target.min`: aqui 44 e não 48, por falta de altura; é o piso de iOS), margem 4, vão de 6, raio 6, rótulo mono 13/500 `text.body`, fundo `bg.key`, pressionada `bg.key.pressed`.

```
+--------------------------------------------------------+
| Esc Tab Shift Ctrl Alt | < v ^ > | Home End PgUp PgDn | ... >>
+--------------------------------------------------------+
```

**Arranjo (decisão do dono, 2026-11-18).** **Uma linha só, e a linha inteira rola** na horizontal, inclusive `Esc`, `Tab` e os modificadores. Da esquerda para a direita, em grupos separados por um filete (`keybar.separator`):
1. `Esc`, `Tab`, `Shift`, `Ctrl`, `Alt` (`Shift` entre `Tab` e `Ctrl`, por pedido do dono em 2026-11-18);
2. as setas `←` `↓` `↑` `→` (ícones `arrow-left`, `arrow-down`, `arrow-up`, `arrow-right`), com **repetição** ao manter pressionada (primeira repetição em 400 ms, depois a cada 80 ms);
3. `Home`, `End`, `PgUp`, `PgDn`;
4. `Colar` (ícone `clipboard-paste`);
5. `F1`…`F12`, **sempre à mão**: não há tecla `Fn` que as abra, e a barra não troca de conteúdo.

Um degradê na borda direita indica que há mais teclas enquanto houver. A barra abre mostrando o início (`Esc`).

**Modificador ligado, fixado à esquerda (pedido do dono, 2026-11-18).** Como a linha inteira rola, um `Shift`, `Ctrl` ou `Alt` armado ou travado poderia ficar fora da vista. Por isso, **enquanto está ligado, ele sai da linha rolável e fica fixado à esquerda da barra**, fora da rolagem, com o visual de ligado da tabela abaixo (e o ícone `lock` se travado), seguido de um filete (`keybar.separator`). Vários ligados ficam lado a lado, na ordem `Shift`, `Ctrl`, `Alt`. **Um toque na tecla fixada a desliga na hora**, armada ou travada (não segue o ciclo); para travar, o usuário toca duas vezes a tecla no seu lugar da linha. Ao ser desligado, ou ao ser gasto pela tecla seguinte (se só armado), ele volta ao seu lugar e a linha reflui. O leitor de tela ouve o estado e a dica "Toque para soltar".

**Histórico do arranjo.** A proposta de 2026-11-16 fixava `Esc`…`Alt` à esquerda e rolava o resto. A de 2026-11-18, de duas linhas (altura 100) com um teclado de setas à parte e símbolos, foi implementada e **recusada pelo dono no mesmo dia**: a barra voltou a uma linha só, agora toda rolável. Sem símbolos (`|` `~` `/` `\`…) e sem `Fn`; as opções de vista da grade seguem no menu da aba (§4.7), sem botões flutuantes.

**Modificadores com trava (RF-3.16).** `Shift`, `Ctrl` e `Alt` têm três estados, **sempre distinguíveis sem a cor**:

| Estado | Visual |
|---|---|
| Solto | tecla normal |
| Armado (um toque; vale para a próxima tecla e solta) | fundo `bg.selected`, borda 2 `accent`, e a barra inferior do rótulo sublinhada |
| Travado (dois toques; até o terceiro) | o mesmo mais o ícone `lock` (10) no canto da tecla |

O modificador **vale para**: o próximo texto do teclado do sistema (`Ctrl` + "c" vai como `key { "c", Ctrl }`, nunca como `text`), e para as teclas da barra (setas, `Home`, `Tab`…), enviadas como `key` com os `mods`. `Shift` + letra do teclado do sistema vai como `key` com a letra já em maiúscula e o bit `Shift` (o desktop não muda a caixa por `Shift`); `Shift` + `Tab` e `Shift` + seta vão como `key` com o bit. `Esc` não consome o armado (a tecla `Fn` deixou de existir em 2026-11-18; `F1`–`F12` são teclas nomeadas como as outras e consomem). O estado vale **por tela do terminal** e zera ao sair dela.

**Vibração.** Cada toque em tecla da barra dá um tique leve (*haptic*) se o aparelho suporta e a vibração das configurações está ligada. (Proposta: a mesma chave da campainha.)

**Acessibilidade.** Cada tecla é um botão com rótulo ("Escape", "Tab", "Controle, solto", "Controle, travado", "Seta para cima"). Os estados armado e travado são anunciados. A barra tem um `accessibilityLabel` de grupo "Teclas especiais".

### 4.9 Terminal: seletor de painéis

**Objetivo.** Trocar o painel visto numa aba com mais de um painel. RF-2.10, RF-3.3.

Chip "2/3" na barra do terminal (alvo 48) abre uma **folha inferior** com:

1. **Miniatura da disposição.** Desenha o `layout` (divisões, `dir`, `ratio`) num retângulo de 16:10, cada painel um retângulo com borda `border.row`; o painel **visto** leva fundo `bg.selected`; o **focado no desktop** leva borda 2 em `accent`; um `monitor` 12 no canto. Cada retângulo tem o título do painel (13) truncado e um ponto de estado.
2. **Lista dos painéis** (a mesma informação, em linhas de 56), na ordem de leitura da árvore (primeiro, depois segundo): título, `cwd` em mono 12 e o chip de estado (§4.5.2). Marca "focado no desktop" e "visto aqui" em texto.

A **lista é o controle garantido**: um painel de `ratio` pequeno pode ter retângulo menor que 44 na miniatura, e a lista não tem esse problema. O toque na miniatura ou na linha assina o painel escolhido, e cancela a assinatura do anterior (uma por vez, RF-3.3). A folha fecha sozinha e o terminal mostra o painel novo. **O painel focado no desktop não muda** nunca: trocar de painel aqui muda só a assinatura do app ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md), item 3). A aba, essa sim, fica ativa no desktop desde a abertura (§4.6).

Aba com um painel só: o chip não existe.

**Acessibilidade.** A miniatura é decorativa para o leitor de tela (`importantForAccessibility` no Android, oculta no iOS); a lista cobre tudo.

### 4.10 Estados do painel no terminal

Aplicam-se sobre a grade; cada um diz o que o usuário vê e pode fazer. RF-3.18, RF-3.20 a RF-3.22.

| Estado | Na grade | Faixa ou cartão | Input |
|---|---|---|---|
| `running` | viva | nenhuma | teclado e barra de teclas |
| `not-started` | vazia | cartão central: ícone `circle-dashed`, "Esta aba ainda não foi iniciada.", botão primário **Iniciar** (`start-pane`) | nenhum; o teclado não abre |
| `connecting` | vazia ou a última | cartão central: spinner e "Conectando…" | nenhum |
| `reconnecting` | a última, esmaecida a 60% | cartão no topo: spinner e "Reconectando…" | nenhum |
| `awaiting-desktop` | a última | cartão central: ícone `monitor`, título "Aguardando você no computador", corpo "Uma senha, passphrase ou confirmação da chave do servidor precisa ser respondida no Porecatu do computador. O celular não consegue responder." Sem botão | nenhum |
| `exited` | final, intacta | faixa inferior no lugar da barra de teclas (56): ícone `circle-check` (código 0) ou `circle-x` em `error` (diferente de 0) e "Saiu com código 0"; botão de texto "Fechar aba" | nenhum |
| `disconnected` | a última | faixa inferior: ícone `unplug` "Desconectado" e o botão **Iniciar** (se o desktop recusar, o erro do §4.14) | nenhum |

O cartão central é `bg.sheet`, raio 8, no máximo 300 de largura, fonte do chrome; ele **não esconde a grade final** quando existe (a grade fica esmaecida atrás). O cursor fica fixo, sem piscar.

Painel em estado fora de `running`: tocar na grade não abre o teclado, e o botão `keyboard` da barra fica desabilitado, com o rótulo de acessibilidade explicando o porquê ("Teclado indisponível: o painel não está em execução").

### 4.11 Colar com prévia

**Objetivo.** RF-3.17. **Entrada:** o botão `Colar` da barra de teclas, ou o menu de colar do teclado do sistema.

- **Sem nenhuma quebra de linha:** vai direto como `paste`, sem diálogo.
- **Com qualquer quebra de linha**, inclusive uma só no fim: diálogo central de confirmação antes de enviar (RF-3.17):

```
+-------------------------------+
|  Colar 12 linhas?             |
|                               |
|  +-------------------------+  |
|  | sudo systemctl restart  |  |
|  | cd /srv/app             |  |
|  | git pull                |  |
|  | make deploy             |  |
|  | ...                     |  |
|  +-------------------------+  |
|  e mais 8 linhas · 412 caract.|
|                               |
|  [ Cancelar ]   [   Colar  ]  |
+-------------------------------+
```

- Prévia em **mono 12**, cartão `bg.field`, com as **5 primeiras linhas** (cada uma truncada em 120 caracteres por reticências) e a linha "e mais N linhas · M caracteres". Caracteres de controle aparecem como `^[` etc. e linhas com mais de 1000 caracteres levam o aviso "linha muito longa" **(proposta)**.
- Botões **Cancelar** (foco inicial; alinhados à direita como no desktop) e **Colar** (primário, não destrutivo: o risco é o texto, que o usuário acabou de ver).
- O texto colado **nunca é registrado** (RF-3.24). A prévia vive só na memória da tela.
- Clipboard vazio: aviso temporário "A área de transferência está vazia." Colar para painel não `running`: botão desabilitado.

**Acessibilidade.** O leitor de tela lê o título e o resumo ("12 linhas, 412 caracteres") e as primeiras linhas como texto simples.

### 4.12 Gestão de abas e grupos (folhas)

Todas as ações abrem **folhas inferiores** com cantos `radius.sheet`, `bg.sheet`, borda `border.sheet`, alça de arrasto (48 × 4) no topo, `bg.scrim` atrás. Fecham com toque fora, arrasto para baixo, voltar do sistema ou `Cancelar`. As ações chegam ao desktop como `action`; a árvore muda só pelo `workspace` seguinte (RF-4.9).

#### 4.12.1 Menu da aba (RF-4.6)

Aberto pelo toque longo ou pelo `ellipsis-vertical` na árvore, e pelo botão na barra do terminal. Título da folha: o título da aba. Itens de 52, ícone à esquerda, `text.body`:

| Item | Ícone | Observação |
|---|---|---|
| Caber a largura | `scan` | **só no menu aberto do terminal** (§4.7); esmaecido quando o zoom já é o de caber |
| Seguir o cursor | `locate-fixed` | só no terminal; item de marcar (`check` à direita quando ligado); esmaecido, com a nota "A grade já cabe na tela", se a grade não é mais larga que a tela |
| Voltar ao fim | `arrow-down-to-line` | só no terminal; esmaecido quando já está no fim |
| *divisor* | | só no terminal, depois dos três itens de vista |
| Renomear | `pencil` | abre §4.12.3 |
| Mover para grupo… | `folder-input` | abre §4.12.4; escondido na aba fixada |
| Mover para janela… | `app-window` | abre §4.12.5; **esmaecido** (nunca ausente) com uma só janela, com a nota "Só há uma janela no desktop" |
| Novo grupo com esta aba… | `folder-plus` | abre §4.12.6; escondido na fixada (o desktop recusa) |
| *divisor* | | |
| Fechar painel | `panel-top-close` | só se a aba tem mais de um painel e só no menu aberto do terminal, aplicando ao painel visto |
| Fechar aba | `x` | destrutivo (`destructive`); abre o diálogo de §4.13 se o desktop pedir |

**Aba fixada:** só **Renomear** e **Fechar aba** (RF-4.6), mais os itens de vista no terminal. Fechar uma fixada a **desafixa** no computador, e o app **não** pergunta antes: pela especificação 0.4, o desktop sempre pede a confirmação para fechar uma fixada (`confirm-request`), e o diálogo de §4.13 traz a nota da desafixação. *Revisto em 2026-11-17 (§7, item 6): saiu o diálogo próprio que a proposta previa.*

**Ordem.** Difere do desktop (Nova aba, Fechar, Mover para grupo, Mover para janela), **proposta**: no celular, o destrutivo fica no fundo da folha, ao alcance do polegar mas longe do primeiro toque. A "Nova aba" do menu do desktop não entra: no celular ela mora nas linhas "Nova aba" da árvore (§4.5.2). A ordem final cabe ao dono.

#### 4.12.2 Menu do grupo (RF-4.8)

Título: nome do grupo. Itens: **Renomear** (`pencil`, §4.12.3), **Cor** (`palette`, §4.12.7), **Colapsar no desktop** ou **Expandir no desktop** (`chevrons-down-up` / `chevrons-up-down`; o rótulo diz "no desktop" para não se confundir com o recolher local do app, RF-2.8), **Mover para janela…** (`app-window`, §4.12.5, esmaecido com uma só janela), *divisor*, **Desfazer grupo** (`ungroup`, destrutivo).

- **Desfazer grupo** pede diálogo no app (RF-4.8): título "Desfazer o grupo Servidores?"; corpo "As 3 abas continuam abertas, mas ficam soltas na trilha. Esta ação é difícil de reverter."; **Cancelar** e **Desfazer grupo** (destrutivo).
- "Fechar grupo" **não existe** na v1 (não há `close-group` no protocolo).
- **Expandir no desktop** faz o que o gesto local faz, inclusive a aba que o desktop ativa ao expandir (especificação 0.4).

#### 4.12.3 Renomear

Para aba: folha com um campo (48, `bg.field`, foco automático, texto inicial = título atual, selecionado), botões **Cancelar** e **Salvar**. Quando `custom = true` aparece, abaixo do campo, o botão de texto **Restaurar título automático** (envia `null`, RF-4.3). Campo vazio desabilita Salvar (para vazio o caminho é restaurar). Sem limite de tamanho no app (o desktop trunca na barra).
Para grupo: igual, sem o restaurar.

#### 4.12.4 Mover para grupo (RF-4.4)

Lista de **escolha única** com os grupos **da mesma janela** (amostra de cor de 16 + nome + contagem) e, no topo, "Sem grupo". O grupo atual leva `check` e fica desabilitado; o toque numa linha envia e fecha. Sem grupo algum na janela, só "Sem grupo", com a nota "Esta janela ainda não tem grupos. Use Novo grupo com esta aba."

#### 4.12.5 Mover para janela (RF-4.5)

Lista de **outras** janelas (a de origem não aparece), cada uma identificada pelo **título da aba ativa** (como o "Mover para janela…" do desktop) e a contagem de abas ("3 abas"; plural no catálogo). Sem "janela nova" na v1. Serve às abas (`move-tab-to-window`) e aos grupos (`move-group-to-window`). Como no gesto local, a aba ou o grupo movido fica ativo na janela de destino; a janela do sistema não sobe nem ganha foco (especificação 0.4).

#### 4.12.6 Novo grupo (RF-4.7)

Folha com campo de nome (obrigatório) e a fila de **seis amostras de cor** (do `theme.group_colors`, 40 de desenho, alvo 48; selecionada = anel `text.title` 2 + ícone `check`, que dispensa a cor; rótulo de leitura "Cor 3 de 6") e uma opção "Automática" (padrão; o desktop atribui). **Criar grupo** (primário). O `new-group` leva a aba atual; a folha só vale em aba **solta** (não fixada).

#### 4.12.7 Cor do grupo

Mesma fila de amostras do §4.12.6, escolha imediata (toque aplica e fecha), com a cor atual marcada com `check`.

#### 4.12.8 Nova aba (RF-4.1)

Aberta pelas linhas "Nova aba" da árvore (janela ou grupo). Folha com:

- Linha de contexto: "Em Janela 1" ou "No grupo Servidores" (13, `text.secondary`).
- **Lista de perfis** de escolha única (linhas de 56): nome, tipo (chip `local`, `ssh`, `wsl`, `outro`) e, no padrão, a marca "Padrão". O padrão vem **primeiro** e já selecionado (RF-4.1). Sem a lista de perfis (ainda não chegou `profiles`), a folha mostra spinner.
- Botão primário **Criar aba** (fixo no fim da folha).

Depois de tocar em **Criar aba** o botão vira spinner até o `action-result`. Com `created`, o app **abre a aba nova no terminal** do app (RF-4.1). No desktop a aba criada já nasce **ativa** na janela dela, como no `tab.new` (especificação 0.4); o painel focado e a janela do sistema não mudam. Aba SSH nova aparece normalmente `connecting` ou `awaiting-desktop` (§4.10). Erro: o próprio `action-result` vira o aviso do §4.14 e a folha fecha.

#### 4.12.9 Acessibilidade das folhas

- O foco do leitor de tela vai ao título da folha ao abrir; fechar devolve o foco ao elemento que a abriu.
- Folhas tratam o gesto de escape do sistema (`Esc` em teclado físico, voltar do Android).
- Itens destrutivos têm também o rótulo "ação destrutiva" para o leitor.

### 4.13 Confirmação de fechamento (`confirm-request`)

**Objetivo.** RF-4.2: o desktop pergunta **ao celular que pediu** quando o fechamento mata algo. Diálogo central, `bg.sheet`, raio 8 (`radius.card`), largura da tela menos 48 (no máximo 360), `padding: 20`, sombra do sistema.

```
+---------------------------------+
|  Fechar a aba "build"?          |
|                                 |
|  Há processos em execução:      |
|   make                          |
|   node                          |
|   cc1                           |
|   e mais 2                      |
|                                 |
|  [ Cancelar ]   [ Fechar aba ]  |
|  ======----------  (restam 38 s)|
+---------------------------------+
```

- `kind = running-process`: corpo "Há processos em execução nesta aba:" e a lista de nomes em mono 13 (até 5, depois "e mais N"). `kind = ssh-connection`: "A conexão SSH desta aba está aberta."
- **Aba fixada** (ou um painel dela; revisto em 2026-11-17, especificação 0.4): a `dialog.gap` abaixo do motivo, a nota "A aba fixada também será desafixada no computador." (`confirm_close.pinned_note`, 15 `text.body`). Fixada **sem processos vivos** (o desktop manda `kind = running-process` com a lista vazia): o diálogo mostra só a nota e o prazo, sem o motivo.
- Botões como no diálogo do desktop: **Cancelar** (foco inicial, borda `border.row`, texto `text.body`) e **Fechar aba** (destrutivo, sem fundo, texto `destructive`, toque `#2e2224`/`#f2dee1`). `Fechar painel` quando a ação foi `close-pane`.
- **Prazo.** Uma barra fina de 2 de altura no fundo do diálogo mostra os 60 s restantes (**proposta**); ao expirar, o diálogo some sozinho com o aviso "Tempo esgotado: nada foi fechado." (RF-4.2).
- O diálogo vive **por cima da tela atual**; sair da tela com ele aberto o mantém (a pergunta é do app, não da tela). Cancelar envia `confirm { accept: false }` (a ação termina em `cancelled`, sem mensagem).
- Acessibilidade: o diálogo é modal, o foco vai ao título e o prazo é anunciado ao abrir ("60 segundos para responder").

### 4.14 Avisos e erros

**Aviso temporário** (*snackbar*): faixa `bg.sheet` com borda `border.sheet`, raio 8, texto 15 `text.body`, **barra de severidade de 3** na esquerda (`error`, `warning`, `accent`, como o aviso do desktop, §2.14 dele), 16 de margem do fim da tela e acima da barra de teclas. Informação some em 6 s; erro persiste 8 s e tem botão `x`. Pausa o prazo enquanto o usuário toca. Um por vez (o seguinte substitui). **Região viva** para o leitor de tela; nunca rouba o foco.

**Mapa de códigos para mensagens** (rascunho pt_BR; o catálogo cobre todo valor de `error-code`, `goodbye-reason`, `pair-rejected.reason`, `close-reason`, [ADR-0005](../adr/0005-catalogo-de-textos-e-idiomas.md)):

| Código | Onde | Texto proposto |
|---|---|---|
| `unknown-window`, `unknown-group`, `unknown-tab`, `unknown-pane` | aviso | "Isso não existe mais no desktop." (a árvore atualiza) |
| `busy` | aviso | "O desktop está com um diálogo aberto. Tente de novo." |
| `confirm-timeout` | aviso | "Tempo esgotado: nada foi fechado." |
| `cancelled` | — | nenhuma (o próprio usuário cancelou) |
| `unknown-profile` | aviso | "Esse perfil não existe mais. A lista foi atualizada." |
| `invalid-argument`, `unsupported` | aviso | "Não foi possível fazer isso (código `invalid-argument`)." com o código em mono, para relatório |
| `last-tab` | aviso | "Não dá para fechar a última aba do desktop." **(o RF-4.10 não lista; precisa entrar no PRD-004 e no catálogo, §7 de pendências)** |
| `pane-not-running`, `not-subscribed` | aviso | "O painel não está em execução." |
| `too-many-subscriptions` | aviso | "Não foi possível abrir este painel agora." (o app usa uma assinatura por vez; indica defeito) |
| `protocol` | tela de estado | "Erro de comunicação com o desktop." e "Voltar à lista" |
| `not-paired` / `revoked` | tela de estado | ver §4.5.4 |

Aviso de ação **pendente** não existe: o indicador de pendência (spinner na linha, RF-4.9) já diz.

**Tela de estado** (modelo único para falhas que bloqueiam a tela): ícone Lucide de 48 em `text.tertiary` (ou `error`/`warning`), título 20/600, corpo 15 `text.secondary` (até 4 linhas), botão primário e botão de texto opcional. Sempre há uma saída (botão ou voltar).

**Diálogo central** (confirmações do app): o modelo do §4.13, com os botões do desktop. Aplica-se a: remover desktop, recriar identidade, desfazer grupo, colar várias linhas, fechar (do desktop, inclusive a aba fixada, §4.13).

---

## 5. Acessibilidade (regras gerais)

1. **Alvos.** 48 × 48 como regra, 44 × 44 no piso, 8 de vão. Alvo desenhado menor (ícone de 24, amostra de 40) tem a área de toque ampliada (`hitSlop`) até o mínimo.
2. **Leitor de tela (VoiceOver, TalkBack).** Todo botão de ícone tem rótulo; cada linha de lista é **um** elemento com rótulo composto; ações secundárias são ações personalizadas, nunca só toque longo ou deslizar. Cabeçalhos marcados como tal. Foco devolvido ao elemento de origem ao fechar folha ou diálogo. Estados ("pendente", "armado", "travado") entram no rótulo ou no estado.
3. **Contraste.** Texto ≥ 4,5:1 (3:1 para texto grande, a partir de 14 pt/600), ícones e bordas de controle ≥ 3:1. Os valores de §2 já passaram nessa medida, salvo os marcados como "só para desabilitado". As bordas de popover do desktop (`#2e343e`, 1,4:1) são só decoração; o limite dos controles vem do fundo e do rótulo.
4. **Cor.** Nunca a única portadora de significado (princípio 3).
5. **Texto grande.** Chrome acompanha a fonte do sistema (limite de 1,3× nas barras fixas); listas crescem; folhas rolam. A grade do terminal **não** acompanha: o zoom é dela.
6. **Movimento.** "Reduzir movimento" desliga as transições de §1.9; spinners ficam.
7. **Terminal.** Dívida registrada do canvas (§4.7).
8. **Teclado físico.** Tab e setas navegam o chrome; no terminal, **todas** as teclas vão ao terminal (RF-3.19), exceto o voltar do sistema.

---

## 6. Rastreabilidade: requisito para tela

| Requisito | Onde está |
|---|---|
| RF-1.1 a RF-1.3 | §4.4.2 |
| RF-1.4 a RF-1.11 | §4.3 |
| RF-1.12 a RF-1.16 | §4.2 |
| RF-1.17 a RF-1.19 | §4.1, §4.4.1 |
| RF-2.1 a RF-2.5 | §4.5.1, §4.5.4 |
| RF-2.6 a RF-2.11 | §4.5.2 |
| RF-2.12 | §4.5.3 |
| RF-2.13 | §2, §1 princípio 7 |
| RF-3.1 a RF-3.5 | §4.6, §4.7 |
| RF-3.6 a RF-3.10 | §4.7 |
| RF-3.11 a RF-3.13 | §4.7 |
| RF-3.14 a RF-3.16, RF-3.19 | §4.8 |
| RF-3.17 | §4.11 |
| RF-3.18 | §4.10 |
| RF-3.20 a RF-3.22 | §4.10 |
| RF-3.23 | §4.6, §4.8, §4.4.1 |
| RF-3.24 | §4.5.3, §4.6, §4.11 |
| RF-3.26 | §4.6, §4.9 (sem elemento visível: abrir a aba a ativa no desktop) |
| RF-2.10 | §4.5.2, §4.9 |
| RF-4.1 | §4.12.8 |
| RF-4.2 | §4.13 |
| RF-4.3 | §4.12.3 |
| RF-4.4, RF-4.5 | §4.12.4, §4.12.5 |
| RF-4.6 | §4.12.1 |
| RF-4.7, RF-4.8 | §4.12.6, §4.12.7, §4.12.2 |
| RF-4.9, RF-4.10 | §4.5.2, §4.14 |

---

## 7. Decisões do dono

Os oito pontos que a proposta levou ao dono, em ordem de impacto, cada um com a recomendação dela. **Em 2026-11-16 o dono aprovou as oito recomendações**, e o texto acima já as segue; as alternativas ficam registradas aqui como recusadas.

1. **Árvore em uma rolagem só** (janelas como seções recolhíveis, grupos como cartões com faixa de cor), ou uma janela por vez com seletor de chips. É a tela mais usada e define a forma do app (§4.5.2).
2. **Terminal sem duplo toque, com botões flutuantes** de voltar ao fim, seguir o cursor e caber a largura, em vez de gestos escondidos (§4.7).
   *Revisto em 2026-11-18 pelo dono: os botões flutuantes saíram, e as três opções passaram a itens do menu da aba, para a grade ficar livre (§4.7, §4.12.1).*
3. **Cor de grupo apenas como faixa e tingimento, nunca texto**, e a campainha como ícone (o desktop usa só o ponto) por acessibilidade (§2.2, §4.5.2).
4. **Barra de teclas em uma linha** (fixos à esquerda, resto rolável, `Fn` troca para F1 a F12), contra duas linhas sempre à vista; e teclas de 44 em vez de 48 (§4.8).
   *Revisto em 2026-11-18 pelo dono, duas vezes no mesmo dia. Primeiro, duas linhas com um teclado de setas à parte; implementada, foi recusada. Depois, **uma linha só, toda rolável** (`Esc`, `Tab` e os modificadores inclusive): `Esc Tab Shift Ctrl Alt`, setas, `Home End PgUp PgDn`, `Colar` e `F1`–`F12` sempre à mão, sem `Fn` e sem símbolos. Teclas de 44 (§4.8).*
5. **Paleta clara do chrome com tons de texto mais escuros que os do desktop** (`#8c8fa1` e `#df8e1d` reprovam em contraste no celular) e rótulo de seção mais legível que o `#5c646f` do desktop (§2.2).
6. **Fechar aba fixada** pede, no app, a confirmação de que ela será desafixada, comportamento do desktop que a spec do protocolo não descreve; e a ordem do menu da aba, com o destrutivo no fim, diferente da do desktop (§4.12.1).
   *Revisto em 2026-11-17 pelo dono, com a especificação 0.4 do protocolo ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md), item 5): a spec passou a dizer que fechar uma fixada sempre pede `confirm-request` e a desafixa. O diálogo próprio do app saiu, porque repetiria a confirmação do desktop; a nota de desafixar entrou no diálogo de §4.13. A ordem do menu continua a aprovada.*
7. **Dimensões de leitura do terminal**: 12 pt de leitura, entrelinha 1,3 (o desktop tem 1,75), cursor fixo (§2.5, §1 princípio 9).
8. **"Sobre este aparelho" dentro de Configurações**, e não na lista de desktops, divergindo do mapa de telas da arquitetura (§3, §4.4).

## 8. Pendências para outras etapas (não alteradas aqui)

- `last-tab` está na spec ([mensagens §9](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)) mas não no RF-4.10 nem na lista de erros do catálogo. *Resolvido em 2026-11-16: [PRD-004](../prd/prd-004-gestao-de-abas.md) RF-4.11, e o catálogo tem `error.last-tab`.*
- O [ADR-0005](../adr/0005-catalogo-de-textos-e-idiomas.md) item 4 manda `Intl.PluralRules`, e as regras do repositório mandam plurais escritos à mão (Hermes); precisa de uma correção factual no ADR. *Resolvido em 2026-11-16: revisão no item 4 do ADR-0005.*
- O pacote de ícones (Lucide em React Native) e a fonte Iosevka embutida entram em ADR próprio quando a implementação chegar. *Resolvido em 2026-11-16: [ADR-0008](../adr/0008-icones-lucide-em-svg.md) (ícones) e [ADR-0009](../adr/0009-iosevka-fixed-embutida.md) (fonte); gestos e teclado no [ADR-0010](../adr/0010-gestos-animacao-e-teclado.md), folhas, diálogos e avisos no [ADR-0011](../adr/0011-folhas-dialogos-e-avisos-proprios.md).*
- Nomes de cor de grupo: o `theme` só leva RGB; sem nomes, a leitura é "cor N de 6".

---

## 9. Escolhas da implementação a confirmar

As telas foram implementadas entre 2026-11-16 e 2026-11-17, cobertas por testes automatizados em Node e **sem nenhuma execução num aparelho**. Pela regra "nenhuma tela sem aval visual" ([CLAUDE.md](../../CLAUDE.md), [README do design](README.md)), esta seção separa o que tem o aval do dono do que o código escolheu onde a anatomia não fixava nada. Os itens do §9.2 valem no código até o dono decidir; o que ele aprovar entra no corpo deste documento (e, se for valor, em §2), e o que recusar volta ao código.

### 9.1 Com aval do dono

- A anatomia inteira, aprovada em 2026-11-16 com as oito recomendações do §7.
- As revisões de 2026-11-17 pela especificação 0.4 do protocolo ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)): abrir a aba no terminal a ativa no desktop (§4.6), as ações ativam como o gesto local (§4.12.2, §4.12.5, §4.12.8), o painel focado nunca muda (§4.9); e o fim do diálogo próprio de fechar fixada, com a nota no diálogo do desktop (§4.12.1, §4.13, §7 item 6).
- As revisões do dono de 2026-11-18 para o terminal: a barra de teclas numa linha só, toda rolável, com `F1`–`F12` sempre à mão e sem `Fn`, e as opções de vista no menu da aba, sem botões flutuantes (§4.7, §4.8, §4.12.1, §7 itens 2 e 4).
- As decisões do dono de 2026-11-16 para a implementação: grade com Skia como o [ADR-0002](../adr/0002-render-da-grade-com-skia.md) propõe (ainda Proposto); a anatomia vence onde contradiz outra fonte; valores fora das escalas são levados a §2.3 e ao `space.scale`; mono que pediria 600 usa 500; e, até o app ter ícone (marco M5), a tela de bloqueio e a cobertura mostram só o fundo `bg.base` (a de bloqueio, com o nome e "Bloqueado").

### 9.2 À espera do aval

Uma linha por item: o que a anatomia diz (ou não fixa) e o que o código faz.

**Tokens acrescentados em §2 durante a implementação.** §2.6 a §2.9 entraram em 2026-11-16 a partir do que só existia fora da anatomia, normalizados para as escalas dela; os valores marcados **proposta** lá esperam revisão:

| Item | Anatomia | Código |
|---|---|---|
| `F1`–`F12` depois de `Colar` | a proposta tinha `Fn` que abria as teclas F | as 12 teclas F no fim da linha, sem `Fn`, e `Colar` entre a navegação e elas |
| Barra de rolagem no modo claro | não existia | `scrollbar.thumb` e `scrollbar.track` no tom do `text.title` (§2.1) |
| Cantos da moldura da câmera | "cantos marcados" | `camera.corner` 24 × 4 (§2.5) |
| Paddings de campo, formulário, cartão e aviso | não fixava | `field.padding-x` 12, `form.gap` 8, `card.padding` 16, `snackbar.padding` 12 (§2.6) |
| Entrelinhas | não fixava | 1,25 nos papéis de uma linha e 1,45 no corpo (§2.3) |
| Sombras | "sombra do sistema" | `shadow.*` iguais nos dois modos, também no claro (§2.8) |
| Texto sobre a câmera | "branco" | `on.camera` (§2.2) |
| Padding do diálogo | 20 (§4.13) | mantido 20, exceção ao `space.scale` (§2.6) |

**Transversais (primitivas, folhas, diálogos e avisos):**

| Item | Anatomia | Código |
|---|---|---|
| Botão primário pressionado | não há `primary.pressed` | o primário não muda ao toque |
| Botão primário desabilitado | não fixa | fundo `bg.pressed` e rótulo `text.disabled` |
| Padding vertical da faixa | só `banner.padding-x` e `banner.gap` | `space.s` (8) |
| Interruptor | só as cores (§4.4.1) | o da plataforma, colorido pelos tokens |
| Chip e badge | não lista borda nem fundo | sem borda, fundo `bg.field` |
| Esqueleto da lista | "linhas-esqueleto (3)" | três cartões vazios |
| Arrasto que fecha a folha | não fixa a distância | 48 (`target.min`) |
| Diálogo | não fixa animação nem toque na película | sem animação; tocar na película não fecha |
| Aviso de severidade aviso | 6 s para informação, 8 s com `x` para erro | 6 s, sem `x` |
| Aviso com folha aberta | "nunca rouba o foco" | fica fora do alcance do leitor de tela enquanto a folha está aberta |
| Código no aviso (§4.14) | "código em mono" | `type.mono-body` (13) dentro do texto de 15 |
| Menu das linhas no leitor de tela | ação personalizada "Menu" | o botão de menu fica oculto ao leitor; o menu abre pela ação da linha, e o foco volta à linha |
| Grupo de rádios no leitor de tela | não fixa | o grupo não é elemento acessível; cada rádio se anuncia sozinho |
| Severidade dos avisos por código | só a cor de cada severidade | falha de ação = erro; `confirm-timeout` = informação; ações perdidas e aba nova ausente = aviso; recusa antes do fio = informação (outra ação em andamento), aviso (desktop não conectado) ou erro (falha de envio) |
| Textos sem redação aqui | os textos entre aspas | os que a anatomia não redige foram escritos no catálogo (rótulos de leitura, avisos de envio, títulos de folha e de diálogo) e esperam revisão |

**Bloqueio e raiz (§4.1):**

| Item | Anatomia | Código |
|---|---|---|
| Falha ao ler o armazenamento seguro na partida | não prevê | só o fundo neutro `bg.base` |
| Falha permanente do módulo de autenticação | não prevê | o usuário fica na tela de bloqueio (o lado seguro) |
| Sessões ao voltar do segundo plano | não diz | reconectam por trás da tela de bloqueio |
| Antes do primeiro desbloqueio | "antes de qualquer lista de desktops" | o navegador nem monta: nenhuma lista e nenhuma consulta de presença |

**Lista de desktops (§4.2):**

| Item | Anatomia | Código |
|---|---|---|
| Toque numa linha em Erro | só fixa online e offline | abre o workspace |
| Toque numa linha offline | tenta e volta a "Offline" | tenta no lugar e, se o desktop responder, abre o workspace |
| Rótulo com erro e presença | não fixa a precedência | o erro vence a presença |
| Ícone da faixa do RF-1.20 | não fixa | `shield-alert` |

**Parear (§4.3):**

| Item | Anatomia | Código |
|---|---|---|
| Anel de contagem | substitui o indicador, sem medida | `icon.state` 48, traço 1,5; `space.s` entre o anel e o tempo |
| Instrução da câmera | "abaixo da moldura" | a `space.l` da moldura |
| Barra translúcida da câmera | barra translúcida | barra própria, não a barra de tela comum |
| Câmera ocupada ou ausente | dois casos | um texto só, o de câmera ocupada: o `expo-camera` não distingue os dois fora da web |
| Botões dos resultados | "Ler outro código" e "Fechar" no QR expirado; "Tentar de novo" no relay inalcançável | antes de o desktop receber o pedido: "Tentar de novo"; depois: "Ler outro código"; erro de protocolo e lista cheia: só "Fechar" |
| Relay inalcançável | não define o código | `timeout`, ou queda da conexão ainda em `connecting` |
| Háptico nos resultados | não prevê | sim |
| `x` da barra de espera | "Cancelar" | diz "Cancelar" ou "Fechar" conforme a fase |

**Configurações e Este aparelho (§4.4):**

| Item | Anatomia | Código |
|---|---|---|
| "Vibrar na campainha" | some sem vibração no aparelho | sempre visível: os serviços do app não sabem se o aparelho vibra |
| Bloco Nome | sempre | some quando não há nome do último pareamento nem modelo do aparelho |
| Desbloqueio cancelado antes de Recriar identidade | não diz | nenhum aviso |

**Workspace (§4.5):**

| Item | Anatomia | Código |
|---|---|---|
| "Não pareado" | tela de estado (§4.5.1) ou volta à lista (§4.5.4) | antes da árvore: tela de estado com "Parear de novo"; depois dela: volta à lista com o aviso |
| "Nova aba" durante a busca | não diz | some |
| "Tentar de novo" pedido pelo usuário | não diz | faixa "Atualizando…" |
| Erro de protocolo com a árvore à vista | não diz | troca a árvore pela tela de estado |
| Toque numa aba em somente leitura | "nenhuma ação, nenhum menu" | abre o terminal; menus e "Nova aba" ficam bloqueados |
| Ícones das telas de estado | `refresh-cw`, `monitor-off`, `shield-off` | também `triangle-alert` em `warning` (relay, protocolo, dados inválidos) e `wifi-off` (tentativas esgotadas) |
| Rótulo de leitura da aba | a ordem do §4.5.4 | acrescenta fixada, atividade, perfil e a linha 2 |
| `exited` sem código | "saiu N" | "Encerrado" |

**Terminal (§4.6 a §4.10):**

| Item | Anatomia | Código |
|---|---|---|
| Botão `scan` "Caber a largura" | "volta ao padrão" | aplica caber a largura, mesmo na grade larga que abre em leitura (o rótulo vence) |
| Chip de zoom | a porcentagem | 100% = caber a largura; grade estreita fica em 24 pt |
| Redimensionamento no desktop | "mantém o zoom relativo" | a mesma razão sobre o caber anterior |
| `Esc` com modificador armado | "não consome o armado" | sai sem modificadores e mantém o armado para a próxima tecla |
| Colagem pela faixa do teclado | não prevê | texto com quebra de linha vindo do campo de captura vai pelo fluxo de colar, com confirmação |
| `bell` da barra | "pisca por 2 s" | acende e esmaece linear em `duration.bell`, sem cadência; com reduzir movimento, aceso fixo por 2 s |
| Vibração da campainha | "vibração curta" | háptico de notificação de aviso |
| Barra em paisagem | 40 (§2.5) e alvos de 48 (§5) | barra de 40 com botões de 48: tensão da própria anatomia |
| Paisagem imersiva | "imersiva" | esconde a barra de status do sistema |
| Grade fora de `ready` | 60% e somente leitura só para a árvore | a grade também fica a 60% e em somente leitura |
| Reconexão | não diz | o seletor de painéis abre; o menu da aba fica bloqueado |
| Aba que some no reinício do Porecatu | aviso "A aba foi fechada no desktop." | o mesmo aviso também no reinício |
| Linhas do seletor de painéis (§4.9) | 56 | `row.single` e `row.double` (56 e 64): com o `cwd`, os tokens dão 61, que não cabe em 56 |
| Marca "focado no desktop" na lista do seletor | o `monitor` 12 da miniatura, sem cor | `monitor` 14 em `accent` |
| Ponto do painel em execução na miniatura | "um ponto de estado" | `success` |
| Cartão de estado (§4.10) | `bg.sheet`, raio 8, até 300 | borda `border.row`, ícone `text.tertiary`; o de `reconnecting` a `gutter` do topo |
| Faixa inferior de `exited` e `disconnected` | altura 56 e conteúdo | `bg.bar` com borda `border.row`, texto `type.body`, ícone `icon.indicator` |
| Iniciar do `disconnected` | "o botão Iniciar" | botão primário |
| Texto do chip de zoom | não fixa | `text.body` |
| Polegar da barra de rolagem | não fixa o mínimo | 3 (`scrollbar.width`) |
| Cursor sublinhado e barra | forma que veio | espessura de 2 × o sublinhado da fonte |
| Box-drawing e blocos | "desenhados como formas" | traço = o sublinhado da fonte (0,05 em), o pesado o dobro; tracejado com vão de 1/3; sombreamentos de 25%, 50% e 75% |
| Itálico | não fixa | inclinação de −0,2 |
| Caractere sem glifo na Iosevka | não fixa | fonte do sistema, dentro da célula |
| Histórico carregando | "linha fina de spinner" no topo | o spinner, e as linhas que ainda não chegaram em branco |
| Rolagem da grade com reduzir movimento | as transições viram zero | a inércia da rolagem continua |

**Colar (§4.11):**

| Item | Anatomia | Código |
|---|---|---|
| Tab na prévia | controles como `^[` | espaço, não `^I` |
| C1 na prévia | não diz | o escape de 7 bits que ele representa (CSI vira `^[[`) |
| Rodapé sem linhas de fora | "e mais N linhas · M caracteres" | só "M caracteres" |
| Erro ao ler a área de transferência | não diz | conta como vazia |
| Envio recusado | não diz | aviso de erro |

**Folhas de gestão (§4.12):**

| Item | Anatomia | Código |
|---|---|---|
| Ação recusada pelo app antes do fio | não diz | a folha fica aberta, com o aviso |
| Itens com ação pendente | RF-4.9 marca o item | os outros itens da mesma aba ou grupo ficam desabilitados, sem nota |
| Subtítulo do menu da aba | só o título | "No grupo G · Janela N", "No grupo G", "Janela N" ou nenhum, conforme o grupo e o número de janelas; N é a posição em `workspace.windows` |
| Subtítulo das folhas de formulário | não diz | o título ou o nome do alvo |
| Marca "Padrão" (§4.12.8) | `type.chip` | `type.chip` em `accent.text`, sem fundo de chip |
| "Automática" (§4.12.6) | uma opção | pílula da altura de `swatch`, com os espaçamentos `chip.*` e borda `border.field` |
| Rótulo "Cor" no Novo grupo | não tem | tem |
| Amostras de cor | alvo 48 | separadas por `target.gap` |
| `check` sobre a amostra escolhida | ícone `check` | em `text.title`: no escuro, contraste arriscado sobre as cores pastel |
| "Sem grupo" (§4.12.4) | uma linha | com amostra em `ungrouped` |
| `check` da lista de Mover | não fixa a cor | `accent` |

**Confirmação de fechamento e avisos (§4.13, §4.14):**

| Item | Anatomia | Código |
|---|---|---|
| "e mais N" da lista de processos | não fixa | `type.secondary` em `text.secondary` |
| Vão entre o motivo e a lista de processos | só fixa o recuo (`dialog.list-indent`) | nenhum: a lista vem colada no motivo |
| Prazo | barra de 2 | o texto "Restam N s para responder" (`type.secondary`, `text.tertiary`) e a barra, separados por `dialog.gap` |
| Sobreposições da sessão quando o desktop reinicia | não diz | fecham, porque os ids antigos mudam de sentido |
