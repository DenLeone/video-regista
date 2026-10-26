#!/usr/bin/env python3
# Stesso confronto di cartellaUguale in scripts/regista.mjs: spazi, maiuscole, accenti.
# Lo stdin sono i nomi da `rclone lsf` (uno per riga, con la / finale delle cartelle).
# Lo spazio in fondo si tiene: su Drive la cartella può chiamarsi "Manifestazioni ".
import sys
import unicodedata


def norm(testo: str) -> str:
    testo = unicodedata.normalize('NFD', testo)
    testo = ''.join(c for c in testo if unicodedata.category(c) != 'Mn')
    return ' '.join(testo.lower().split())


def nomi_da_elenco(righe):
    for riga in righe:
        nome = riga.rstrip('\r\n')
        if nome.endswith('/'):
            nome = nome[:-1]
        if nome:
            yield nome


def main() -> int:
    if len(sys.argv) != 2:
        print('uso: nome-cartella.py <nome>', file=sys.stderr)
        return 1
    voluto = norm(sys.argv[1])
    if not voluto:
        return 2
    uguali = [nome for nome in nomi_da_elenco(sys.stdin) if norm(nome) == voluto]
    if len(uguali) == 1:
        print(uguali[0], end='')
        return 0
    return 3 if len(uguali) > 1 else 2


if __name__ == '__main__':
    raise SystemExit(main())
