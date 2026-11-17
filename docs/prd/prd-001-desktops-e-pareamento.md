# PRD-001 — Desktops e pareamento

**Status:** Aprovado
**Data:** 2026-11-15
**Relacionados:** [PRD-000](prd-000-visao-de-produto.md), [ADR-0003](../adr/0003-chaves-no-armazenamento-seguro.md), [ADR-0004](../adr/0004-criptografia-em-js-puro.md), [ADR-0005](../adr/0005-catalogo-de-textos-e-idiomas.md), [handshake e pareamento](https://github.com/porecatu/protocol/blob/main/docs/especificacao/02-handshake-e-pareamento.md), [modelo de ameaça](https://github.com/porecatu/protocol/blob/main/docs/especificacao/modelo-de-ameaca.md)

## Problema

Antes de qualquer coisa, o celular precisa saber **qual desktop** acessar, **por qual relay**, e os dois precisam se reconhecer sem contas nem senhas. O pareamento é o único momento em que a confiança é estabelecida: se ele for fraco, todo o resto é. E, como um usuário pode ter o Porecatu em mais de um computador (casa e trabalho), o app guarda uma lista.

## O que já existe e não muda

- O **QR code** é gerado pelo Porecatu desktop, na tela de configurações, por gesto local; ele carrega URL do relay, `host_id`, chave pública do desktop, token de uso único (5 minutos) e nome do desktop ([handshake §3.1](https://github.com/porecatu/protocol/blob/main/docs/especificacao/02-handshake-e-pareamento.md)).
- A **confirmação** do pareamento acontece no desktop, que mostra nome e impressão digital do aparelho.
- A **revogação** de um aparelho é feita no desktop.

## Requisitos

### Identidade do aparelho

- **RF-1.1** Na primeira execução, o app gera o par de chaves estáticas X25519 do aparelho e guarda a privada no armazenamento seguro do sistema ([ADR-0003](../adr/0003-chaves-no-armazenamento-seguro.md)). A chave nunca sai do aparelho e nunca aparece na interface.
- **RF-1.2** O app mostra, numa tela de "Sobre este aparelho", a **impressão digital** da chave do aparelho no formato da spec (`ABCD EFGH IJKL MNOP`) e o nome do aparelho.

  > **Decidido pelo dono em 2026-11-16:** o nome do aparelho é o **do último pareamento concluído**. As configurações (`settings.v1`) passam ao esquema 2, com o campo `deviceName` (até 64 bytes em UTF-8, a regra do pareamento); o esquema 1 é migrado na leitura, com `deviceName: null`, e o nome do item no armazenamento não muda. O nome guardado pré-preenche o próximo pareamento (RF-1.7). Antes do primeiro pareamento, a tela e o pré-preenchimento usam o modelo do aparelho (`expo-device`); sem nome guardado e sem modelo, o bloco do nome some da tela. A tela se chama "Este aparelho" e fica dentro de Configurações ([anatomia](../design/proposta-de-anatomia.md) §4.4.2 e §7, item 8). Implementado em `src/storage/settings.ts` e `src/controllers/pairing.ts`.
- **RF-1.3** O usuário pode **recriar a identidade do aparelho**, com confirmação que avisa que todos os pareamentos serão perdidos; o app apaga a chave e a lista de desktops.

### Parear

- **RF-1.4** O app oferece "Parear desktop", que abre a câmera dentro do app e lê o QR. Sem permissão de câmera, o app explica por que precisa dela e leva às configurações do sistema; não há alternativa de digitar código no v1.
- **RF-1.5** Ler o QR com a **câmera do sistema** abre o app pelo *deep link* `porecatu://pair` e cai no mesmo fluxo do RF-1.6.
- **RF-1.6** Lido o QR, o app valida a URI: versão maior igual à sua (`v`), relay `wss://` (ou `ws://` só para `localhost`), todos os campos presentes. URI inválida mostra o motivo (versão incompatível, relay inseguro, QR que não é do Porecatu) e não conecta.
- **RF-1.7** Antes de conectar, o app pede o **nome deste aparelho** (pré-preenchido com o modelo, até 64 caracteres) e mostra o nome do desktop que veio no QR.
- **RF-1.8** O app conecta ao relay, faz o handshake `XX` e **confere a chave do desktop contra a do QR**. Diferente: aborta, sem mandar nada, e mostra um erro de identidade que diz claramente que o desktop não é quem o QR dizia ser.
- **RF-1.9** Enquanto o desktop pede confirmação, o app mostra a **impressão digital deste aparelho** com a instrução de compará-la com a que aparece no desktop, e um indicador de espera de até 120 s.
- **RF-1.10** Resultado: `pair-accepted` → o desktop entra na lista com o nome que veio do desktop, e o app abre o workspace dele na mesma sessão; `pair-rejected` → mensagem pelo motivo (`token-invalid`: "o QR expirou ou já foi usado, gere outro"; `user-declined`; `timeout`), e nada é gravado.

  > **Decidido pelo dono em 2026-11-16:** "na mesma sessão" quer dizer o **mesmo canal**: o ciclo da conexão **adota** a sessão que o pareamento abriu e manda o `hello` nela ([handshake §3.2](https://github.com/porecatu/protocol/blob/main/docs/especificacao/02-handshake-e-pareamento.md), item 5), em vez de abrir uma conexão nova. O que o desktop mandar entre o `pair-accepted` e a adoção é guardado e processado antes do `hello`; adotar fecha a sessão viva que já houver para o mesmo desktop. Se o canal cair antes de o desktop ser gravado, o app abre o workspace pelo caminho normal. Implementado em `src/session/lifecycle.ts` (`adopt`), `src/session/sessionStore.ts` (`startAdopted`), `src/session/registry.ts` (`openPaired`), `src/net/socketHandoff.ts` e `src/controllers/pairing.ts`.
- **RF-1.11** Parear de novo um desktop já presente na lista (mesma chave pública) **substitui** a entrada, sem duplicar.

### Lista de desktops

- **RF-1.12** A tela inicial é a **lista de desktops pareados**, cada um com nome, relay (só o host da URL) e o estado da **última tentativa de conexão**, com a hora dela: **conectado**, **offline** (`host-unavailable`), **conectando**, **erro** (relay inalcançável, versão incompatível) ou **não pareado** (o desktop respondeu `not-paired` — revogado ou identidade recriada).
- **RF-1.13** Com a lista na tela, o app consulta a **presença** de cada desktop pela consulta HTTPS do relay (`GET /v0/presence/<host_id>`, [01 §2](https://github.com/porecatu/protocol/blob/main/docs/especificacao/01-transporte-e-relay.md)), ao abrir a lista, ao puxar para atualizar e a cada 30 s enquanto a lista está visível, e mostra **online**/**offline** sem abrir canal. Fora da lista, e com o app em segundo plano, não consulta nada. O app **nunca** abre um canal só para sondar: isso dispararia um canal e um prazo de handshake no desktop. O app não mantém conexão com desktops que não estão abertos.
- **RF-1.14** Tocar num desktop online abre o workspace dele ([PRD-002](prd-002-navegacao-do-workspace.md)). Tocar num offline mostra o estado e tenta de novo.
- **RF-1.15** O usuário pode **renomear** um desktop na lista (só local, não muda nada no desktop) e **removê-lo** (apaga a chave pública guardada e o endereço; o desktop só deixa de listar o aparelho quando o usuário o revogar lá, e o app diz isso ao remover).
- **RF-1.16** Um desktop marcado como "não pareado" oferece só **parear de novo** e **remover**.

### Bloqueio do app

- **RF-1.17** O app tem **bloqueio por biometria** (ou pelo código do aparelho, quando não há biometria), **ligado por padrão**. Ao abrir o app e ao voltar do segundo plano depois de 1 minuto, o app pede o desbloqueio antes de mostrar qualquer desktop.
- **RF-1.18** O bloqueio pode ser desligado nas configurações do app, com o desbloqueio exigido para desligar.
- **RF-1.19** Enquanto o app está no seletor de apps do sistema, a tela fica **coberta** (nada de grade na miniatura); no Android, a tela do terminal usa `FLAG_SECURE`.
- **RF-1.20** **Aparelho sem senha nem biometria**: com o bloqueio ligado e um aparelho que não consegue autenticar (nenhuma biometria e nenhum código de bloqueio configurado), o app abre **sem bloqueio** e mostra um **aviso permanente** de que não pode ser bloqueado, até o usuário configurar um bloqueio no sistema. Nesse estado, desligar o bloqueio nas configurações não pede autenticação (não há o que pedir).

  > **Decidido pelo dono em 2026-11-16.** O app nunca tranca o usuário fora do próprio app. Implementado na máquina de estados `src/security/appLock.ts` (estado `unavailable`, `hasPersistentWarning`); o texto do aviso é a chave `app_lock.unavailable_warning` do catálogo.

**Por que ligado por padrão:** o [modelo de ameaça](https://github.com/porecatu/protocol/blob/main/docs/especificacao/modelo-de-ameaca.md) aceita que um celular desbloqueado nas mãos erradas tem acesso total ao desktop até a revogação, e não há permissão por aparelho no v1. O app é, na prática, uma chave para executar comandos no computador do usuário: a fricção de um toque de biometria é pequena perto disso. Quem não quer, desliga.

## Implementação (2026-11-17)

As telas seguem a [anatomia](../design/proposta-de-anatomia.md) (§4.1 a §4.4). Tudo abaixo está implementado e coberto por testes automatizados em Node (`jest-expo` e `@testing-library/react-native`); **nada foi rodado num aparelho**, e nenhum requisito está verificado no sentido do [roadmap](../roadmap.md).

| Requisitos | Onde |
|---|---|
| RF-1.1 a RF-1.3 | identidade em `src/storage/deviceIdentity.ts`, garantida na partida dos serviços (`ui/services/createServices.ts`); tela "Este aparelho" em `app/settings/device.tsx` e `ui/screens/settings/` (`DeviceScreen`, `RecreateIdentityDialog`, `fingerprintSpeech.ts`) |
| RF-1.4 a RF-1.11 | rotas `app/pair/` (permissão e câmera, nome, espera); telas em `ui/screens/pairing/`; controlador `src/controllers/pairing.ts` sobre o fluxo puro `src/pairing/pairingFlow.ts` |
| RF-1.5 | `ui/root/DeepLinkBridge.tsx`, `ui/root/nativeIntent.ts` (reexportado por `app/+native-intent.tsx`) e `src/controllers/appShell.ts` |
| RF-1.12 a RF-1.16 | `app/index.tsx`, `ui/screens/desktops/` e o controlador `src/controllers/desktops.ts` |
| RF-1.17 a RF-1.20 | `src/controllers/appShell.ts` sobre `src/security/appLock.ts`; `ui/root/` (`AppRoot`, `LockScreen`, `PrivacyCover`); interruptor em `ui/screens/settings/SettingsScreen.tsx`; `FLAG_SECURE` pelo `expo-screen-capture` na tela do terminal |

Decisões tomadas na implementação, além das do RF-1.2 e do RF-1.10:

- **Deep link (RF-1.5).** A URI de pareamento nunca vira parâmetro de rota: numa partida a frio o app vai para `/`, e com o app aberto fica onde está; o controlador guarda o link enquanto o app está bloqueado e o entrega uma vez, ao aparecer o conteúdo.
- **Câmera (RF-1.4).** O `expo-camera` não distingue câmera ocupada de câmera ausente fora da web: a falha ao abrir mostra sempre o texto de câmera ocupada.
- **Resultados do pareamento (RF-1.10).** Antes de o desktop receber o pedido, o botão é "Tentar de novo"; depois, "Ler outro código"; erro de protocolo e lista cheia só têm "Fechar". "Relay inalcançável" é o `timeout` ou a queda da conexão ainda em `connecting`.
- **Lista (RF-1.12 a RF-1.14).** O estado da linha dá precedência ao erro sobre a presença (`rowStatus`). Tocar numa linha em erro abre o workspace (a [anatomia](../design/proposta-de-anatomia.md) só fixava online e offline); tocar numa offline tenta no lugar e navega quando o desktop responde. A faixa do RF-1.20 usa o ícone `shield-alert`.
- **Bloqueio (RF-1.17 a RF-1.19).** O navegador só monta depois do primeiro desbloqueio: nenhuma lista nem consulta de presença antes dele. Ao voltar do segundo plano, as sessões reconectam por trás da tela de bloqueio. Falha permanente do módulo de autenticação deixa o usuário na tela de bloqueio (o lado seguro); falha ao ler o armazenamento seguro na partida deixa só o fundo neutro. Sem ícone do app ainda, a tela de bloqueio e a cobertura mostram o fundo `bg.base` (a de bloqueio, com o nome e "Bloqueado").
- **Recriar identidade (RF-1.3).** Desbloqueio cancelado antes do diálogo não mostra aviso.

O que depende de aparelho (câmera fora de foco, lanterna, a pilha de navegação real ao entrar pelo link, o teclado na tela do nome, biometria, cobertura no seletor de apps e `FLAG_SECURE`) está na dívida de verificação do [roadmap](../roadmap.md).

## Fora de escopo

- Código digitado no lugar do QR (exigiria um PAKE; ver a spec).
- Sincronizar a lista de desktops entre aparelhos ou fazer backup dela: cada aparelho pareia por si.
- Permissões por aparelho (somente leitura).
- Despareamento iniciado pelo app que avise o desktop.

## Riscos

| Risco | Mitigação |
|---|---|
| Usuário confirmar no desktop sem comparar a impressão digital | O desktop mostra também o nome digitado no aparelho; o QR vive 5 min e é de uso único |
| Câmera ruim não ler o QR em tela de monitor | Ajuste de foco e brilho do `expo-camera`; o QR do desktop tem tamanho mínimo definido do lado do Porecatu |
| Perda do celular apagar o acesso | Reparear é barato; a lista não é dado precioso |
