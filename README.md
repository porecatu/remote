# Porecatu Remote

App mobile (Android e iOS) para acessar uma sessão viva do [Porecatu](https://github.com/porecatu/terminal) — o emulador de terminal de desktop focado em gestão de muitos terminais — a partir do celular.

O Porecatu Remote é feito para você:

- ver as janelas, grupos, abas fixadas, abas e painéis do seu desktop, ao vivo;
- abrir uma aba e acompanhar a saída dela em tempo real, com zoom e rolagem do histórico;
- digitar na aba, com uma barra de teclas especiais (`Ctrl`, `Alt`, `Esc`, `Tab`, setas, `F1`–`F12`);
- criar e fechar abas, renomear, mover entre grupos e entre janelas, criar e organizar grupos.

> **Estado:** em desenvolvimento, **nunca rodado num aparelho**. A lógica e as telas estão implementadas e testadas só em Node: lista de desktops, pareamento pelo QR ou por link, bloqueio do app e cobertura de privacidade, Configurações, a árvore do workspace com busca, o terminal com a grade desenhada em Skia, a barra de teclas e o colar, e os menus, folhas e confirmações da gestão de abas, nos idiomas `en_US` e `pt_BR`. Há um desktop falso para desenvolvimento (`pnpm fake-host`). Ainda não foi feito o *development build*, nem a medição do render em aparelho do [ADR-0002](docs/adr/0002-render-da-grade-com-skia.md); gestos, teclados, câmera e leitor de tela ainda não foram testados de verdade, e o app ainda não falou com um Porecatu real. O caminho até a primeira versão, e o que falta verificar, está no [roadmap](docs/roadmap.md); o que entrou, no [CHANGELOG](CHANGELOG.md).

## Como funciona

```
Porecatu desktop  <-- wss -->  Porecatu Relay  <-- wss -->  Porecatu Remote
   (host)                      (auto-hospedado,              (este app)
                                cego: só roteia)
          <------------- sessão Noise ponta a ponta ------------->
```

- O **desktop é a fonte da verdade**: o app nunca guarda o estado do workspace, só desenha o que o desktop manda e pede ações.
- O **relay é cego**: tudo que é terminal, tecla ou nome de aba viaja cifrado de ponta a ponta. Você hospeda o seu ([Porecatu Relay](https://github.com/porecatu/relay)).
- **Sem contas**: o celular se pareia com o desktop lendo um QR code na tela de configurações do Porecatu, e o desktop pede confirmação. Um mesmo celular pode ter vários desktops pareados.
- O **tamanho do terminal é o do desktop**: o app ajusta zoom e rola na horizontal, nunca redimensiona o terminal de quem está na frente do computador.
- **Abrir uma aba no celular a mostra também no desktop**, na janela dela, como se você a tivesse clicado lá; o app nunca muda o painel focado nem traz a janela do desktop para a frente.

O protocolo entre as partes está especificado no repositório [porecatu/protocol](https://github.com/porecatu/protocol).

## Desenvolvimento

Node 26.13.0 (`.nvmrc`) e pnpm 12.17.0:

```bash
pnpm install --frozen-lockfile
pnpm check        # typecheck, lint e testes
pnpm fake-host    # relay e desktop falsos em Node, com o QR de pareamento no terminal
```

O app roda só em *development build* (nunca no Expo Go); os comandos completos estão no [CLAUDE.md](CLAUDE.md).

## Documentação

- [Visão de produto](docs/prd/prd-000-visao-de-produto.md) e os demais [PRDs](docs/prd/)
- [Arquitetura](docs/arquitetura.md)
- [Decisões arquiteturais (ADRs)](docs/adr/0000-template.md)
- [Roadmap](docs/roadmap.md) e [CHANGELOG](CHANGELOG.md)
- [Design](docs/design/README.md)
- [Guia operacional para quem mexe no código](CLAUDE.md)

## Projetos relacionados

| Projeto | O que é |
|---|---|
| [porecatu/terminal](https://github.com/porecatu/terminal) | O Porecatu desktop (host) |
| [porecatu/relay](https://github.com/porecatu/relay) | O servidor de relay auto-hospedado |
| [porecatu/protocol](https://github.com/porecatu/protocol) | Especificação do protocolo e implementações de referência (Rust e TypeScript) |

## Licença

[GPL-3.0-or-later](LICENSE). Contribuições são aceitas sob o [DCO](CONTRIBUTING.md).
