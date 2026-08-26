"""Create a compact CEFR match map from the Instituto Cervantes PCIC pages.

Only matches for the user's own vocabulary are stored. The source inventories
are not bundled into the app; the generated map is therefore small and the app
remains fully offline.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import openpyxl
from lxml import html


SOURCE_URLS = {
    "A1": "https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_inventario_a1-a2.htm",
    "A2": "https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_inventario_a1-a2.htm",
    "B1": "https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_inventario_b1-b2.htm",
    "B2": "https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_inventario_b1-b2.htm",
    "C1": "https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_inventario_c1-c2.htm",
    "C2": "https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_inventario_c1-c2.htm",
}


def normalize(value: object) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(value or "")).strip())


def search_key(value: object) -> str:
    value = unicodedata.normalize("NFD", normalize(value).casefold())
    return "".join(char for char in value if not unicodedata.combining(char))


def item_variants(value: str) -> list[str]:
    value = re.sub(r"\([^)]*\)", "", normalize(value))
    variants = []
    for part in value.split("/"):
        part = re.sub(r"^(el|la|los|las|un|una|unos|unas)\s+", "", part.strip(), flags=re.IGNORECASE)
        if part:
            variants.append(part)
    variants.append(value)
    return list(dict.fromkeys(variants))


def matches(cell_text: str, candidate: str) -> bool:
    text = cell_text
    tokens = [token for token in search_key(candidate).split() if token != "~"]
    if not tokens:
        return False
    # The source text is pre-normalized; the tilde in PCIC expressions is
    # treated as a word separator, so a plain bounded substring is sufficient.
    needle = " " + " ".join(tokens) + " "
    return needle in " " + text + " "


def load_pcic_cells(source_dir: Path) -> list[tuple[str, str, str]]:
    pages = [
        ("pcic-a1-a2.html", "A1", "A2"),
        ("pcic-b1-b2.html", "B1", "B2"),
        ("pcic-c1-c2.html", "C1", "C2"),
    ]
    cells = []
    for filename, low, high in pages:
        document = html.parse(str(source_dir / filename))
        for table in document.xpath("//table"):
            headers = {
                header.get("id"): normalize(header.text_content())
                for header in table.xpath(".//thead//th")
            }
            if low not in headers.values() and high not in headers.values():
                continue
            for cell in table.xpath(".//tbody//td"):
                level = headers.get(cell.get("headers"))
                if level:
                    cells.append((level, cell.text_content(), SOURCE_URLS[level]))
    return cells


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--workbook", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    cells = load_pcic_cells(args.source_dir)
    # Searching one long normalized text per level is much faster than
    # compiling a regex for every vocabulary item against every table cell.
    pcic_text = {
        level: re.sub(r"[^a-z0-9áéíóúüñ]+", " ", "\n".join(search_key(text) for cell_level, text, _ in cells if cell_level == level))
        for level in ("A1", "A2", "B1", "B2", "C1", "C2")
    }
    workbook = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
    sheet_specs = [
        ("名詞", "noun"),
        ("動詞 ", "verb"),
        ("形容詞", "adjective"),
        ("副詞", "adverb"),
        ("その他", "other"),
        ("フレーズ・挨拶", "phrase"),
    ]
    order = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}
    matches_by_key = {}
    for sheet_name, part_of_speech in sheet_specs:
        sheet = workbook[sheet_name]
        for row in sheet.iter_rows(min_row=2, values_only=True):
            if len(row) < 4 or not row[1] or not row[3]:
                continue
            es = normalize(row[1])
            region_match = re.search(r"\((LA|Am\.?|España|Esp\.?)\)", es, flags=re.IGNORECASE)
            region = region_match.group(1).upper().replace(".", "") if region_match else ""
            canonical = re.sub(r"\s*\((?:LA|Am\.?|España|Esp\.?)\)\s*", "", es, flags=re.IGNORECASE)
            key = f"{part_of_speech}|{search_key(canonical)}|{search_key(region)}"
            levels = []
            for level in ("A1", "A2", "B1", "B2", "C1", "C2"):
                if any(matches(pcic_text[level], candidate) for candidate in item_variants(canonical)):
                    levels.append((level, SOURCE_URLS[level]))
            if levels:
                levels = sorted(set(levels), key=lambda value: order[value[0]])
                matches_by_key[key] = {
                    "level": levels[0][0],
                    "levels": [level for level, _ in levels],
                    "source": levels[0][1],
                }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(matches_by_key, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"matched": len(matches_by_key), "pcicCells": len(cells)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
