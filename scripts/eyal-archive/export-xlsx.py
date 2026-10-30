#!/usr/bin/env python3
"""Export Eyal Hatav's HBS archive workbook to JSON for scripts/eyal-archive/import.js.

The workbook is shared privately and must never enter git (the repo is public); this
script only converts it. Run where openpyxl is available:

    python3 scripts/eyal-archive/export-xlsx.py docs/games/hbs-allgames_1950-2020.xlsx out.json

Every games row keeps its sheet row number ("row") so a report can point back to it,
alongside the book page the workbook already carries.
"""
import datetime
import json
import sys

import openpyxl


def cell(v):
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d')
    return v


def sheet_rows(ws):
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    return [
        {'row': i + 2, **{h: cell(v) for h, v in zip(header, r)}}
        for i, r in enumerate(rows[1:])
        if any(v is not None for v in r)
    ]


def main(src, dst):
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    out = {
        'source': 'eyal-archive',
        'workbook': src.rsplit('/', 1)[-1],
        'games': sheet_rows(wb['משחקים']),
        'tables': sheet_rows(wb['טבלאות ליגה']),
        'seasons': sheet_rows(wb['סיכום עונות']),
    }
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"{len(out['games'])} games, {len(out['tables'])} table rows, {len(out['seasons'])} seasons -> {dst}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: export-xlsx.py <workbook.xlsx> <out.json>')
    main(sys.argv[1], sys.argv[2])
