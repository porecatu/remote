# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Versionamento seguirá [SemVer](https://semver.org/lang/pt-BR/) a partir da
primeira versão publicada nas lojas.

## [Não lançado]

Implementação inicial: a camada de lógica (2026-11-16) e as telas dos PRDs 001
a 004 (2026-11-17), conforme a [anatomia das telas](docs/design/proposta-de-anatomia.md)
aprovada. O app segue a **especificação 0.6** do protocolo. Tudo o que entrou é
verificado por teste automatizado em Node (`pnpm test`: 1680 testes em 130
suítes, com `jest-expo` e `@testing-library/react-native`); **nada foi rodado
num aparelho**, e o [ADR-0002](docs/adr/0002-render-da-grade-com-skia.md) segue
Proposto até a medição do render em aparelho. Dívida de verificação no
[roadmap](docs/roadmap.md).

### Adicionado

- **Sessões salvas** (PRD-004 RF-4.12 a RF-4.16, anatomia §4.12.10, especificação 0.6 do protocolo; 2026-11-20): o botão `bookmark` na barra do workspace abre a folha "Sessões salvas", que pede a lista ao desktop a cada abertura e restaura a escolhida. Com o desktop no modo `append`, um segundo passo pergunta a janela. Nada é ativado nem fechado no desktop, e o app fica na árvore. Controlador `src/controllers/savedSessions.ts`, ação `restoreSession`, os erros `unknown-session` e `session-unreadable` no catálogo, o desktop falso responde `list-sessions` e o `pnpm real-host` ganhou o caso (ainda não rodado). O pacote `@porecatu/protocol` foi regerado do commit `a52fbb1`.
- **Verificação contra o Porecatu real** (`pnpm real-host`, [test/real-host/](test/real-host/README.md), 2026-11-18): a lógica do app, montada como em produção mas sem telas, contra o Porecatu 0.10.0 e o relay de verdade em `127.0.0.1`, fora do `pnpm test`. Passou inteira: pareamento com confirmação no desktop, sessão, grade, input, scrollback, campainha, as 14 ações com efeito e o painel focado intacto, confirmação de fechamento, códigos de erro, nenhuma janela do sistema levantada, presença e reconexão. Nada do app precisou mudar. Resultado e limites no [roadmap](docs/roadmap.md).
- **Barra de teclas toda rolável, em uma linha** (anatomia §4.8; RF-3.15; pedido do dono em 2026-11-18): `Esc`, `Tab`, `Shift`, `Ctrl` e `Alt` agora rolam junto com o resto, na ordem `Esc Tab Shift Ctrl Alt | ← ↓ ↑ → | Home End PgUp PgDn | Colar | F1…F12`, em grupos separados por filetes. As teclas `F1`–`F12` ficam sempre à mão, no fim da linha, e **não há mais `Fn`**. Uma primeira versão do dia, com duas linhas, teclado de setas à parte e símbolos (`fa308d6`), foi recusada pelo dono e desfeita.
- **Modificador ligado fixado à esquerda da barra** (anatomia §4.8, RF-3.16; pedido do dono em 2026-11-18): `Shift`, `Ctrl` ou `Alt`, armado ou travado, sai da linha rolável e fica fixo à esquerda, com o visual de ligado, para nunca sumir da vista. Um toque nessa tecla o desliga na hora (`releaseModifier`, `ModifierKeys.release`); ao desligar, ou depois de gasto, ele volta ao seu lugar. O leitor de tela ouve "Toque para soltar".
- **Opções de vista no menu da aba**: "Caber a largura", "Seguir o cursor" (item de marcar, `SheetItem` ganha `checked`) e "Voltar ao fim" passam a ser os primeiros itens do menu de reticências do terminal, sempre presentes e esmaecidos quando não se aplicam.

- **Tecla `Shift` na barra de teclas** (entre `Tab` e `Ctrl`), modificador com trava como `Ctrl` e `Alt` (RF-3.16): `Shift` + `Tab`, `Shift` + setas e `Shift` + letra do teclado do sistema. A letra vai em maiúscula, com o bit `Shift`, porque o desktop não muda a caixa por `Shift`.

