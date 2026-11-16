# PRD-004 — Gestão de abas

**Status:** Aprovado
**Data:** 2026-11-15
**Relacionados:** [PRD-000](prd-000-visao-de-produto.md), [PRD-002](prd-002-navegacao-do-workspace.md), [PRD-003](prd-003-terminal.md), [mensagens §7](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)

## Problema

Acompanhar não basta: o usuário quer **abrir uma aba** para rodar um comando, **fechar** a que terminou e **arrumar** o workspace — tirar a aba do grupo errado, mandar um grupo para a outra janela — sem esperar voltar ao computador. Cada uma dessas ações já existe no desktop, com regras próprias (onde a aba nova nasce, quando fechar pede confirmação). O app não inventa regra: pede, e o desktop executa pelo caminho do gesto local.

## O que já existe e não muda

- Toda ação é um `action` com `request-id`, respondido por `action-result` (sucesso, com `created` quando cria algo, ou `error-code`).
- O desktop **não muda o foco** por causa de uma ação remota: aba criada pelo celular nasce sem roubar o foco de quem está no computador.
- Fechar com processo em primeiro plano ou com conexão SSH aberta gera `confirm-request` **para o celular que pediu**, respondido com `confirm`; sem resposta em 60 s, a ação expira.
- O app atualiza a árvore pelo `workspace` que vem depois da ação, **não** por conta própria: o resultado visível é sempre o estado do desktop.

## Requisitos

### Abas

- **RF-4.1** **Nova aba**: a partir de uma janela ou de um grupo, o usuário escolhe o **perfil** (lista de `profiles`, com o padrão marcado e no topo) e confirma. Sem grupo, a aba nasce onde o `tab.new` do desktop a criaria; com grupo, no fim dele. Criada, o app abre a aba nova (pelo `created`) — no app, não no desktop.
- **RF-4.2** **Fechar aba** e **fechar painel**: pedem a ação direto. Se vier `confirm-request`, o app mostra um diálogo com o motivo (processo rodando ou conexão SSH aberta) e a lista de processos, com **Fechar** e **Cancelar**; a resposta vai como `confirm`. O diálogo some sozinho ao expirar, com o aviso de que nada foi fechado.
- **RF-4.3** **Renomear aba**: campo com o título atual; salvar manda `rename-tab` com o título, e **Restaurar título automático** manda `null` (só aparece quando `custom = true`).
- **RF-4.4** **Mover para grupo**: lista os grupos da mesma janela e "Sem grupo"; manda `move-tab-to-group`.
- **RF-4.5** **Mover para janela**: lista as outras janelas do desktop (identificadas pela aba ativa de cada uma, como o "Mover para janela…" do desktop); manda `move-tab-to-window`. Não há "janela nova" no v1.
- **RF-4.6** As ações de aba ficam num **menu da aba**, aberto por toque longo na árvore e por um botão na tela do terminal. Abas fixadas mostram só **Fechar** e **Renomear**; fixar e desafixar não existem no v1.

### Grupos

- **RF-4.7** **Novo grupo**: a partir do menu de uma aba ("Novo grupo com esta aba"), com nome e cor escolhida da paleta `group_colors` do `theme`; manda `new-group`.
- **RF-4.8** No menu de um grupo: **Renomear** (`rename-group`), **Cor** (`set-group-color`, mesma paleta), **Colapsar/Expandir no desktop** (`collapse-group`), **Mover para janela** (`move-group-to-window`) e **Desfazer grupo** (`ungroup`, com confirmação no app porque o gesto é difícil de reverter).

### Resultado e erros

- **RF-4.9** Enquanto a ação não tem `action-result`, o item afetado mostra um indicador de pendência e não aceita outra ação.
- **RF-4.10** Erros viram mensagens do catálogo pelo código: `unknown-*` ("isso não existe mais no desktop", e a árvore é atualizada), `busy` ("o desktop está com um diálogo aberto; tente de novo"), `confirm-timeout`, `cancelled` (sem mensagem: o próprio usuário cancelou), `unknown-profile`, `invalid-argument` e `unsupported` (mensagem genérica com o código, para relatório).
- **RF-4.11** **Última aba**: fechar a última aba da última janela do desktop (por **Fechar aba**, ou por **Fechar painel** no último painel dela) é recusado pelo desktop com `last-tab` ([mensagens §7 e §9](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)), porque encerraria o Porecatu. O app mostra a mensagem do catálogo para esse código (a aba é a última do desktop e não pode ser fechada), não fecha nada e não trata a árvore como desatualizada. Como todo resultado de ação, a recusa chega em `action-result`, e o item deixa de estar pendente. Implementado: o código tem a chave `error.last-tab` nos dois idiomas (`src/i18n/protocolMessages.ts`) e é classificado como falha visível, sem `staleTree`, em `src/session/requests.ts`.

## Fora de escopo

- Fixar e desafixar, sessões nomeadas, destacar aba numa janela nova, abrir janela nova.
- Reordenar abas e grupos por arraste dentro da trilha.
- Seleção múltipla de abas.
- Mudar a aba ativa ou o foco do desktop.

## Riscos

| Risco | Mitigação |
|---|---|
| Usuário fechar sem querer uma aba com trabalho no desktop | O desktop pede confirmação quando há processo; o app ainda não fecha nada por gesto de deslizar no v1 |
| Ação remota surpreender quem está no desktop | Regras do desktop: não rouba foco, e o indicador de celular conectado está visível lá |
