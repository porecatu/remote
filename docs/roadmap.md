# Roadmap

Marcos de entrega do v1 do Porecatu Remote. Cada marco tem **critério de saída explícito**; enquanto ele não for atendido, o marco não terminou.

O app depende de duas outras peças que andam em paralelo, em repositórios próprios: o pacote `@porecatu/protocol` ([porecatu/protocol](https://github.com/porecatu/protocol)) e o acesso remoto no Porecatu desktop ([porecatu/terminal](https://github.com/porecatu/terminal)). As dependências estão marcadas em cada marco.

| Marco | Status |
|---|---|
| M0 — Documentação inicial | **em andamento** (este conjunto de documentos) |
| M1 — Spike de render e integração do protocolo | planejado |
| M2 — Pareamento e navegação (só leitura) | planejado |
| M3 — Terminal com input | planejado |
| M4 — Gestão de abas | planejado |
| M5 — Publicação nas lojas | planejado |

---

## M0 — Documentação inicial

PRD-000 a 004, ADR-0001 a 0007, arquitetura, CLAUDE.md, verificação de links.

**Critério de saída:** documentos revisados e aprovados pelo dono do produto; `python scripts/verify-docs.py` passa; cada RF que depende do protocolo cita a seção da spec que o sustenta.

## M1 — Spike de render e integração do protocolo

**Depende de:** `@porecatu/protocol` publicado com o cliente (envelope, Noise, CBOR) e o host de teste.

- Projeto Expo criado com a toolchain do [ADR-0007](adr/0007-toolchain-pinada.md), development build nos dois sistemas, CI com lint, `tsc --noEmit` e testes.
- Spike de render ([ADR-0002](adr/0002-render-da-grade-com-skia.md)): grade 200×60 sintética, rolagem, pinça e rajada de 30 diffs/s, medidos em build de release.
- Integração do pacote: conectar a um relay local e a um desktop falso em Node, receber `workspace` e uma grade, mandar `grid-ack`.
- Catálogo de textos com `en_US` e `pt_BR` e os testes de completude ([ADR-0005](adr/0005-catalogo-de-textos-e-idiomas.md)).

**Aparelhos de referência:** um Android intermediário (a definir no início do M1, com preço e ano registrados aqui) e um iPhone de duas gerações atrás.

**Critério de saída:** ADR-0002 passa a **Aceito** com os números medidos (ou é reescrito com a alternativa vencedora); o app desenha uma grade recebida do desktop falso pelo relay local, nos dois sistemas.

## M2 — Pareamento e navegação (só leitura)

**Depende de:** acesso remoto do Porecatu desktop com pareamento e envio de `workspace` e grade.

- [PRD-001](prd/prd-001-desktops-e-pareamento.md) inteiro: identidade, QR pela câmera e por *deep link*, confirmação, lista de desktops, bloqueio por biometria.
- [PRD-002](prd/prd-002-navegacao-do-workspace.md) inteiro: sessão, reconexão, árvore, busca, tema.
- [PRD-003](prd/prd-003-terminal.md) só a parte de leitura: grade ao vivo, zoom, rolagem, histórico, estados do painel (sem input, sem `start-pane`).
- Aval visual do dono para as telas do M2 antes de implementá-las ([design](design/README.md)).

**Critério de saída:** com um Porecatu real, parear, ver o workspace mudar ao vivo e acompanhar a saída de um build numa aba, nos dois sistemas.

## M3 — Terminal com input

- Resto do [PRD-003](prd/prd-003-terminal.md): teclado, barra de teclas especiais, modificadores com trava, colar, campainha, `start-pane`.
- Testes nos teclados mais comuns (Gboard, SwiftKey, teclado da Samsung, teclado do iOS) e com ditado.

**Critério de saída:** usar `vim`, `htop` e um `git commit` interativo pelo celular, num Porecatu real.

## M4 — Gestão de abas

- [PRD-004](prd/prd-004-gestao-de-abas.md) inteiro: nova aba com perfil, fechar com `confirm-request`, renomear, mover entre grupos e janelas, ações de grupo.

**Critério de saída:** cada ação do PRD-004 exercitada contra um Porecatu real, conferindo no desktop que o resultado é o do gesto local e que o foco do desktop não mudou.

## M5 — Publicação nas lojas

Android e iOS no **mesmo marco** (o Expo constrói os dois).

- Contas de desenvolvedor, ícones, textos das lojas nos dois idiomas, política de privacidade (o app não coleta dados).
- Teste interno: Google Play (teste interno) e TestFlight.
- Tag da versão no repositório e link do código-fonte na tela "Sobre" ([ADR-0006](adr/0006-licenca-gpl-e-lojas.md)).

**Critério de saída:** a mesma versão aprovada nas duas lojas, ou o motivo de recusa registrado aqui com a decisão tomada.

---

## Dívida de verificação prevista

Registrada desde já, para não ser descoberta depois:

| Item | Por quê |
|---|---|
| Tablets e telas dobráveis | Layout de celular apenas no v1 |
| Leitor de tela (TalkBack, VoiceOver) na grade | O canvas do Skia não expõe texto; precisa de camada de acessibilidade própria ([ADR-0002](adr/0002-render-da-grade-com-skia.md)) |
| Redes muito instáveis (troca Wi-Fi ↔ 4G no meio da sessão) | Reconexão testada em laboratório; o comportamento real depende do sistema |
| Versões mínimas de Android e iOS | Definidas no M1 pelo SDK do Expo pinado |

## Fora do v1

| Item | Onde está justificado |
|---|---|
| Notificações push | [PRD-000](prd/prd-000-visao-de-produto.md) |
| Seleção e cópia de texto da grade | [PRD-003](prd/prd-003-terminal.md) |
| Responder perguntas do SSH pelo celular | [PRD-000](prd/prd-000-visao-de-produto.md), [PRD-003](prd/prd-003-terminal.md) |
| Fixar abas, sessões nomeadas, abrir janela | [PRD-004](prd/prd-004-gestao-de-abas.md) |
| Código digitado no pareamento | [PRD-001](prd/prd-001-desktops-e-pareamento.md) |
| Permissão por aparelho (somente leitura) | [PRD-001](prd/prd-001-desktops-e-pareamento.md) |
