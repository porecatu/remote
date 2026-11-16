#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Confere o cabeçalho SPDX dos arquivos de código do Porecatu Remote.

Roda localmente e no CI:

    python scripts/check-spdx.py

Todo arquivo versionado de código (.js, .ts, .tsx, .mjs, .cjs, .py, .yml,
.yaml) precisa ter a linha `SPDX-License-Identifier: GPL-3.0-or-later` no topo,
com o comentário do seu formato (`//` em JS/TS, `#` em Python e YAML). Um
shebang pode vir antes. JSON não leva cabeçalho. Ficam de fora `node_modules`,
`vendor` e `.expo`.

Sem dependências além da biblioteca padrão. Sai com código 1 se algum arquivo
falhar.
"""

from __future__ import annotations

import os
import subprocess
import sys

for fluxo in (sys.stdout, sys.stderr):
    if hasattr(fluxo, "reconfigure"):
        fluxo.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SPDX = "SPDX-License-Identifier: GPL-3.0-or-later"
IGNORADOS = ("node_modules", "vendor", ".expo")
# Gerado por ferramenta; não se edita à mão, então não leva cabeçalho.
ARQUIVOS_GERADOS = ("pnpm-lock.yaml",)
COMENTARIO_DE_BARRAS ={".js", ".ts", ".tsx", ".mjs", ".cjs"}
COMENTARIO_DE_CERQUILHA = {".py", ".yml", ".yaml"}


def arquivos() -> list[str]:
    """Arquivos versionados (ou ainda não versionados e não ignorados)."""
    saida = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    ).stdout.decode("utf-8")
    caminhos = [c for c in saida.split("\0") if c]
    # `git ls-files --cached` ainda lista arquivo apagado do disco.
    return sorted(c for c in set(caminhos) if os.path.isfile(os.path.join(ROOT, c)))


def ignorado(caminho: str) -> bool:
    if caminho in ARQUIVOS_GERADOS:
        return True
    return any(parte in IGNORADOS for parte in caminho.split("/"))


def prefixo_esperado(extensao: str) -> str | None:
    if extensao in COMENTARIO_DE_BARRAS:
        return "//"
    if extensao in COMENTARIO_DE_CERQUILHA:
        return "#"
    return None


def confere(caminho: str) -> str | None:
    """Devolve a mensagem de falha, ou None se o arquivo está em ordem."""
    extensao = os.path.splitext(caminho)[1].lower()
    prefixo = prefixo_esperado(extensao)
    if prefixo is None:
        return None
    with open(os.path.join(ROOT, caminho), encoding="utf-8-sig") as arquivo:
        linhas = arquivo.read().splitlines()
    topo = 0
    if linhas and linhas[0].startswith("#!"):
        topo = 1
    esperado = f"{prefixo} {SPDX}"
    if len(linhas) <= topo or linhas[topo].strip() != esperado:
        return f"{caminho}: falta `{esperado}` no topo"
    return None


def main() -> int:
    candidatos = [c for c in arquivos() if not ignorado(c)]
    falhas = [m for m in (confere(c) for c in candidatos) if m is not None]
    if falhas:
        print("Arquivos sem o cabeçalho SPDX:")
        for falha in falhas:
            print(f"  {falha}")
        return 1
    print(f"OK: {len(candidatos)} arquivos versionados conferidos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
