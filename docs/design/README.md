# Design

**Ainda não há especificação visual do app.** Este diretório recebe, quando existirem, os tokens (cores, tipografia, espaçamentos e raios do chrome do app), a anatomia de cada tela e o histórico das decisões visuais.

Regras desde já:

- **Nenhuma tela é implementada sem aval visual do dono do produto.** O primeiro artefato deste diretório é a proposta de anatomia das telas do [mapa de telas](../arquitetura.md), para aprovação.
- **A grade do terminal usa o tema do desktop.** Fundo, frente, cursor, seleção, as 16 cores e a paleta de cores de grupo chegam pela mensagem `theme` ([mensagens §4.3](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)). O app não tem paleta de terminal própria.
- **A identidade segue a do Porecatu**: ícones da mesma família (Lucide), a mesma terminologia ("abas", grupos, fixadas), cores de grupo iguais às do desktop. O chrome do app (listas, barras, menus) segue o modo claro/escuro do sistema, com tokens próprios definidos aqui.
- **Nenhuma cor, dimensão ou espaçamento inventado no código**: todo valor do chrome sai dos tokens deste diretório, como no Porecatu ([especificação visual do desktop](https://github.com/porecatu/terminal/blob/main/docs/design/especificacao-visual.md)).
