# Design

Este diretório guarda a especificação visual do app: os tokens (cores, tipografia, espaçamentos e raios do chrome do app), a anatomia de cada tela e o histórico das decisões visuais.

**Anatomia das telas:** [proposta-de-anatomia.md](proposta-de-anatomia.md) reúne a anatomia, os gestos, os textos e os tokens de cada tela do [mapa de telas](../arquitetura.md). Foi **aprovada pelo dono do produto em 2026-11-16**, com as oito recomendações do §7 dela, e é a referência das telas. O nome do arquivo ficou o da proposta, para não quebrar os links.

**Estado (2026-11-17):**

- **Implementada.** Todas as telas da anatomia existem no código (`app/` e `ui/`, com os tokens em `ui/theme/`), cobertas por testes automatizados em Node; **nenhuma foi vista num aparelho**, e a conferência visual em aparelho é dívida de verificação do [roadmap](../roadmap.md).
- **Revisada pela especificação 0.4 do protocolo** ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)), com o aval do dono: abrir uma aba no app a ativa no desktop, o painel focado nunca muda, e o diálogo próprio de fechar aba fixada saiu (a nota de desafixar está no diálogo de confirmação do desktop). As mudanças estão marcadas no texto com a data.
- **Escolhas a confirmar.** Onde a anatomia não fixava um valor ou um comportamento, o código escolheu um, e cada escolha está no §9.2 da anatomia, por tela, à espera do aval do dono; o §2.10 lista os valores que o código usa sem token. O que ele aprovar entra no corpo da anatomia; o que recusar volta ao código.

Regras:

- **Nenhuma tela sem aval visual do dono do produto.** As telas da anatomia têm o aval; tela nova, ou mudança visível numa tela aprovada, passa por ele antes de virar código, e a anatomia é atualizada junto.
- **A grade do terminal usa o tema do desktop.** Fundo, frente, cursor, seleção, as 16 cores e a paleta de cores de grupo chegam pela mensagem `theme` ([mensagens §4.3](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)). O app não tem paleta de terminal própria.
- **A identidade segue a do Porecatu**: ícones da mesma família, Lucide ([ADR-0008](../adr/0008-icones-lucide-em-svg.md)); a mesma Iosevka Fixed do desktop no mono ([ADR-0009](../adr/0009-iosevka-fixed-embutida.md)); a mesma terminologia ("abas", grupos, fixadas); cores de grupo iguais às do desktop. O chrome do app (listas, barras, menus) segue o modo claro/escuro do sistema, com os tokens da anatomia (§2).
- **Nenhuma cor, dimensão ou espaçamento inventado no código**: todo valor do chrome sai dos tokens da anatomia, como no Porecatu ([especificação visual do desktop](https://github.com/porecatu/terminal/blob/main/docs/design/especificacao-visual.md)). Valor que falte na anatomia é acrescentado a ela antes de entrar no código.
