#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Verificação de consistência da documentação do Porecatu Remote.

Roda localmente e no CI:

    python scripts/verify-docs.py

Sem dependências além da biblioteca padrão. Sai com código 1 se qualquer
checagem falhar.

Versão reduzida do scripts/verify-docs.py do Porecatu: por ora só a checagem
de links relativos. Links para os outros repositórios do projeto (protocol,
relay, terminal) são URLs absolutas e por isso não são conferidos aqui.
"""

from __future__ import annotations

import glob
import os
import re
import sys
import urllib.parse

# Console do Windows pode vir em codepage legado; sem isto, acentos e setas
# levantam UnicodeEncodeError em vez de imprimir.
for fluxo in (sys.stdout, sys.stderr):
    if hasattr(fluxo, "reconfigure"):
        fluxo.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IGNORADOS = ("node_modules", ".expo", ".git")

falhas: list[str] = []


def secao(titulo: str) -> None:
    print(f"\n=== {titulo} ===")


def ok(msg: str) -> None:
    print(f"  ok   {msg}")


def erro(msg: str) -> None:
    print(f"  ERRO {msg}")
    falhas.append(msg)


def ler(caminho: str) -> str:
    with open(caminho, encoding="utf-8") as f:
        return f.read()


def verificar_links() -> None:
    secao("Links relativos")
    quebrados = []
    total = 0
    for arquivo in glob.glob("**/*.md", recursive=True):
        if any(parte in IGNORADOS for parte in arquivo.replace("\\", "/").split("/")):
            continue
        base = os.path.dirname(arquivo) or "."
        for alvo in re.findall(r"\]\(([^)]+)\)", ler(arquivo)):
            if alvo.startswith(("http://", "https://", "mailto:", "#")):
                continue
            # Caminhos podem vir percent-encoded.
            destino = urllib.parse.unquote(alvo.split("#")[0])
            if not destino:
                continue
            total += 1
            if not os.path.exists(os.path.join(base, destino)):
                quebrados.append(f"{arquivo} -> {alvo}")

    if quebrados:
        for q in quebrados:
            erro(f"link quebrado: {q}")
    else:
        ok(f"{total} links relativos resolvem")


def main() -> int:
    os.chdir(ROOT)
    verificar_links()
    print()
    if falhas:
        print(f"{len(falhas)} falha(s).")
        return 1
    print("Tudo certo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
