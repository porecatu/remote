# PRD-002 — Navegação do workspace

**Status:** Aprovado
**Data:** 2026-11-15
**Relacionados:** [PRD-000](prd-000-visao-de-produto.md), [PRD-001](prd-001-desktops-e-pareamento.md), [PRD-003](prd-003-terminal.md), [PRD-004](prd-004-gestao-de-abas.md), [ADR-0005](../adr/0005-catalogo-de-textos-e-idiomas.md), [mensagens §2–§4](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)

## Problema

O desktop tem várias janelas, cada uma com abas fixadas, grupos coloridos (às vezes colapsados) e abas soltas, e cada aba pode estar dividida em painéis. No computador, tudo isso cabe numa barra de abas por janela. No celular, a mesma informação precisa caber numa coluna estreita, e o usuário precisa achar **a aba do projeto B** em dois toques.

## O que já existe e não muda

- O desktop manda a **árvore inteira** do workspace a cada mudança, até 4 vezes por segundo (`workspace`), mais `profiles` e `theme` no início da sessão ([mensagens §4](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)).
- Os ids do protocolo são estáveis quando uma aba ou grupo muda de janela, e **reiniciam** quando o Porecatu reinicia.
- O app **nunca** muda o foco nem a aba ativa do desktop.

## Requisitos

### Sessão

- **RF-2.1** Ao abrir um desktop, o app conecta, faz o handshake `IK`, manda `hello` e espera `welcome`, `theme`, `profiles` e `workspace` antes de mostrar a árvore. Até lá, mostra o nome do desktop e um indicador de conexão.
- **RF-2.2** `incompatible` mostra qual lado precisa ser atualizado (comparando a versão do app com a do desktop) e volta à lista.
- **RF-2.3** `error { not-paired }` e `goodbye { revoked }` marcam o desktop como "não pareado" na lista ([PRD-001](prd-001-desktops-e-pareamento.md) RF-1.16) e voltam a ela com a explicação.
- **RF-2.4** `goodbye { remote-disabled }` e `goodbye { host-quitting }` voltam à lista com o desktop como offline e o motivo; queda de conexão sem `goodbye` tenta **reconectar sozinho** (1, 2, 4, 8 e 16 s), mostrando o estado no topo da tela sem tirar o usuário de onde está. Esgotadas as tentativas, oferece tentar de novo.
- **RF-2.5** Voltar do segundo plano reconecta se o sistema derrubou a conexão, e reconstrói tudo a partir do `workspace` novo e de novos `grid-snapshot` — nada do estado anterior é considerado válido.

### A árvore

- **RF-2.6** A tela do workspace lista as **janelas** do desktop na ordem em que vêm (mais recente primeiro). Com uma janela só, a lista de janelas não aparece e o conteúdo dela ocupa a tela.
- **RF-2.7** Dentro de cada janela, na ordem do desktop: **abas fixadas** primeiro, depois a trilha — **grupos** (nome, cor do grupo pela paleta `group_colors` do `theme`, contagem de abas) e **abas soltas**.
- **RF-2.8** Um grupo **colapsado no desktop** aparece colapsado no app; o usuário pode expandi-lo **só no app** (não muda o desktop). Colapsar e expandir no desktop é ação ([PRD-004](prd-004-gestao-de-abas.md)).

  > **Decidido pelo dono em 2026-11-16:** a vista local só **abre**. Um grupo colapsado no desktop pode ser expandido só no app; um grupo **aberto** no desktop **não** pode ser colapsado só no app (para colapsar, só a ação `collapse-group`). A expansão local vale enquanto o grupo continuar colapsado no desktop e para o mesmo `host_instance`: se o desktop abre o grupo, ou se o Porecatu reinicia, ela é descartada; nunca é gravada. Implementado em `src/workspace/expansion.ts` e lido por `src/workspace/selectors.ts`.
- **RF-2.9** Cada aba mostra: título (como no desktop), `usuário@host` em aba SSH, badge do perfil quando não é o padrão, indicador de **atividade**, indicador de **campainha**, estado derivado do painel focado (`running`, `exited` com o código, `not-started`, `connecting`, `reconnecting`, `disconnected`, `awaiting-desktop`) e um marcador discreto para a **aba ativa** da janela no desktop.
- **RF-2.10** Aba com mais de um painel mostra a contagem; tocar nela abre o **painel focado** daquela aba no desktop, e o usuário troca de painel por um seletor que desenha a disposição dos painéis (`layout`) em miniatura.
- **RF-2.11** As mudanças chegam ao vivo: aba nova aparece, aba fechada some, título e indicadores mudam, sem o usuário perder a posição da rolagem. Se a aba que o usuário está vendo deixa de existir, o app volta à árvore e diz por quê.
- **RF-2.12** **Busca**: um campo no topo filtra abas por título, nome de grupo, `cwd` e `usuário@host`, em todas as janelas.

### Tema

- **RF-2.13** Grade, indicadores e cores de grupo usam o `theme` do desktop, atualizado ao vivo quando o desktop troca de tema. O chrome do app (listas, barras) segue o modo claro/escuro do sistema, com tokens próprios definidos em `docs/design/`.

## Fora de escopo

- Mudar a aba ativa ou o foco do desktop.
- Reordenar abas por arraste (o v1 move por menu, [PRD-004](prd-004-gestao-de-abas.md)).
- Mostrar o gerenciador de tarefas ou a barra de status do desktop.

## Riscos

| Risco | Mitigação |
|---|---|
| Árvore grande (dezenas de abas, várias janelas) ficar difícil de percorrer | Busca (RF-2.12), grupos colapsáveis, janelas recolhíveis |
| `workspace` frequente (títulos que mudam a cada prompt) custar bateria | O desktop já limita a 4/s; o app compara por id e só re-renderiza linhas que mudaram |
