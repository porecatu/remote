# Porecatu Remote

App mobile (Android e iOS) para acessar uma sessão viva do [Porecatu](https://github.com/porecatu/terminal) — o emulador de terminal de desktop focado em gestão de muitos terminais — a partir do celular.

Com o Porecatu Remote você:

- vê as janelas, grupos, abas fixadas, abas e painéis do seu desktop, ao vivo;
- abre uma aba e acompanha a saída dela em tempo real, com zoom e rolagem do histórico;
- digita na aba, com uma barra de teclas especiais (`Ctrl`, `Alt`, `Esc`, `Tab`, setas, `F1`–`F12`);
- cria e fecha abas, renomeia, move entre grupos e entre janelas, cria e organiza grupos.

> **Estado:** só documentação. Nenhum código existe ainda. O caminho até a primeira versão está no [roadmap](docs/roadmap.md).

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

O protocolo entre as partes está especificado no repositório [porecatu/protocol](https://github.com/porecatu/protocol).

## Documentação

- [Visão de produto](docs/prd/prd-000-visao-de-produto.md) e os demais [PRDs](docs/prd/)
- [Arquitetura](docs/arquitetura.md)
- [Decisões arquiteturais (ADRs)](docs/adr/0000-template.md)
- [Roadmap](docs/roadmap.md)
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
