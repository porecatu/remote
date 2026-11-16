# Proposta de anatomia das telas

**Status:** Proposta, **aguardando o aval do dono do produto**. Nada neste documento vale como decisão, e nenhuma tela é implementada a partir dele antes do aval ([README do design](README.md)).
**Data:** 2026-11-15
**Relacionados:** [PRD-000](../prd/prd-000-visao-de-produto.md) a [PRD-004](../prd/prd-004-gestao-de-abas.md), [arquitetura](../arquitetura.md) (mapa de telas, §7), [ADR-0002](../adr/0002-render-da-grade-com-skia.md), [ADR-0005](../adr/0005-catalogo-de-textos-e-idiomas.md), [especificação visual do desktop](https://github.com/porecatu/terminal/blob/main/docs/design/especificacao-visual.md)

> **Decisões do dono de 2026-11-16 que prevalecem sobre trechos desta proposta** (registradas nos PRDs; a proposta continua **aguardando o aval visual** e será ajustada com ele):
>
> - §4.1, aparelho sem biometria nem código: o app **abre sem bloqueio**, com um aviso permanente, em vez de não abrir ([PRD-001](../prd/prd-001-desktops-e-pareamento.md) RF-1.20).
> - §4.5.2, grupo: o toque no cabeçalho só **expande** no app um grupo colapsado no desktop; um grupo aberto no desktop não se recolhe só no app ([PRD-002](../prd/prd-002-navegacao-do-workspace.md) RF-2.8).
> - §4.11, colar: o diálogo aparece com **qualquer** quebra de linha, inclusive uma só no fim, e a prévia corta cada linha em **120** caracteres, não 60 ([PRD-003](../prd/prd-003-terminal.md) RF-3.17).

Este é o primeiro artefato previsto em `docs/design/`: o desenho em ASCII, os tokens e os gestos de cada tela do [mapa de telas](../arquitetura.md), para o dono aprovar, corrigir ou recusar **antes** de existir uma linha de tela. Segue a regra do Porecatu: nenhuma cor, dimensão ou espaçamento é inventado no código; o que não sai do desktop entra aqui, marcado como **proposta**.

## Como ler

- **Unidades.** Medidas em pontos lógicos (pt no iOS, dp no Android); tamanho de texto em pt/sp, que acompanha o ajuste de fonte do sistema.
- **Proposta.** Todo valor, comportamento ou arranjo que não vem do PRD, da spec do protocolo ou da especificação visual do desktop está marcado **(proposta)**. Valor sem marca vem de um deles, com a origem dita.
- **Textos.** As frases entre aspas são rascunhos em pt_BR para o dono avaliar o tom. Nasceriam no catálogo ([ADR-0005](../adr/0005-catalogo-de-textos-e-idiomas.md)), com o par em en_US, e o código só guarda códigos e identificadores.
- **Fora do alcance.** Mudar o protocolo, o PRD ou o desktop; a escolha do pacote de ícones para React Native (os ícones são pedidos pelo nome Lucide); a implementação do render Skia (ADR-0002, ainda Proposto).
- **Esboços.** ASCII sem escala; `[ ]` é botão, `( )` é escolha, `<` é voltar.

---

## 1. Princípios de desenho (propostas transversais)

1. **Uma coluna, uma mão.** Tudo cabe numa coluna de celular em retrato, com os controles frequentes ao alcance do polegar (barra de teclas, folhas de ação embaixo). Paisagem funciona, sem layout próprio; tablet usa o layout do celular ([PRD-000](../prd/prd-000-visao-de-produto.md), não-objetivos).
2. **Navegação em pilha.** Telas empilham (expo-router `Stack`); o voltar do sistema e o gesto de voltar do iOS fazem sempre o mesmo que a seta da barra. Ações sobre um item (menus, escolhas, confirmações) abrem **folhas inferiores** (*bottom sheets*) ou diálogos centrais, nunca telas novas.
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
| `ungrouped` | `#7b838f` | `#8c8fa1` | cor de aba sem grupo (`ungrouped_color`) |

**Cor de grupo.** Vem de `theme.group_colors` (na falta, as seis do desktop: `#ef8a8a #e0b060 #5ed3bc #6fa8f5 #a68cf0 #86c56a`). **Nunca é cor de texto**: sobre o fundo claro ela dá de 1,6:1 a 2,4:1. Vira só faixa, ponto, amostra e tingimento (alfa .14, o "fundo do badge" do desktop).

### 2.3 Tipografia

| Uso | Família | Tamanho / peso | Origem |
|---|---|---|---|
| Chrome (títulos, linhas, botões, menus) | fonte do sistema (San Francisco no iOS, Roboto no Android) | ver escala abaixo | o desktop usa a fonte de interface do sistema ([ADR-0084](https://github.com/porecatu/terminal/blob/main/docs/adr/0084-fonte-do-sistema-e-ajustes-da-barra-de-abas.md)) |
| Grade do terminal | Iosevka Fixed 400/500, embutida | calculado (ver §4.7) | `[terminal.font]`; ADR-0002 |
| Mono do chrome: badge de perfil, `usuário@host`, `cwd`, nome de processo, chips e rótulos de tecla, impressão digital, prévia de colagem | Iosevka Fixed | 12–13 | desktop: badges, chips, campo de senha. **Proposta:** estender a `usuário@host` e `cwd`, onde caminho e host leem melhor em mono |
| Ícones | Lucide | 24 de em; desenho ~0,6 da em | ADR-0024 do desktop |

Escala do chrome **(proposta)**, em sp (acompanha o ajuste de fonte; limite de 1,3× nas barras e na barra de teclas, que têm altura fixa; sem limite no corpo das listas, que crescem):

| Papel | Tamanho / peso |
|---|---|
| Título de tela | 20 / 600 |
| Título de diálogo e de folha | 17 / 600 |
| Linha principal (título de aba, nome de desktop) | 16 / 500 |
| Corpo | 15 / 400 |
| Linha secundária | 13 / 400 |
| Rótulo de seção (caixa alta, espaçamento .6) | 12 / 600 |
| Chip, badge, contador | 11 / 600 |
| Rótulo de tecla (mono) | 13 / 500 |

### 2.4 Raios

| Token | Valor | Origem |
|---|---|---|
| `radius.sheet` (canto superior da folha) | 10 | modal do desktop (10) |
| `radius.card` (linha, cartão, diálogo central) | 8 | janela, popover, cápsula de grupo (8) |
| `radius.control` (botão, campo, tecla, item de menu) | 6 | aba, botões da barra (6); campo 5 do desktop sobe a 6 por consistência com o botão, **proposta** |
| `radius.chip` (badge, chip, contador) | 4 | botão de fechar da aba (4); badge do desktop 3 |
| `radius.round` (ponto, trilho do interruptor) | 50% | ponto de status (50%) |

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
| `bar.height` | 56 (barra de tela), 48 (barra do terminal) | |
| `keybar.height` | 52 (teclas de 44, margem de 4) | |
| `gutter` | 16 | margem lateral das telas, mais a área segura do aparelho |
| `space.scale` | 4, 8, 12, 16, 24, 32 | o desktop usa 3, 6, 8, 10, 12, 18, 24; escala de 4 pt do mobile |
| `badge.height` | 20 | |
| `swatch` | 40 desenho, alvo 48 | amostra de cor do grupo (o desktop tem 28) |
| `fab` | 44 | botões flutuantes da grade (§4.7) |
| `dialog.width` | até 360 e margem de 24 de cada lado | o diálogo do desktop tem piso 360 e teto 720; no celular a largura é a da tela |
| `terminal.min-font` | 8 pt (de [RF-3.7](../prd/prd-003-terminal.md)) | limiar de "caber a largura" |
| `terminal.read-font` | 12 pt; máximo 24 pt | tamanho de leitura quando a largura não cabe (proposta; o PRD não fixa o valor) |
| `terminal.line-height` | 1,3 da fonte | **proposta:** o desktop usa 1,75; no celular, mais linhas visíveis |

---

## 3. Mapa de navegação

O [mapa de telas](../arquitetura.md) vale, com um ajuste **(proposta)**: "Sobre este aparelho" entra por **Configurações** (rara demais para ocupar a barra da lista).

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
| Sem biometria nem código cadastrado | "Este aparelho não tem tela bloqueada. Configure uma nas configurações do sistema para usar o app." com o botão "Abrir configurações do sistema". O app não abre sem isso, **a menos que** o bloqueio esteja desligado (RF-1.18). |

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
2. **Janelas (RF-2.6).** Na ordem recebida (mais recente primeiro). Com **uma** janela, o cabeçalho some e o conteúdo ocupa a tela. Com várias, cada janela é uma **seção recolhível**: cabeçalho de 52 com chevron, "Janela N" (N pela ordem) e, na linha de baixo, o título da aba ativa dela (`window.title`, 13 `text.secondary`) para o usuário reconhecer qual é; à direita a contagem de abas. Todas começam expandidas, e o estado recolhido fica na memória do app (como a expansão local de grupo, [arquitetura](../arquitetura.md) §2). **Decisão para o dono:** seções recolhíveis numa só rolagem, ou uma janela por vez com seletor de chips no topo (§7, item 3).
3. **Fixadas (RF-2.7).** Primeiro bloco da janela, com o rótulo de seção "Fixadas" (**proposta**: o desktop não rotula, mas numa lista vertical o rótulo explica por que o bloco vem separado). Abas soltas, sem grupo, com o ícone `pin` (16, `text.tertiary`) à esquerda do título.
4. **Trilha (RF-2.7).** Grupos e abas soltas na ordem do desktop. Sem rótulo "Trilha" quando não há fixadas (o rótulo só existe para separar).
5. **Grupo.** Cartão `bg.row` com **faixa de 4 de largura na cor do grupo** na borda esquerda, tingimento .14 da cor no cabeçalho, e o cabeçalho de 52: nome (16/600), contagem de abas em chip (`badge`), chevron de expandir/recolher à direita e `ellipsis-vertical` (alvo 48) do menu do grupo. A cor é só faixa e tingimento, nunca o texto (§2.2). O toque no cabeçalho expande e recolhe **só no app** (RF-2.8). Grupo colapsado **no desktop** abre recolhido, e leva sob o nome a linha "Colapsado no desktop" (13, `text.tertiary`); o app não muda o desktop (colapsar lá é ação de menu, §4.10).
6. **Aba solta.** Cartão próprio `bg.row` (aba dentro de grupo é uma linha do cartão do grupo, sem borda própria).
7. **"Nova aba".** Última linha de cada janela e de cada grupo expandido: ícone `plus` e "Nova aba" em `accent.text`, 48 de altura. Toque abre a folha de §4.11, já com o contexto (janela ou grupo).

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
- **Aba ativa no desktop** (RF-2.9): ícone `monitor` 14 `text.tertiary` no fim da linha 1 e fundo `bg.selected`. Rótulo de acessibilidade "ativa no desktop". É informação, não seleção do app.

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

**Acessibilidade da tela.** Ordem de leitura: barra, faixa, seções. Cada aba é um elemento com rótulo composto: "build, aba, em execução, 2 painéis, campainha, ativa no desktop" na ordem dita; ações personalizadas "Abrir", "Menu da aba". Cabeçalho de grupo: a cor não é lida (o protocolo manda só RGB, sem nome de cor); o rótulo é "Servidores, grupo, 3 abas, expandido". Cabeçalhos de janela e de seção são marcados como cabeçalho (navegação por cabeçalho do leitor de tela). Mudanças ao vivo **não** são anunciadas linha a linha (poluiria); só a perda da aba aberta e o estado de conexão são anunciados.

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
|                      (fim)  |   botoes flutuantes (44)
|                     (cursor)|
+-----------------------------+
| Esc Tab Ctrl Alt | v ^ > ...|   barra de teclas (52)
+-----------------------------+
|     teclado do sistema      |
+-----------------------------+
```

**Barra do terminal** (48, `bg.bar`):
- `chevron-left` voltar à árvore (cancela a assinatura, RF-3.1).
- Centro: título da aba (16/500), e a linha 2 com `usuário@host` (aba SSH) ou o `cwd` do painel; um chip de estado quando não está `running`.
- À direita: seletor de painéis (só com mais de um, chip "2/3", §4.9), `keyboard` (mostra ou esconde o teclado) e `ellipsis-vertical` (menu da aba, RF-4.6).
- **Campainha:** ícone `bell` pisca por 2 s na barra (vermelho `error`) no painel visível. Junto, a vibração curta quando ligada nas configurações (RF-3.23). Proposta: o aviso visual existe sempre, para quem desligou a vibração ou não sente.

**Grade.** Fundo `bg.terminal`, preenchendo o espaço entre a barra e a barra de teclas. Margem de 0 nas laterais (cada ponto conta); a grade respeita a área segura (*notch*, cantos). O texto sai do `theme` do desktop. A tela de terminal é **imersiva em paisagem**: a barra sobe para 40 e a barra de teclas vira uma linha única.

**Privacidade.** `FLAG_SECURE` no Android; cobertura no seletor de apps no iOS (§4.1). Nenhum texto da grade em log.

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

**Duplo toque não existe**: atrasaria o toque simples que abre o teclado. Os atalhos de zoom são botões:

**Botões flutuantes** (`fab` 44, `bg.bar` a 90%, borda `border.row`; empilhados no canto inferior direito da grade, acima da barra de teclas, 8 de distância):

| Botão | Aparece quando | Efeito |
|---|---|---|
| `arrow-down-to-line` "Voltar ao fim" (RF-3.12) | o usuário está fora do fundo | rola ao fim da grade viva |
| `locate-fixed` "Seguir o cursor" (RF-3.8) | a grade é mais larga que a tela | enquadra a coluna do cursor e passa a segui-lo enquanto o usuário digita; ligado fica em `bg.selected` com borda `accent` |
| `scan` "Caber a largura" | o zoom não é o de caber | volta ao padrão |

**Histórico (RF-3.11, RF-3.12).** Páginas de scrollback pedidas conforme o usuário avança; enquanto lê o histórico, a grade viva continua a atualizar embaixo, e o texto lido **não anda** quando `history` cresce. Entre a grade viva e o histórico não há separador (o desktop também não tem): o texto é contínuo. Carregando uma página, uma linha fina de spinner (16) no topo do histórico; sem mais histórico, nada.

**Mudança de tamanho no desktop (RF-3.10).** Um novo `grid-snapshot` com outras dimensões mantém o zoom relativo; a rolagem horizontal vai ao cursor. Sem animação.

**Zoom por aba (RF-3.9).** Lembrado na sessão do app; não persiste.

**Acessibilidade da grade.** O canvas do Skia não expõe texto ([ADR-0002](../adr/0002-render-da-grade-com-skia.md), dívida registrada). Proposta mínima, a validar no spike: um elemento único de acessibilidade sobre a grade com rótulo "Terminal, <título>" e **valor** "últimas N linhas" (resumo textual das 5 a 10 últimas linhas não vazias, atualizado no máximo a cada 2 s e **só quando o leitor de tela está ligado**, e nunca a um log). Fica **dívida de acessibilidade** assumida, como no desktop, até o ADR-0002 definir a camada paralela. Os botões flutuantes e a barra de teclas são plenamente acessíveis.

### 4.8 Terminal: barra de teclas especiais

**Objetivo.** O que o teclado virtual não tem: `Esc`, `Tab`, `Ctrl`, `Alt`, setas, navegação, `F1`–`F12`. RF-3.15, RF-3.16, RF-3.19.

**Onde.** Fixa **acima do teclado do sistema** (acompanha o teclado), só enquanto o teclado está aberto. Altura 52, `bg.bar`, borda superior `border.row`. Teclas de 44 × 44 (`target.min`: aqui 44 e não 48, por falta de altura; é o piso de iOS), margem 4, vão de 6, raio 6, rótulo mono 13/500 `text.body`, fundo `bg.key`, pressionada `bg.key.pressed`.

```
+-----------------------------------------------+
| Esc  Tab  Ctrl  Alt | < v ^ > | Home End PgUp...|  rolavel
+-----------------------------------------------+
```

**Arranjo (proposta).** Uma linha só, em três grupos:
1. **Fixos à esquerda:** `Esc`, `Tab`, `Ctrl`, `Alt` (os mais usados, sempre visíveis).
2. **Setas:** `←` `↓` `↑` `→` (ícones `arrow-left`, `arrow-down`, `arrow-up`, `arrow-right`), com **repetição** ao manter pressionada (primeira repetição em 400 ms, depois a cada 80 ms).
3. **Rolável à direita:** `Home`, `End`, `PgUp`, `PgDn`, `Fn` e `Colar` (ícone `clipboard-paste`). Um degradê na borda direita indica que há mais.

A alternativa (duas linhas, tudo à vista) custa 52 de altura a mais num aparelho que já perde metade da tela para o teclado; vai ao dono (§7, item 4).

**`Fn`.** Troca a linha rolável por `F1`…`F12`, com uma tecla `x` ("Fechar F") de volta à normal.

**Modificadores com trava (RF-3.16).** `Ctrl` e `Alt` têm três estados, **sempre distinguíveis sem a cor**:

| Estado | Visual |
|---|---|
| Solto | tecla normal |
| Armado (um toque; vale para a próxima tecla e solta) | fundo `bg.selected`, borda 2 `accent`, e a barra inferior do rótulo sublinhada |
| Travado (dois toques; até o terceiro) | o mesmo mais o ícone `lock` (10) no canto da tecla |

O modificador **vale para**: o próximo texto do teclado do sistema (`Ctrl` + "c" vai como `key { "c", Ctrl }`, nunca como `text`), e para as teclas da barra (setas, `Home`, `Tab`…), enviadas como `key` com os `mods`. `Esc` e `Fn` não consomem o armado. O estado vale **por tela do terminal** e zera ao sair dela.

**Vibração.** Cada toque em tecla da barra dá um tique leve (*haptic*) se o aparelho suporta e a vibração das configurações está ligada. (Proposta: a mesma chave da campainha.)

**Acessibilidade.** Cada tecla é um botão com rótulo ("Escape", "Tab", "Controle, solto", "Controle, travado", "Seta para cima"). Os estados armado e travado são anunciados. A barra tem um `accessibilityLabel` de grupo "Teclas especiais".

### 4.9 Terminal: seletor de painéis

**Objetivo.** Trocar o painel visto numa aba com mais de um painel. RF-2.10, RF-3.3.

Chip "2/3" na barra do terminal (alvo 48) abre uma **folha inferior** com:

1. **Miniatura da disposição.** Desenha o `layout` (divisões, `dir`, `ratio`) num retângulo de 16:10, cada painel um retângulo com borda `border.row`; o painel **visto** leva fundo `bg.selected`; o **focado no desktop** leva borda 2 em `accent`; um `monitor` 12 no canto. Cada retângulo tem o título do painel (13) truncado e um ponto de estado.
2. **Lista dos painéis** (a mesma informação, em linhas de 56), na ordem de leitura da árvore (primeiro, depois segundo): título, `cwd` em mono 12 e o chip de estado (§4.5.2). Marca "focado no desktop" e "visto aqui" em texto.

A **lista é o controle garantido**: um painel de `ratio` pequeno pode ter retângulo menor que 44 na miniatura, e a lista não tem esse problema. O toque na miniatura ou na linha assina o painel escolhido, e cancela a assinatura do anterior (uma por vez, RF-3.3). A folha fecha sozinha e o terminal mostra o painel novo. **O foco do desktop não muda** nunca (spec §7).

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

- **Uma linha só:** vai direto como `paste`, sem diálogo.
- **Mais de uma linha:** diálogo central de confirmação antes de enviar:

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

- Prévia em **mono 12**, cartão `bg.field`, com as **5 primeiras linhas** (cada uma truncada em 60 caracteres por reticências) e a linha "e mais N linhas · M caracteres". Caracteres de controle aparecem como `^[` etc. e linhas com mais de 1000 caracteres levam o aviso "linha muito longa" **(proposta)**.
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
| Renomear | `pencil` | abre §4.12.3 |
| Mover para grupo… | `folder-input` | abre §4.12.4; escondido na aba fixada |
| Mover para janela… | `app-window` | abre §4.12.5; **esmaecido** (nunca ausente) com uma só janela, com a nota "Só há uma janela no desktop" |
| Novo grupo com esta aba… | `folder-plus` | abre §4.12.6; escondido na fixada (o desktop recusa) |
| *divisor* | | |
| Fechar painel | `panel-top-close` | só se a aba tem mais de um painel e só no menu aberto do terminal, aplicando ao painel visto |
| Fechar aba | `x` | destrutivo (`destructive`); abre o diálogo de §4.13 se o desktop pedir |

**Aba fixada:** só **Renomear** e **Fechar aba** (RF-4.6). Como fechar uma fixada, no desktop, a **desafixa**, o app mostra, antes de pedir a ação, um diálogo próprio **(proposta; ver §7 item 6)**: "Fechar uma aba fixada também a desafixa no computador. Fechar mesmo?" com **Cancelar** e **Fechar**. O app não tem como saber o que o desktop fará além do que a spec diz; se o dono preferir, o diálogo sai.

**Ordem.** Difere do desktop (Nova aba, Fechar, Mover para grupo, Mover para janela), **proposta**: no celular, o destrutivo fica no fundo da folha, ao alcance do polegar mas longe do primeiro toque. A "Nova aba" do menu do desktop não entra: no celular ela mora nas linhas "Nova aba" da árvore (§4.5.2). A ordem final cabe ao dono.

#### 4.12.2 Menu do grupo (RF-4.8)

Título: nome do grupo. Itens: **Renomear** (`pencil`, §4.12.3), **Cor** (`palette`, §4.12.7), **Colapsar no desktop** ou **Expandir no desktop** (`chevrons-down-up` / `chevrons-up-down`; o rótulo diz "no desktop" para não se confundir com o recolher local do app, RF-2.8), **Mover para janela…** (`app-window`, §4.12.5, esmaecido com uma só janela), *divisor*, **Desfazer grupo** (`ungroup`, destrutivo).

- **Desfazer grupo** pede diálogo no app (RF-4.8): título "Desfazer o grupo Servidores?"; corpo "As 3 abas continuam abertas, mas ficam soltas na trilha. Esta ação é difícil de reverter."; **Cancelar** e **Desfazer grupo** (destrutivo).
- "Fechar grupo" **não existe** na v1 (não há `close-group` no protocolo).

#### 4.12.3 Renomear

Para aba: folha com um campo (48, `bg.field`, foco automático, texto inicial = título atual, selecionado), botões **Cancelar** e **Salvar**. Quando `custom = true` aparece, abaixo do campo, o botão de texto **Restaurar título automático** (envia `null`, RF-4.3). Campo vazio desabilita Salvar (para vazio o caminho é restaurar). Sem limite de tamanho no app (o desktop trunca na barra).
Para grupo: igual, sem o restaurar.

#### 4.12.4 Mover para grupo (RF-4.4)

Lista de **escolha única** com os grupos **da mesma janela** (amostra de cor de 16 + nome + contagem) e, no topo, "Sem grupo". O grupo atual leva `check` e fica desabilitado; o toque numa linha envia e fecha. Sem grupo algum na janela, só "Sem grupo", com a nota "Esta janela ainda não tem grupos. Use Novo grupo com esta aba."

#### 4.12.5 Mover para janela (RF-4.5)

Lista de **outras** janelas (a de origem não aparece), cada uma identificada pelo **título da aba ativa** (como o "Mover para janela…" do desktop) e a contagem de abas ("3 abas"; plural no catálogo). Sem "janela nova" na v1. Serve às abas (`move-tab-to-window`) e aos grupos (`move-group-to-window`).

#### 4.12.6 Novo grupo (RF-4.7)

Folha com campo de nome (obrigatório) e a fila de **seis amostras de cor** (do `theme.group_colors`, 40 de desenho, alvo 48; selecionada = anel `text.title` 2 + ícone `check`, que dispensa a cor; rótulo de leitura "Cor 3 de 6") e uma opção "Automática" (padrão; o desktop atribui). **Criar grupo** (primário). O `new-group` leva a aba atual; a folha só vale em aba **solta** (não fixada).

#### 4.12.7 Cor do grupo

Mesma fila de amostras do §4.12.6, escolha imediata (toque aplica e fecha), com a cor atual marcada com `check`.

#### 4.12.8 Nova aba (RF-4.1)

Aberta pelas linhas "Nova aba" da árvore (janela ou grupo). Folha com:

- Linha de contexto: "Em Janela 1" ou "No grupo Servidores" (13, `text.secondary`).
- **Lista de perfis** de escolha única (linhas de 56): nome, tipo (chip `local`, `ssh`, `wsl`, `outro`) e, no padrão, a marca "Padrão". O padrão vem **primeiro** e já selecionado (RF-4.1). Sem a lista de perfis (ainda não chegou `profiles`), a folha mostra spinner.
- Botão primário **Criar aba** (fixo no fim da folha).

Depois de tocar em **Criar aba** o botão vira spinner até o `action-result`. Com `created`, o app **abre a aba nova no terminal** do app (RF-4.1), sem mudar o foco do desktop. Aba SSH nova aparece normalmente `connecting` ou `awaiting-desktop` (§4.10). Erro: o próprio `action-result` vira o aviso do §4.14 e a folha fecha.

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

**Diálogo central** (confirmações do app): o modelo do §4.13, com os botões do desktop. Aplica-se a: remover desktop, recriar identidade, desfazer grupo, fechar fixada, colar várias linhas, fechar (do desktop).

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
| RF-2.10 | §4.5.2, §4.9 |
| RF-4.1 | §4.12.8 |
| RF-4.2 | §4.13 |
| RF-4.3 | §4.12.3 |
| RF-4.4, RF-4.5 | §4.12.4, §4.12.5 |
| RF-4.6 | §4.12.1 |
| RF-4.7, RF-4.8 | §4.12.6, §4.12.7, §4.12.2 |
| RF-4.9, RF-4.10 | §4.5.2, §4.14 |

---

## 7. O que mais precisa do olhar do dono

Em ordem de impacto. Cada item tem a recomendação desta proposta; o dono pode recusar qualquer uma.

1. **Árvore em uma rolagem só** (janelas como seções recolhíveis, grupos como cartões com faixa de cor), ou uma janela por vez com seletor de chips. É a tela mais usada e define a forma do app (§4.5.2).
2. **Terminal sem duplo toque, com botões flutuantes** de voltar ao fim, seguir o cursor e caber a largura, em vez de gestos escondidos (§4.7).
3. **Cor de grupo apenas como faixa e tingimento, nunca texto**, e a campainha como ícone (o desktop usa só o ponto) por acessibilidade (§2.2, §4.5.2).
4. **Barra de teclas em uma linha** (fixos à esquerda, resto rolável, `Fn` troca para F1 a F12), contra duas linhas sempre à vista; e teclas de 44 em vez de 48 (§4.8).
5. **Paleta clara do chrome com tons de texto mais escuros que os do desktop** (`#8c8fa1` e `#df8e1d` reprovam em contraste no celular) e rótulo de seção mais legível que o `#5c646f` do desktop (§2.2).
6. **Fechar aba fixada** pede, no app, a confirmação de que ela será desafixada, comportamento do desktop que a spec do protocolo não descreve; e a ordem do menu da aba, com o destrutivo no fim, diferente da do desktop (§4.12.1).
7. **Dimensões de leitura do terminal**: 12 pt de leitura, entrelinha 1,3 (o desktop tem 1,75), cursor fixo (§2.5, §1 princípio 9).
8. **"Sobre este aparelho" dentro de Configurações**, e não na lista de desktops, divergindo do mapa de telas da arquitetura (§3, §4.4).

## 8. Pendências para outras etapas (não alteradas aqui)

- `last-tab` está na spec ([mensagens §9](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)) mas não no RF-4.10 nem na lista de erros do catálogo. *Resolvido em 2026-11-16: [PRD-004](../prd/prd-004-gestao-de-abas.md) RF-4.11, e o catálogo tem `error.last-tab`.*
- O [ADR-0005](../adr/0005-catalogo-de-textos-e-idiomas.md) item 4 manda `Intl.PluralRules`, e as regras do repositório mandam plurais escritos à mão (Hermes); precisa de uma correção factual no ADR. *Resolvido em 2026-11-16: revisão no item 4 do ADR-0005.*
- O pacote de ícones (Lucide em React Native) e a fonte Iosevka embutida entram em ADR próprio quando a implementação chegar.
- Nomes de cor de grupo: o `theme` só leva RGB; sem nomes, a leitura é "cor N de 6".