- **Projeto Expo** SDK 58 (React Native 0.88.1, React 19.3.0, Hermes,
  `expo-router`, *development build*) em TypeScript 6.0.3 estrito, com Node
  26.13.0, pnpm 12.17.0 e todas as dependências em versão exata
  ([ADR-0001](docs/adr/0001-expo-e-typescript.md),
  [ADR-0007](docs/adr/0007-toolchain-pinada.md)). Identificador
  `br.com.porecatu.remote` e textos das permissões nativas **provisórios**.
- **Protocolo** pelo `@porecatu/protocol` 0.1.0, vindo de
  `vendor/porecatu-protocol-0.1.0.tgz` enquanto o pacote não é publicado;
  `src/protocol/` é o único ponto de re-export. Aleatoriedade por
  `expo-crypto`, instalada antes do pacote e conferida no arranque
  ([ADR-0004](docs/adr/0004-criptografia-em-js-puro.md)).
- **Conexão**: socket do relay sobre o WebSocket do React Native, ciclo da
  sessão (`connecting` → `handshaking` → `greeting` → `ready`) com reconexão em
  1, 2, 4, 8 e 16 s, fechamento depois de 30 s em segundo plano, consulta de
  presença a cada 30 s e um store `zustand` por desktop aberto
  ([PRD-002](docs/prd/prd-002-navegacao-do-workspace.md)).
- **Pareamento**: identidade do aparelho no Secure Store, impressão digital,
  fluxo `XX` com conferência da chave do desktop contra o QR, *deep link*
  `porecatu://pair` retido enquanto o app está bloqueado, e lista de até 20
  desktops ([PRD-001](docs/prd/prd-001-desktops-e-pareamento.md),
  [ADR-0003](docs/adr/0003-chaves-no-armazenamento-seguro.md)).
- **Bloqueio do app** por biometria ou código do aparelho, ligado por padrão,
  com novo bloqueio depois de 1 minuto em segundo plano; aparelho sem bloqueio
  abre o app com um aviso permanente (RF-1.20).
- **Workspace**: seletores da árvore, busca por título, grupo, `cwd` e
  `usuário@host`, miniatura da disposição dos painéis e expansão local de
  grupos colapsados no desktop.
- **Grade**: modelo com estilos internados e linhas sujas, `grid-ack` depois de
  aplicar, `max_subscriptions` do `welcome`, scrollback paginado indexado pela
  posição absoluta da linha, e resolução de cor pelo `theme` com esmaecido de
  fator 0,66 ([PRD-003](docs/prd/prd-003-terminal.md)).
- **Input**: modificadores com trava, barra de teclas, `key`/`text-input`/`paste`
  só para painel assinado e `running`, teto de 1 MiB por envio e confirmação
  do colar sempre que houver quebra de linha, com prévia de 5 linhas × 120
  caracteres.
- **Gestão de abas**: as ações da spec (14 desde a 0.4, veja em *Mudado*),
  pendência por item, espera da aba criada e confirmações de fechamento com
  prazo de 60 s ([PRD-004](docs/prd/prd-004-gestao-de-abas.md)).
- **Catálogo de textos** `en_US` e `pt_BR` com chaves tipadas, plural escrito à
  mão e mensagem para todo código do protocolo
  ([ADR-0005](docs/adr/0005-catalogo-de-textos-e-idiomas.md)).
- **Logger único** que só registra eventos e códigos, nunca conteúdo.
- **Desktop falso** (`pnpm fake-host`): relay e desktop num processo Node em
  `127.0.0.1`, com URI e QR em texto, para desenvolver o app sem o Porecatu.
- **CI**: `typecheck`, `lint` e `test`; links da documentação, cabeçalhos SPDX,
  licenças das dependências de produção e DCO; Dependabot.
