#!/usr/bin/env python3
"""
Convert Inventory_Master_CategoryTabs_V4.xlsx to the current web inventory JSON schema.

Usage:
    python scripts/convert_categorytabs_to_json.py <input.xlsx> <output.json>

The CategoryTabs workbook has separate Chemical, Antibody, and Product sheets.
This script normalizes those sheets into the schema consumed by index.html.
"""
from __future__ import annotations

import json
import sys
import zipfile
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

SHEETS = ["Chemical", "Antibody", "Product"]
CATEGORY_MAP = {
    "Chemical": "Chemical",
    "Antibody": "Antibody/Protein",
    "Product": "Products",
}

MANUFACTURER_MAP = {
    "abcam": "Abcam",
    "alfa aesar": "Alfa Aesar",
    "bio-rad": "Bio-Rad",
    "calbiochem": "Calbiochem",
    "cell signaling technology": "CST",
    "chemfaces": "Chemfaces",
    "extrasynthese": "Extrasynthese",
    "fluka": "Fluka",
    "fluka (sigma)": "Fluka",
    "gendepot": "GenDEPOT",
    "millipore (sigma)": "Millipore",
    "raybio": "RayBiotech",
    "santacruz": "Santa Cruz",
    "scbt": "Santa Cruz",
    "aldrich (sigma)": "Sigma",
    "(cytiva)biacore": "Biacore",
    "thermo scientific": "Thermo Scientific",
    "takara": "Takara",
    "sigma": "Sigma",
    "santa cruz": "Santa Cruz",
    "santa cruz biotechnology": "Santa Cruz",
    "junsei": "Junsei",
    "geneall": "GeneAll",
}

SCHEMA = [
    "Item_ID", "Category", "Subcategory", "Item_Name", "Manufacturer",
    "Cat_No", "CAS_No", "MW_kDa",
    "Storage", "Location", "Sub_Location",
    "Quantity_Size", "Order_Unit", "Current_Stock", "Low_Stock",
    "Opened_Date", "Expiry_Date", "Requester", "MSDS_URL", "Note",
]

KNOWN_LOCATIONS = {
    "Yellow Cabinet", "Cabinet", "Fridge", "Fridge 2", "Freezer", "Freezer 2",
}


def col_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
    return idx - 1


def clean(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text in {"nan", "NaT", "NaN", "None"} else text


def normalize_storage(value: str) -> str:
    raw = clean(value)
    key = (
        raw.lower()
        .replace(" ", "")
        .replace("℃", "°c")
        .replace("'c", "°c")
        .replace("˚c", "°c")
    )
    if key in {"rt", "roomtemperature"}:
        return "RT"
    if key in {"ln2", "liquidnitrogen"}:
        return "LN2"
    if key in {"4c", "4°c", "2-8c", "2-8°c", "2~8c", "2~8°c"}:
        return "4°C"
    if key in {"-20c", "-20°c", "minus20c", "minus20°c"}:
        return "-20°C"
    if key in {"-80c", "-80°c", "minus80c", "minus80°c"}:
        return "-80°C"
    return raw


def normalize_manufacturer(value: str) -> str:
    raw = clean(value)
    return MANUFACTURER_MAP.get(raw.lower(), raw)


def parse_excel_date(value: str) -> str:
    text = clean(value)
    if not text:
        return ""
    try:
        serial = float(text)
    except ValueError:
        return text
    if serial <= 0 or serial > 80000:
        return text
    date = datetime(1899, 12, 30) + timedelta(days=serial)
    return date.strftime("%Y.%m.%d")


def load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(t.text or "" for t in item.iter(NS + "t")) for item in root]


def cell_value(cell, shared: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find(NS + "is")
        return clean("".join(t.text or "" for t in inline.iter(NS + "t"))) if inline is not None else ""

    value = cell.find(NS + "v")
    if value is None or value.text is None:
        return ""
    text = value.text
    if cell_type == "s":
        return clean(shared[int(text)])
    return clean(text)


def read_rows(zf: zipfile.ZipFile, sheet_path: str, shared: list[str]) -> list[list[str]]:
    root = ET.fromstring(zf.read(sheet_path))
    rows = []
    for row in root.findall(NS + "sheetData/" + NS + "row"):
        values = []
        for cell in row.findall(NS + "c"):
            idx = col_index(cell.attrib["r"])
            while len(values) <= idx:
                values.append("")
            values[idx] = cell_value(cell, shared)
        if any(values):
            rows.append(values)
    return rows


def workbook_sheet_paths(zf: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
    sheet_paths = {}
    for sheet in workbook.findall(NS + "sheets/" + NS + "sheet"):
        target = rel_map[sheet.attrib[REL_NS]].lstrip("/")
        sheet_paths[sheet.attrib["name"]] = target if target.startswith("xl/") else "xl/" + target
    return sheet_paths


def normalize_record(record: dict[str, str], sheet_name: str) -> dict:
    category = CATEGORY_MAP.get(clean(record.get("Category")) or sheet_name, clean(record.get("Category")) or sheet_name)
    item = {field: "" for field in SCHEMA}

    item.update({
        "Item_ID": clean(record.get("Item_ID")),
        "Category": category,
        "Item_Name": clean(record.get("Item_Name")),
        "Manufacturer": normalize_manufacturer(record.get("Manufacturer")),
        "Cat_No": clean(record.get("Cat_No")),
        "MW_kDa": clean(record.get("MW_kDa")),
        "Storage": normalize_storage(record.get("Storage")),
        "Quantity_Size": clean(record.get("Quantity_Size")),
        "Opened_Date": parse_excel_date(record.get("Opened_Date")),
        "Requester": clean(record.get("Requester")),
        "Note": clean(record.get("Note")),
        "Current_Stock": None,
        "Low_Stock": False,
    })

    location = clean(record.get("Location"))
    if location in KNOWN_LOCATIONS:
        item["Location"] = location
    else:
        item["Sub_Location"] = location

    form_type = clean(record.get("Form_Type"))
    if form_type:
        item["Subcategory"] = form_type

    return item


def convert(input_path: Path, output_path: Path) -> None:
    with zipfile.ZipFile(input_path) as zf:
        shared = load_shared_strings(zf)
        sheet_paths = workbook_sheet_paths(zf)
        items = []
        for sheet_name in SHEETS:
            if sheet_name not in sheet_paths:
                continue
            rows = read_rows(zf, sheet_paths[sheet_name], shared)
            if not rows:
                continue
            headers = [clean(value) for value in rows[0]]
            for row in rows[1:]:
                record = {headers[i]: row[i] if i < len(row) else "" for i in range(len(headers))}
                if not clean(record.get("Item_ID")) and not clean(record.get("Item_Name")):
                    continue
                items.append(normalize_record(record, sheet_name))

    counts = dict(Counter(item["Category"] for item in items))
    payload = {
        "meta": {
            "title": "L1521 Inventory",
            "source_file": input_path.name,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "version": "web-v2-categorytabs",
            "record_count": len(items),
            "categories": counts,
            "schema": SCHEMA,
        },
        "items": items,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(items)} items to {output_path}")
    print(f"Categories: {counts}")


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        raise SystemExit(1)
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")
    convert(input_path, output_path)


if __name__ == "__main__":
    main()
