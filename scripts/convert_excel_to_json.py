#!/usr/bin/env python3
"""
Inventory_Master_CategoryTabs_V4.xlsx 형태의 Excel 파일을 data/inventory.json으로 변환합니다.

사용 예:
  python scripts/convert_excel_to_json.py source/Inventory_Master_CategoryTabs_V4.xlsx data/inventory.json

필요 패키지:
  pip install openpyxl
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

try:
    import openpyxl
except ImportError as exc:
    raise SystemExit("openpyxl이 필요합니다. 먼저 `pip install openpyxl`을 실행하세요.") from exc

CATEGORY_SHEETS = ["Chemical", "Antibody", "Product"]
SCHEMA = [
    "Category", "Item_ID", "Manufacturer", "Item_Name", "Cat_No", "Storage",
    "Location", "Opened_Date", "Quantity_Size", "Form_Type", "MW_kDa", "Requester", "Note",
]

def clean(value):
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    return str(value).strip()

def rows_from_sheet(ws):
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [clean(cell) for cell in rows[0]]
    output = []
    for row in rows[1:]:
        record = {headers[i]: clean(row[i]) if i < len(row) else "" for i in range(len(headers))}
        if not record.get("Item_ID") and not record.get("Item_Name"):
            continue
        category = record.get("Category") or ws.title
        canonical = {key: record.get(key, "") for key in SCHEMA}
        canonical["Category"] = category
        output.append(canonical)
    return output

def main():
    if len(sys.argv) != 3:
        raise SystemExit("사용법: python scripts/convert_excel_to_json.py <input.xlsx> <output.json>")

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    wb = openpyxl.load_workbook(input_path, data_only=True)

    items = []
    for name in CATEGORY_SHEETS:
        if name in wb.sheetnames:
            items.extend(rows_from_sheet(wb[name]))

    counts = {}
    for item in items:
        counts[item["Category"]] = counts.get(item["Category"], 0) + 1

    payload = {
        "meta": {
            "title": "L1521 Inventory",
            "source_file": input_path.name,
            "record_count": len(items),
            "categories": counts,
            "schema": SCHEMA,
        },
        "items": items,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(items)} records to {output_path}")

if __name__ == "__main__":
    main()