- **Dependências das telas**, em versão exata: `lucide-react-native` sobre
  `react-native-svg` ([ADR-0008](docs/adr/0008-icones-lucide-em-svg.md)),
  `expo-font` com a Iosevka Fixed 400/500 em `assets/fonts/`
  ([ADR-0009](docs/adr/0009-iosevka-fixed-embutida.md)),
  `react-native-gesture-handler`, `react-native-reanimated`,
  `react-native-worklets` e `react-native-keyboard-controller`
  ([ADR-0010](docs/adr/0010-gestos-animacao-e-teclado.md)),
  `@shopify/react-native-skia`
  ([ADR-0002](docs/adr/0002-render-da-grade-com-skia.md), Proposto), e o
  `@testing-library/react-native` para os testes de tela. O lint proíbe o índice
  do Lucide e o `Modal` do React Native; os mocks oficiais das bibliotecas
  nativas ficam em `test/setup/`.
- **Tema e primitivas** (`ui/theme/`, `ui/components/`): os tokens da
  anatomia §2 em claro e escuro, o componente `Icon` e as primitivas (botões,
  linhas de lista, barra de tela, campo, chip, rádio, interruptor, faixa,
  estado vazio, esqueleto).
- **Serviços e controladores**: `ui/services/` concentra os módulos nativos
  atrás de interfaces (só `nativeServices.ts` os importa), e `src/controllers/`
  liga a lógica às telas sem React: `appShell` (bloqueio, segundo plano e
  *deep link*), `desktops`, `settings`, `pairing`, `terminalSession` (assinatura,
  input, histórico e colar do painel na tela) e `overlay`
  ([arquitetura](docs/arquitetura.md) §1).
- **Raiz do app** (`ui/root/`, `app/_layout.tsx`): tela de bloqueio, cobertura
  de privacidade acima de tudo, *deep link* de pareamento entregue ao fluxo só
  depois do desbloqueio, e o `app/+native-intent.tsx`, que impede o token de
  pareamento de virar parâmetro de rota. O navegador só monta depois do
  primeiro desbloqueio ([PRD-001](docs/prd/prd-001-desktops-e-pareamento.md)
  RF-1.5, RF-1.17 a RF-1.20).
- **Folhas, diálogos e avisos próprios** (`ui/overlay/`), na mesma janela e
  sem `Modal`, com voltar do Android, conteúdo de baixo escondido do leitor de
  tela e foco devolvido à origem ao fechar
  ([ADR-0011](docs/adr/0011-folhas-dialogos-e-avisos-proprios.md)).
- **Tela de desktops** (`app/index.tsx`, `ui/screens/desktops/`): lista com
  presença e estado da última conexão, puxar para atualizar, renomear e remover
  ([PRD-001](docs/prd/prd-001-desktops-e-pareamento.md) RF-1.12 a RF-1.16).
- **Telas de pareamento** (`app/pair/`, `ui/screens/pairing/`): leitura do QR
  pela câmera, nome do aparelho, espera da confirmação com a impressão digital e
  os resultados; o workspace abre na mesma sessão do pareamento (RF-1.10).
- **Configurações e Este aparelho** (`app/settings/`, `ui/screens/settings/`):
  idioma, bloqueio do app, vibração na campainha, nome e impressão digital do
  aparelho, e recriar a identidade (RF-1.2, RF-1.3).
- **Tela do workspace** (`app/desktop/[id]/`, `ui/screens/workspace/`): a árvore
  de janelas, grupos, fixadas e abas, busca, faixa de conexão e telas de
  estado, com a sessão aberta ao entrar e fechada ao sair
  ([PRD-002](docs/prd/prd-002-navegacao-do-workspace.md)).
- **Tela do terminal** (`app/desktop/[id]/tab/[tab].tsx`,
  `ui/screens/terminal/`, `ui/terminal/`): grade desenhada em Skia com uma
  gravação por linha (`ui/terminal/grid/`), zoom e rolagem (`src/terminal/`),
  histórico, seletor de painéis, cartão de estado do painel, barra de teclas
  grudada no teclado, colar com confirmação, campainha e captura de tela
  bloqueada enquanto a tela está aberta
  ([PRD-003](docs/prd/prd-003-terminal.md)).
- **Gestão de abas na tela** (`ui/sheets/`, `ui/session/`): menus da aba e do
  grupo, Nova aba com perfil, folhas de renomear, mover para grupo e para
  janela, novo grupo e cor do grupo, a confirmação de fechamento pedida pelo
  desktop e os avisos de falha por código
  ([PRD-004](docs/prd/prd-004-gestao-de-abas.md)).
