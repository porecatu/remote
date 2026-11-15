# Arquitetura

Documento técnico central do app. Os ADRs justificam *por que* cada peça foi escolhida; este documento descreve *como* elas se encaixam. **Nada disto está implementado ainda** (M0 do [roadmap](roadmap.md)); quando o código divergir do escrito, entra um bloco **Na implementação** dizendo o quê e por quê, como no Porecatu.

O protocolo é especificado fora daqui, no [porecatu/protocol](https://github.com/porecatu/protocol/blob/main/docs/especificacao/00-visao-geral.md); este documento cita as seções dele quando depende delas.

---

## 1. Camadas

```
+---------------------------------------------------------------------+
|  Telas (expo-router)                                                |
|  lista de desktops · pareamento · workspace · terminal · menus      |
+-------------------------------+-------------------------------------+
                                |  lê estado, chama ações
+-------------------------------v-------------------------------------+
|  Stores de sessão (um por desktop aberto)                           |
|  conexão · workspace · profiles · theme · pedidos pendentes         |
|  +---------------------------------------------------------------+  |
|  |  Modelo da grade (um por assinatura)                          |  |
|  |  linhas + estilos · seq · cursor · alt · history · sujeira    |  |
|  +---------------------------------------------------------------+  |
+-------------------------------+-------------------------------------+
                                |  mensagens tipadas
+-------------------------------v-------------------------------------+
|  Cliente do protocolo — pacote @porecatu/protocol (JS puro)         |
|  WebSocket · envelope · Noise XX/IK · registros · CBOR              |
+-------------------------------+-------------------------------------+
                                |  wss://
                         Porecatu Relay  ---->  Porecatu desktop

Ao lado, sem depender das camadas acima:
  Render da grade (Skia, ADR-0002) — lê o modelo da grade, desenha
  Armazenamento seguro (ADR-0003) — chave do aparelho, lista de desktops
  Catálogo de textos (ADR-0005)   — todo texto de interface
```

Regras de dependência:

- **Telas não falam com o protocolo.** Elas leem os stores e chamam ações do store (`openTab`, `sendKey`, `closeTab`...). Quem monta e manda mensagem é o store.
- **O protocolo não conhece React.** O pacote expõe uma sessão com eventos de mensagem tipada; o store é quem a assina.
- **O render da grade não conhece o protocolo**: lê o modelo da grade (linhas, estilos não resolvidos, cursor) e o `theme`, e desenha.
- **Nenhuma camada produz texto de interface** além das telas, pelo catálogo ([ADR-0005](adr/0005-catalogo-de-textos-e-idiomas.md)). Os stores guardam códigos (`error-code`, estado de conexão), nunca frases.

---

## 2. Sessão por desktop

Um **store de sessão** existe por desktop **aberto** (o que o usuário tocou na lista). Desktops da lista que não estão abertos não têm conexão nem store vivo ([PRD-001](prd/prd-001-desktops-e-pareamento.md) RF-1.13).

### Ciclo

```
idle -> connecting -> handshaking -> greeting -> ready
                                                   |
            reconnecting <-------------------------+ (queda sem goodbye)
                 |  1, 2, 4, 8, 16 s
                 +--> connecting ...    (esgotou -> failed)

ready -> closed         (goodbye, not-paired, incompatible, usuário saiu)
```

- `connecting`: abre `wss://<relay>/v0/client/<host_id>`; `host-unavailable` → `closed` com motivo **offline**.
- `handshaking`: `IK` (ou `XX` no pareamento) pelo pacote.
- `greeting`: manda `hello`; espera `welcome`, depois `theme`, `profiles` e `workspace` ([mensagens §2](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)). Só então `ready`.
- **Reconexão** refaz tudo do zero: novo handshake, novo `hello`, novo `workspace`, novas assinaturas com `grid-snapshot`. Nenhum estado da sessão anterior é reaproveitado, porque os ids podem ter mudado (o Porecatu pode ter reiniciado) e a grade certamente mudou.
- **Segundo plano**: ao ir para o segundo plano, o app fecha a sessão de forma limpa depois de 30 s (o sistema a derrubaria de qualquer jeito); ao voltar, reconecta e reabre a tela onde o usuário estava, se o `tab-id`/`pane-id` ainda existir no `workspace` novo.

### O que o store guarda

| Dado | Origem | Vida |
|---|---|---|
| `workspace` (árvore inteira, `rev`) | Mensagem `workspace`, **substituída** a cada envio | Sessão |
| `profiles`, `theme` | Mensagens do início e de recarga | Sessão |
| Assinaturas e seus modelos de grade | `subscribe` → `grid-snapshot`/`grid-diff` | Enquanto a tela do painel está aberta |
| Pedidos pendentes (`request-id` → ação, confirmação aberta) | `action`, `confirm-request` | Até o `action-result` |
| Expansão local de grupos, zoom por aba | Gesto do usuário no app | Sessão do app (memória) |

O `workspace` não é mesclado: cada mensagem substitui a anterior inteira. As telas comparam por id para preservar rolagem e não re-renderizar o que não mudou. **Nada do store é gravado em disco** — o que persiste é só a lista de desktops ([ADR-0003](adr/0003-chaves-no-armazenamento-seguro.md)).

---

## 3. Modelo da grade

Um modelo por assinatura, alimentado pelo store, lido pelo render.

```
GridModel
  pane, seq                 a sequência da assinatura (§5.3 da spec)
  cols, rows                do desktop; o app nunca os muda
  lines[rows]               cada linha: wrapped + spans [col, width, styleRef, text]
  styles                    tabela de estilos referenciada pelas linhas
  cursor, alt, history
  dirty: Set<row>           linhas que mudaram desde o último quadro desenhado
  scrollback: páginas       linhas de histórico já recebidas, por offset
```

- **`grid-snapshot`** substitui tudo, reinicia `seq` e marca todas as linhas sujas.
- **`grid-diff`** confere `seq == anterior + 1` (senão: dessincronia → `subscribe` de novo), substitui as linhas listadas e marca só elas.
- **Estilos**: cada mensagem traz a própria tabela; o modelo **interna** os estilos (mapa estilo → id estável no app) para que uma linha que não mudou continue com a mesma referência e o render possa reaproveitar a gravação dela.
- **`grid-ack`** é mandado **depois** de o modelo aplicar a mensagem. Sem ack, o desktop para de mandar a grade depois de duas mensagens ([§5.4](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)).
- **Coluna de cada caractere** sem segmentar grafemas: num span de code points simples, o *i*-ésimo code point fica em `col + i × width`; grafema composto vem sozinho num span.
- **Scrollback** é paginado sob demanda (`scrollback-request`, até 500 linhas); o modelo guarda as páginas por `offset` e corrige o deslocamento pela diferença de `history` entre respostas.

---

## 4. Render

Detalhado no [ADR-0002](adr/0002-render-da-grade-com-skia.md) (Proposto). Em resumo:

- Um `Canvas` do Skia por tela de terminal, **fora do reconciliador do React**: o modelo avisa o canvas por um valor compartilhado; diff não causa re-render de componente.
- Uma gravação por linha, refeita só para as linhas `dirty`; zoom e rolagem são transformação do canvas.
- Cores resolvidas no desenho, com o `theme`: padrão → `fg`/`bg`; indexada 0–15 → `palette`; 16–255 → tabela do xterm; direta → como veio.

---

## 5. Input

```
teclado do sistema --(texto, IME)--------------------> text  { pane, text }
barra de teclas especiais --(Esc, setas, Fn...)------> key   { pane, named-key, mods }
Ctrl/Alt travados + letra -----------------------------> key  { pane, "c", Ctrl }
colar ---(confirmação se várias linhas)--------------> paste { pane, text }
```

- O app **não codifica bytes de terminal**: manda input semântico, e o desktop o codifica com o mesmo codificador do teclado local ([mensagens §6](https://github.com/porecatu/protocol/blob/main/docs/especificacao/03-mensagens.md)).
- O teclado é capturado por um campo de texto invisível com autocorreção, previsão e capitalização desligadas; cada mudança vira `text`, e o campo é esvaziado. `Backspace` do teclado virtual vira `key { backspace }`.
- Input só sai para painel `running` e assinado.

---

## 6. Threads

| Onde | O quê |
|---|---|
| **Thread de JS** (Hermes) | WebSocket, Noise e CBOR (pacote em JS puro), stores, modelo da grade, React |
| **Thread de UI** (nativa) | Gestos (pinça, rolagem) via Reanimated/Gesture Handler, sem passar pela thread de JS |
| **Thread de render do Skia** | Desenho do canvas a partir das gravações por linha |

A regra que importa: **gesto não espera a thread de JS**. Zoom e rolagem mexem num valor compartilhado lido pelo Skia; uma rajada de diffs ocupando a thread de JS não trava a rolagem. O orçamento da thread de JS (decifrar, decodificar e aplicar até 30 diffs/s) é medido no spike do M1.

---

## 7. Mapa de telas

```
Bloqueio (biometria) --> Lista de desktops --+--> Parear (câmera) --> Nome do aparelho --> Aguardando confirmação
                              |              |                                                    |
                              |              +--> Sobre este aparelho (impressão digital)        v
                              v                                                             Workspace
                         Workspace  <-------------------------------------------------------------+
                         (janelas -> fixadas, grupos, abas; busca)
                              |
                              +--> Menu da aba / Menu do grupo --> Nova aba (perfil) · Renomear · Mover · Cor ...
                              v
                         Terminal (grade, zoom, histórico, barra de teclas, seletor de painel)
                              |
                              +--> Confirmação de fechamento (confirm-request)
```

*Deep link* `porecatu://pair?...` entra direto em "Nome do aparelho", depois do desbloqueio.

---

## 8. Estratégia de teste

- **Protocolo**: coberto no repositório do protocolo, contra os vetores. O app não repete esses testes.
- **Modelo da grade e stores**: funções puras, testadas em Node com sequências de mensagens gravadas (snapshot, diffs, snapshot no meio, `seq` quebrado, página de scrollback com `history` mudando).
- **Catálogo**: completude entre idiomas e cobertura de todos os códigos do protocolo ([ADR-0005](adr/0005-catalogo-de-textos-e-idiomas.md)).
- **Desktop falso**: um host de teste em Node, usando o próprio `@porecatu/protocol`, que serve um workspace e uma grade sintética por um relay local — para desenvolver e testar telas sem o Porecatu.
- **Render**: medido em aparelho real, nos critérios do [ADR-0002](adr/0002-render-da-grade-com-skia.md).
