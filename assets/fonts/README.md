# Fontes embutidas

As duas faces da **Iosevka Fixed** que o app embute ([ADR-0009](../../docs/adr/0009-iosevka-fixed-embutida.md)), já recortadas para os blocos que um terminal desenha, e o texto da licença delas.

## Origem

Copiadas **sem alteração** do `assets/fonts/` do desktop, [porecatu/terminal](https://github.com/porecatu/terminal), no commit `c2fab2f89d7cef61dfe59ec57451dd74047eda8b`.

| Arquivo | Peso | Tamanho (bytes) | `sha256` |
|---|---|---|---|
| `IosevkaFixed-Regular.ttf` | 400 | 422 776 | `14c7ba33158bddc6e3f7cf6c8d6e2f4606238b2304992d02d5b31daefcc90d73` |
| `IosevkaFixed-Medium.ttf` | 500 | 422 020 | `56a4cca57bbb94c8056c9a6e9716affab1e4c1c9846a82246a6a439de0a87075` |
| `LICENSE-OFL-iosevka.txt` | — | 4 493 | `4ba53c7c1cb39279aae5f8d7d22054c485c71169920e5a36ed098b115e2e3c5d` |

## Licença

SIL Open Font License 1.1, **sem** *Reserved Font Name* (texto em `LICENSE-OFL-iosevka.txt`). A fonte acompanha o app como obra separada; não é coberta pelo `LICENSE` da raiz, e os arquivos não levam cabeçalho SPDX.

## Atualização

O app não recorta a fonte: quando o desktop atualizar a Iosevka ou o recorte, os três arquivos são copiados de novo do `assets/fonts/` do desktop, sem alteração, e esta página ganha o commit novo e os `sha256` novos (ADR-0009, item 1).