- **Catálogo das telas**: os textos de todas as telas em `en_US` e `pt_BR`
  (363 chaves), tempo relativo escrito à mão (`src/i18n/relativeTime.ts`) e a
  mensagem para input recusado por tamanho (RF-3.25).

### Corrigido

- **Teclas perdidas ou repetidas ao digitar rápido no Android (Gboard).** O campo de captura (`ui/terminal/CaptureInput.tsx`) deixou de ser controlado (`value=""`, cujo reset é assíncrono no React Native) e passou a enviar só a diferença para o texto anterior: o que entrou vai como texto e o que saiu, como `backspace`. O campo é esvaziado no Enter, no blur e depois de uma pausa quando acumula muito. Verificado só em Node; a confirmação em aparelho é dívida.

- **Terminal em branco ao abrir uma aba parada** (só aparecia com saída nova ou
  ao girar o aparelho). O Reanimated 4 grava um *shared value* da thread JS de
  forma assíncrona e a leitura JS devolve o valor antigo até a UI thread
  aplicar a escrita; o motor da grade (`ui/terminal/grid/gridEngine.ts`)
  escrevia `cols`/`viewWidth` e lia de volta na mesma chamada, nunca escolhia o
  zoom e não compunha o quadro. Agora o motor lê de uma cópia JS do estado da
  vista e os *shared values* são só saída; o que o gesto move na UI thread
  chega por argumento (`viewChanged`, `zoomed`, `settled`). Teste com caixas
  que imitam o atraso (`deferredBox`). **Falta confirmar em aparelho.**

### Mudado

- **Especificação 0.5 do protocolo: abrir uma aba não muda o desktop**
  ([ADR-0012](docs/adr/0012-abrir-aba-nao-muda-o-desktop.md), 2026-11-20). O app
  não manda mais `activate-tab` (que saiu do protocolo) e, ao exibir uma aba no
  terminal, manda `view-tab { tab }`, de novo a cada sessão nova, e
  `view-tab { tab: null }` ao fechar a tela; o desktop só marca a aba como vista.
  Sai a ação de fundo (`isBackgroundAction`). O desktop falso aceita `view-tab`.
  Tarball do protocolo regerado do commit `4ce7e4f`.

- **Ícone adaptativo do Android 25% menor**: as camadas `adaptive-foreground.png`
  e `adaptive-monochrome.png` (1024×1024) passam a ter a arte a 75% do tamanho,
  centralizada, para não encostar na máscara do ícone no lançador.

- **Folga da grade do terminal nas bordas do quadro:** tokens `grid.padding-x`
  (8, laterais) e `grid.padding-bottom` (16, embaixo; o `grid.padding-top` subiu de 4 para 12), propostos na
  [anatomia](docs/design/proposta-de-anatomia.md) §2.5 e **à espera do aval do
  dono**. O viewport da grade já os desconta, então "ajustar à largura" usa a
  largura útil; as barras de rolagem seguem rentes às bordas do quadro.
- **Especificação 0.4 do protocolo**
  ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)),
  com o fio ainda `[0, 1]`: a ação nova `activate-tab` (`activateTab` em
  `src/session/actions.ts`, 14 ações). Abrir uma aba no terminal do app a ativa
  na janela dela no desktop, uma vez por abertura e em silêncio na falha
  (`activateOnce` em `src/controllers/terminalSession.ts`); as ações ativam como
  o gesto local. O app nunca muda o painel focado nem a janela do sistema.
  `activate-tab` é ação de fundo (`isBackgroundAction`): não marca item como
  pendente, e falha ou perda na queda não viram aviso (`src/session/requests.ts`).
- **`vendor/porecatu-protocol-0.1.0.tgz` regerado** do repositório do protocolo
  para a 0.4, com o mesmo nome e a mesma versão do pacote; o `pnpm-lock.yaml`
  tem a integridade nova ([ADR-0004](docs/adr/0004-criptografia-em-js-puro.md)).
