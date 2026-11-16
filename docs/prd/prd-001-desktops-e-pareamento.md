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
- **RF-1.3** O usuário pode **recriar a identidade do aparelho**, com confirmação que avisa que todos os pareamentos serão perdidos; o app apaga a chave e a lista de desktops.

### Parear

- **RF-1.4** O app oferece "Parear desktop", que abre a câmera dentro do app e lê o QR. Sem permissão de câmera, o app explica por que precisa dela e leva às configurações do sistema; não há alternativa de digitar código no v1.
- **RF-1.5** Ler o QR com a **câmera do sistema** abre o app pelo *deep link* `porecatu://pair` e cai no mesmo fluxo do RF-1.6.
- **RF-1.6** Lido o QR, o app valida a URI: versão maior igual à sua (`v`), relay `wss://` (ou `ws://` só para `localhost`), todos os campos presentes. URI inválida mostra o motivo (versão incompatível, relay inseguro, QR que não é do Porecatu) e não conecta.
- **RF-1.7** Antes de conectar, o app pede o **nome deste aparelho** (pré-preenchido com o modelo, até 64 caracteres) e mostra o nome do desktop que veio no QR.
- **RF-1.8** O app conecta ao relay, faz o handshake `XX` e **confere a chave do desktop contra a do QR**. Diferente: aborta, sem mandar nada, e mostra um erro de identidade que diz claramente que o desktop não é quem o QR dizia ser.
- **RF-1.9** Enquanto o desktop pede confirmação, o app mostra a **impressão digital deste aparelho** com a instrução de compará-la com a que aparece no desktop, e um indicador de espera de até 120 s.
- **RF-1.10** Resultado: `pair-accepted` → o desktop entra na lista com o nome que veio do desktop, e o app abre o workspace dele na mesma sessão; `pair-rejected` → mensagem pelo motivo (`token-invalid`: "o QR expirou ou já foi usado, gere outro"; `user-declined`; `timeout`), e nada é gravado.
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
