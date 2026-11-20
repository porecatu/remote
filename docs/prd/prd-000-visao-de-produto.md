# PRD-000 — Visão de produto

**Status:** Aprovado
**Data:** 2026-11-15
**Requisito de origem:** pedido direto do dono do produto: acessar uma sessão do Porecatu remotamente por um app mobile, para criar abas, monitorar e interagir com abas em execução.
**Relacionados:** [PRD-001](prd-001-desktops-e-pareamento.md), [PRD-002](prd-002-navegacao-do-workspace.md), [PRD-003](prd-003-terminal.md), [PRD-004](prd-004-gestao-de-abas.md), [especificação do protocolo](https://github.com/porecatu/protocol/blob/main/docs/especificacao/00-visao-geral.md)

> O dono do produto decidiu, antes da escrita:
>
> - o app é feito em **Expo (React Native) com TypeScript**, um código para Android e iOS;
> - o relay é **cego** (criptografia ponta a ponta) e **auto-hospedado**, sem contas;
> - a tela chega como **grade do desktop**: o app não roda emulador de terminal;
> - **o desktop dita o tamanho** do terminal;
> - o escopo do v1 é **ver e digitar em abas, criar e fechar abas e organizar** (grupos, mover entre grupos e janelas); **notificações push ficam fora**;
> - um celular pareado acessa **tudo** no desktop, que mostra quando há celular conectado e permite revogar;
> - um mesmo celular pode ter **vários desktops** pareados;
> - **sem Porecatu aberto**, o desktop aparece offline: o app não acorda nem mantém o desktop vivo;
> - licença **GPL-3.0-or-later**, como o Porecatu.

## Problema

O Porecatu existe para quem tem quinze terminais abertos: servidores de desenvolvimento, watchers, builds longos, conexões SSH, organizados em grupos e janelas. Esse trabalho não para quando a pessoa sai de perto do computador — e é justamente aí que surgem as perguntas:

- O build terminou? Passou?
- O servidor caiu? Qual aba está com o indicador de campainha?
- Preciso só rodar `git pull && make deploy` naquela aba, e o computador está em casa.

Hoje a resposta é voltar ao computador, ou montar por conta própria um acesso remoto genérico (área de trabalho remota, SSH para a máquina e `tmux`), que não conhece a organização do Porecatu e obriga a reconstruir de memória "qual era a aba do projeto B".

## Proposta

Um app que mostra **o mesmo workspace do desktop** — as mesmas janelas, grupos, abas fixadas, abas e painéis, com os mesmos nomes e cores — e deixa ver e controlar cada aba com o dedo.

Três apostas:

1. **A organização viaja.** O valor do Porecatu é saber qual terminal é qual. O app herda isso: o usuário acha a aba pelo grupo e pelo nome, não por uma lista de PIDs.
2. **Seguro sem esforço.** Parear é ler um QR code e confirmar no desktop. Ninguém no caminho — nem quem opera o relay — lê o terminal.
3. **O desktop continua mandando.** O celular olha e age sem atrapalhar quem está no computador: não muda o tamanho do terminal, não mexe na rolagem, não muda o painel focado nem a janela do sistema. Como o gesto local, ele pode trocar a aba ativa de uma janela: abrir uma aba no app a ativa no desktop, e as ações ativam o que o gesto local ativaria.

   > **Revisão (2026-11-17, especificação 0.4):** a versão aprovada dizia "não rouba o foco". O dono decidiu que o celular pode mudar a aba ativa do desktop ([ADR-0010 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0010-aba-ativa-pelo-cliente.md)); o painel focado e a janela do sistema operacional continuam fora do alcance do app ([PRD-002](prd-002-navegacao-do-workspace.md), [PRD-003](prd-003-terminal.md) RF-3.26, [PRD-004](prd-004-gestao-de-abas.md)).

   > **Revisão (2026-11-20, especificação 0.5, implementada no mesmo dia):** o dono desfez a decisão de 2026-11-17 ([ADR-0011 do protocolo](https://github.com/porecatu/protocol/blob/main/docs/adr/0011-cliente-nao-muda-a-aba-ativa-e-view-tab.md), [ADR-0012](../adr/0012-abrir-aba-nao-muda-o-desktop.md)). O app **nunca** muda a aba ativa do desktop: `activate-tab` saiu do protocolo e as ações não ativam mais. Ao exibir uma aba no terminal, o app manda `view-tab`, e o desktop só marca a aba como vista na barra, sem mudar nada. Vale de novo o "não rouba o foco" da versão aprovada.

## Usuário-alvo

O usuário do Porecatu que deixa processos longos rodando e quer acompanhá-los e intervir de longe: do sofá, de outra sala, da rua. Tem (ou o time tem) um servidor onde rodar o relay.

**Não é para:** quem quer um cliente SSH genérico no celular (Termius, Blink e afins resolvem isso), nem quem quer programar no celular: o app é para **acompanhar e intervir**, não para substituir o desktop.

## Princípios

1. **O desktop é a fonte da verdade.** O app não guarda estado de workspace; tudo que mostra veio do desktop há instantes.
2. **Nada do que o app faz surpreende quem está no desktop.** Sem redimensionar, sem mudar o painel focado nem levantar a janela do sistema, e com um indicador visível no Porecatu enquanto o celular está conectado. A troca de aba ativa que o app faz é a mesma do gesto local (especificação 0.4, revisão acima). *(Desde a especificação 0.5, o app não troca mais a aba ativa: revisão de 2026-11-20 acima.)*
3. **Ver é barato, agir é deliberado.** Navegar e acompanhar é imediato; fechar uma aba com processo rodando pede confirmação, como no desktop.
4. **Nunca vazar.** Nada de conteúdo de terminal em log, em notificação, em captura do seletor de apps do sistema.
5. **Offline é um estado normal**, não um erro: o desktop desligado ou o Porecatu fechado aparecem como tal.

## Escopo do v1

| # | Recurso | PRD |
|---|---|---|
| 1 | Parear desktops e manter uma lista deles | [PRD-001](prd-001-desktops-e-pareamento.md) |
| 2 | Navegar o workspace ao vivo | [PRD-002](prd-002-navegacao-do-workspace.md) |
| 3 | Ver e digitar num terminal | [PRD-003](prd-003-terminal.md) |
| 4 | Criar, fechar e organizar abas e grupos | [PRD-004](prd-004-gestao-de-abas.md) |

## Não-objetivos do v1

Cada um destes é uma decisão, não um esquecimento.

- **Notificações push** (processo terminou, campainha). Exigiriam credenciais de APNs/FCM no relay auto-hospedado e um payload também cego; ficam para depois.
- **Responder perguntas do SSH** (senha, passphrase, chave do servidor desconhecida) pelo celular. São respondidas no desktop.
- **Abrir janela nova no desktop** ou destacar uma aba numa janela nova.
- **Fixar e desafixar abas, sessões nomeadas, configurações e gerenciador de tarefas** do Porecatu.
- **Redimensionar o terminal** para a tela do celular.
- **Mouse** dentro de aplicações de terminal (cliques em TUIs).
- **Seleção e cópia de texto da grade.** Desejável, mas fica para depois do v1 (é a primeira candidata).
- **Cliente web ou de desktop.** Só Android e iOS.
- **Conexão direta na rede local**, sem relay.
- **Tablet com layout próprio.** Funciona, com o layout do celular.

## Métricas de sucesso

| Métrica | Alvo |
|---|---|
| Do toque no desktop da lista até ver o workspace | < 2 s numa rede 4G razoável |
| Da saída no desktop até o pixel no celular | < 300 ms com o relay na mesma região |
| Quadros por segundo rolando uma grade 200×60 num Android intermediário | ≥ 50 |
| Parear um aparelho novo, do QR à confirmação | < 30 s, sem digitar nada além do nome do aparelho |
| Conteúdo de terminal em log, notificação ou captura do seletor de apps | zero |

## Riscos de produto

| Risco | Mitigação |
|---|---|
| Grade larga do desktop ficar ilegível no celular | Zoom por pinça, rolagem horizontal, enquadramento no cursor ([PRD-003](prd-003-terminal.md)) |
| Rodar um relay ser barreira de entrada | Documentação de implantação no [Porecatu Relay](https://github.com/porecatu/relay) com Docker; o público-alvo é técnico |
| Celular perdido desbloqueado dar acesso ao desktop | Bloqueio do app por biometria, ligado por padrão ([PRD-001](prd-001-desktops-e-pareamento.md)); revogação no desktop |
| Atrito da GPL com a App Store | Risco aceito e registrado no [ADR-0006](../adr/0006-licenca-gpl-e-lojas.md) |
| Teclado virtual ruim para terminal | Barra de teclas especiais e modificadores com trava ([PRD-003](prd-003-terminal.md)) |