- **Aba fixada**: fechar manda a ação direto, e a única confirmação é a do
  desktop (`confirm-request`), que agora diz que a aba será desafixada (nota
  `confirm_close.pinned_note`); fixada sem processos vivos mostra só a nota e o
  prazo ([PRD-004](docs/prd/prd-004-gestao-de-abas.md)).
- **Adoção da sessão do pareamento** (RF-1.10): o workspace continua na sessão
  que o pareamento abriu, em vez de abrir conexão nova (`Lifecycle.adopt`,
  `SessionStore.startAdopted`, `SessionRegistry.openPaired`,
  `src/net/socketHandoff.ts`); as mensagens que chegam antes do `hello` são
  processadas, e a adoção fecha uma sessão viva do mesmo desktop.
- **`settings.v1` no esquema 2**, com `deviceName`, o nome do último pareamento
  concluído, que pré-preenche o próximo (RF-1.2). O nome do item não mudou: o
  esquema 1 é migrado na leitura, pelo campo `schema`
  ([ADR-0003](docs/adr/0003-chaves-no-armazenamento-seguro.md)).
- **`Esc` da barra de teclas** sai sem modificadores e deixa os armados para a
  próxima tecla (anatomia §4.8): `pressNamed(pane, key, { keepModifiers })` em
  `src/input/send.ts`. Texto do campo de captura com quebra de linha (colagem
  pela barra do próprio teclado) vai pelo fluxo de colar, com confirmação.

### Removido

- Os **botões flutuantes** da grade (`FloatingButtons`) e os tokens `fab`, `fab.gap`, `fab.inset`, `icon.fab`, `shadow.fab` e `opacity.fab`: as três opções foram para o menu da aba, e a grade ficou livre.
- O diálogo próprio de fechar aba fixada (chaves `tab_menu.close_pinned_title`
  e `tab_menu.close_pinned_body`), substituído pela confirmação do desktop.
- Chaves do catálogo que as telas não usaram, entre elas `paste.confirm_title`,
  `connection.attempt`, `connection.reconnecting_in.*`, `desktop_status.connected`,
  `desktop_status.last_attempt`, `desktop_status.offline` e
  `pairing.no_camera`.

### Documentação

- Docs reconciliados com o código: `seq` fora de sequência é erro de protocolo
  (PRD-003 RF-3.2 revisado), `last-tab` no PRD-004 (RF-4.11), plural escrito à
  mão (ADR-0005), Keystore sem `EncryptedSharedPreferences` (ADR-0003), CBOR do
  próprio pacote (ADR-0004), pnpm sem Corepack (ADR-0007), e as decisões do
  dono de 2026-11-16 registradas nos PRDs.
- [Anatomia das telas](docs/design/proposta-de-anatomia.md), escrita como
  proposta e **aprovada pelo dono em 2026-11-16** com as oito recomendações do
  §7 dela; as decisões do mesmo dia nos PRDs (RF-1.20, RF-2.8, RF-3.17) foram
  incorporadas ao texto, e "Este aparelho" passou para dentro de Configurações
  no mapa de telas da [arquitetura](docs/arquitetura.md).
- ADRs das peças que as telas pedem:
  [ADR-0008](docs/adr/0008-icones-lucide-em-svg.md) (ícones Lucide em SVG),
  [ADR-0009](docs/adr/0009-iosevka-fixed-embutida.md) (Iosevka Fixed recortada
  do desktop), [ADR-0010](docs/adr/0010-gestos-animacao-e-teclado.md) (Gesture
  Handler, Reanimated e Keyboard Controller) e
  [ADR-0011](docs/adr/0011-folhas-dialogos-e-avisos-proprios.md) (folhas,
  diálogos e avisos próprios, sem `Modal`).
- Docs reconciliados com as telas e a especificação 0.4 (2026-11-17): estado no
  [CLAUDE.md](CLAUDE.md) e no [README](README.md), princípio 3 reescrito (o app
  muda a aba ativa como o gesto local, nunca o painel focado nem a janela do
  sistema), novas armadilhas, mapa de módulos e rotas na
  [arquitetura](docs/arquitetura.md), notas de implementação nos ADRs e nos
  PRDs, e as escolhas da implementação que esperam o aval do dono listadas na
  [anatomia](docs/design/proposta-de-anatomia.md).
