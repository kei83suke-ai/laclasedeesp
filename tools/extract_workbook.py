"""Read the supplied workbook without modifying it."""
import collections
import hashlib
import json
import pathlib
import sys
import openpyxl

source = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2])
workbook = openpyxl.load_workbook(source, read_only=True, data_only=False)
result = {"sourceName": source.name, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "sheets": {}}
for name in ["単語マスター", "動詞", "活用表", "活用照合"]:
    sheet = workbook[name]
    width = 15 if name in ["単語マスター", "動詞"] else 10
    rows = []
    for row in sheet.iter_rows(min_row=3, max_col=width):
        values = []
        for cell in row:
            if cell.data_type == "f":
                raise ValueError(f"Formula requires review: {name}!{cell.coordinate}")
            values.append(cell.value)
        if any(value is not None for value in values):
            rows.append(values)
    result["sheets"][name] = {"headers": rows[0], "rows": rows[1:]}
    print(name, len(rows)-1, flush=True)
output.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
master = result["sheets"]["単語マスター"]["rows"]
forms = result["sheets"]["活用表"]["rows"]
print(json.dumps({"translationStates": collections.Counter(r[10] for r in master), "forms": len(forms), "missingJa": sum(not r[3] for r in master)}, ensure_ascii=False))
