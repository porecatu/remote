# Verificação contra o Porecatu real

`pnpm real-host` roda a lógica do app contra um **Porecatu desktop** e um **Porecatu Relay** de verdade, nesta máquina, sem aparelho. O app entra montado como em produção, só sem as telas: `createServices` (por `createTestServices`, com relógio, agendador, WebSocket e HTTP reais), o controlador de pareamento das telas de pareamento, o de desktops, o store da sessão e o controlador do terminal. Só o armazenamento seguro fica em memória, carregado de `app-state.json` e gravado de volta, para as rodadas seguintes reaproveitarem o pareamento.

Não faz parte do `pnpm test`: precisa dos dois processos rodando e, na primeira vez, de alguém para clicar em **Parear** no desktop. O relatório sai na saída padrão e em `report.json`, só com passos e ids, nunca conteúdo de tela.

O resultado da última verificação está no [roadmap](../../docs/roadmap.md), na dívida "Contra um Porecatu real".

## O que exercita

- **Pareamento** pela URI do QR (`XX` com o token de uso único), confirmação no desktop e a sessão adotada (RF-1.10); nas rodadas seguintes, conexão `IK` pelo desktop salvo, mesmo depois de o desktop reiniciar.
- **Sessão**: `welcome`, `theme`, `profiles` e o `workspace` restaurado; presença (`GET /v0/presence`); sair e voltar com o mesmo `host_instance`.
- **Terminal**: assinatura e `grid-ack`, texto, Enter, colar, `Ctrl` da barra + `c`, uma página de scrollback e a campainha.
- **As ações** (14 na especificação 0.4; 13 desde a 0.5, sem `activate-tab`, com abrir uma aba conferido como **não** mudando o `active`), cada uma conferida no `workspace` seguinte, e o `focused` de toda aba intacto depois de cada uma. Também `confirm-request` recusado (`cancelled`) e aceito, e os códigos `invalid-argument`, `unknown-tab`, `unknown-profile` e `unknown-group`.
- **Nenhuma janela do sistema levantada** (só no Windows): a janela em primeiro plano é a mesma antes e depois de mover aba e grupo para outra janela e de ativar uma aba na janela de trás.

Fica de fora: aba fixada, `last-tab`, `busy`, SSH (`connecting`, `awaiting-desktop`) e `too-many-subscriptions`.

## Preparar

Num diretório de trabalho **fora do repositório** (o `PORECATU_REAL_HOST_DIR`), copie os três arquivos de [`fixtures/`](fixtures/):

| Arquivo | Para quê |
|---|---|
| `session.seed.json` | Sessão do desktop de teste: duas janelas, o grupo "Build", uma aba dividida e abas que restauram "não iniciadas". Copie para `session/session.json` **antes de cada rodada**: o desktop a regrava e o teste a muda |
| `porecatu.toml` | Configuração do desktop de teste: acesso remoto ligado em `ws://127.0.0.1:8790`, `lazy_restore` e `ctrl+shift+f12` para `remote.pair` |
| `relay.toml` | Relay em `127.0.0.1:8790`, lendo o token do arquivo `token` ao lado |

O **token**: o Porecatu guarda identidade e token no cofre do sistema (serviço `porecatu-remote`), **o mesmo para todas as instâncias**. O desktop de teste usa, portanto, o token do Porecatu de uso, e o relay local precisa aceitá-lo: grave-o em `token` (sem quebra de linha) e apague o arquivo no fim. A identidade também é a mesma, o que não causa disputa porque o relay é outro. A lista de aparelhos pareados (`remote_devices.json`) fica ao lado do `session.json`, então o aparelho de teste não entra na lista do Porecatu de uso.

## Rodar

1. O relay, pelo repositório dele: `cargo run -- --config <dir>/relay.toml` (ou o binário já compilado).
2. O desktop de teste, com `PORECATU_SESSION=<dir>/session/session.json` e `porecatu --config <dir>/porecatu.toml`. Se o Porecatu de uso roda do mesmo `target/`, compile o de teste noutro `--target-dir`. Confira no log do relay o `host registered`.
3. Primeira vez: na janela do desktop de teste, `Ctrl+Shift+F12` e **Copiar link de pareamento**; grave o link em `<dir>/pairing-uri.txt` (ou em `PORECATU_PAIRING_URI`).
4. `PORECATU_REAL_HOST_DIR=<dir> PORECATU_DESKTOP_PID=<pid do desktop de teste> pnpm real-host`. Na primeira vez o teste imprime a impressão digital do aparelho (também em `fingerprint.txt`): confira no diálogo do desktop e clique em **Parear**, em até 120 s.

O teste muda o workspace do desktop de teste (abre, move, renomeia e fecha abas e grupos, digita no shell). Para rodar de novo, feche o desktop de teste, copie outra vez o `session.seed.json` e abra-o. O `app-state.json` guarda a chave do aparelho de teste; apagá-lo pede um pareamento novo.
