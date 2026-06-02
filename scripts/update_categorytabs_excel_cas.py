#!/usr/bin/env python3
"""
Add/update CAS_No columns in Inventory_Master_CategoryTabs_V4.xlsx from data/inventory.json.

Usage:
    python scripts/update_categorytabs_excel_cas.py data/inventory.json source/Inventory_Master_CategoryTabs_V4.xlsx

Matches rows by Item_ID in Chemical, Antibody, and Product sheets. The script uses
the XLSX zip/XML structure directly, so it does not require openpyxl.
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS_URI = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_URI = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = f"{{{NS_URI}}}"
REL_NS = f"{{{REL_URI}}}id"

ET.register_namespace("", NS_URI)
ET.register_namespace("r", REL_URI)

SHEETS = {"Chemical", "Antibody", "Product"}


def col_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
    return idx - 1


def col_name(index: int) -> str:
    index += 1
    letters = []
    while index:
        index, rem = divmod(index - 1, 26)
        letters.append(chr(ord("A") + rem))
    return "".join(reversed(letters))


def cell_ref(col: int, row: int) -> str:
    return f"{col_name(col)}{row}"


def get_cell_text(cell, shared: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find(NS + "is")
        return "".join(t.text or "" for t in inline.iter(NS + "t")) if inline is not None else ""
    value = cell.find(NS + "v")
    if value is None or value.text is None:
        return ""
    if cell_type == "s":
        return shared[int(value.text)]
    return value.text


def ensure_shared_string(root, shared: list[str], value: str) -> int:
    if value in shared:
        return shared.index(value)
    si = ET.SubElement(root, NS + "si")
    t = ET.SubElement(si, NS + "t")
    t.text = value
    shared.append(value)
    root.attrib["count"] = str(int(root.attrib.get("count", "0")) + 1)
    root.attrib["uniqueCount"] = str(len(shared))
    return len(shared) - 1


def set_shared_string(cell, index: int) -> None:
    cell.attrib["t"] = "s"
    inline = cell.find(NS + "is")
    if inline is not None:
        cell.remove(inline)
    value = cell.find(NS + "v")
    if value is None:
        value = ET.SubElement(cell, NS + "v")
    value.text = str(index)


def row_cells_by_col(row) -> dict[int, object]:
    return {col_index(cell.attrib["r"]): cell for cell in row.findall(NS + "c")}


def insert_or_get_cell(row, col: int):
    cells = row.findall(NS + "c")
    target_ref = cell_ref(col, int(row.attrib["r"]))
    for pos, cell in enumerate(cells):
        existing_col = col_index(cell.attrib["r"])
        if existing_col == col:
            return cell
        if existing_col > col:
            new_cell = ET.Element(NS + "c", {"r": target_ref})
            row.insert(pos, new_cell)
            return new_cell
    new_cell = ET.Element(NS + "c", {"r": target_ref})
    row.append(new_cell)
    return new_cell


def workbook_sheet_paths(zf: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
    sheet_paths = {}
    for sheet in workbook.findall(NS + "sheets/" + NS + "sheet"):
        name = sheet.attrib["name"]
        if name not in SHEETS:
            continue
        target = rel_map[sheet.attrib[REL_NS]].lstrip("/")
        sheet_paths[name] = target if target.startswith("xl/") else "xl/" + target
    return sheet_paths


def update_dimension(root, last_col: int, last_row: int) -> None:
    dimension = root.find(NS + "dimension")
    if dimension is not None:
        dimension.attrib["ref"] = f"A1:{cell_ref(last_col, last_row)}"


def update_workbook(json_path: Path, excel_path: Path) -> dict[str, int]:
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    cas_map = {
        str(item.get("Item_ID", "")).strip(): str(item.get("CAS_No", "")).strip()
        for item in payload.get("items", [])
        if str(item.get("Item_ID", "")).strip() and str(item.get("CAS_No", "")).strip()
    }

    with zipfile.ZipFile(excel_path, "r") as zf:
        files = {name: zf.read(name) for name in zf.namelist()}
        sheet_paths = workbook_sheet_paths(zf)

    shared_root = ET.fromstring(files["xl/sharedStrings.xml"])
    shared = ["".join(t.text or "" for t in item.iter(NS + "t")) for item in shared_root]
    cas_header_idx = ensure_shared_string(shared_root, shared, "CAS_No")

    changes: dict[str, int] = {}
    for sheet_name, sheet_path in sheet_paths.items():
        root = ET.fromstring(files[sheet_path])
        rows = root.findall(NS + "sheetData/" + NS + "row")
        if not rows:
            continue

        header = rows[0]
        header_cells = row_cells_by_col(header)
        headers = {get_cell_text(cell, shared).strip(): col for col, cell in header_cells.items()}
        if "Item_ID" not in headers:
            continue

        id_col = headers["Item_ID"]
        cas_col = headers.get("CAS_No")
        if cas_col is None:
            cas_col = max(header_cells.keys(), default=-1) + 1
            header_cell = insert_or_get_cell(header, cas_col)
            set_shared_string(header_cell, cas_header_idx)

        updated = 0
        for row in rows[1:]:
            cells = row_cells_by_col(row)
            id_cell = cells.get(id_col)
            if id_cell is None:
                continue
            item_id = get_cell_text(id_cell, shared).strip()
            cas_no = cas_map.get(item_id)
            if not cas_no:
                continue
            existing_cell = cells.get(cas_col)
            existing = get_cell_text(existing_cell, shared).strip() if existing_cell is not None else ""
            if existing == cas_no:
                continue
            cas_cell = insert_or_get_cell(row, cas_col)
            cas_idx = ensure_shared_string(shared_root, shared, cas_no)
            set_shared_string(cas_cell, cas_idx)
            updated += 1

        if updated:
            last_row = max(int(row.attrib["r"]) for row in rows)
            update_dimension(root, cas_col, last_row)
            files[sheet_path] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            changes[sheet_name] = updated

    files["xl/sharedStrings.xml"] = ET.tostring(shared_root, encoding="utf-8", xml_declaration=True)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        tmp_path = Path(tmp.name)
    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as out:
            for name, content in files.items():
                out.writestr(name, content)
        shutil.move(str(tmp_path), excel_path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

    return changes


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        raise SystemExit(1)
    json_path = Path(sys.argv[1])
    excel_path = Path(sys.argv[2])
    if not json_path.exists():
        raise SystemExit(f"JSON not found: {json_path}")
    if not excel_path.exists():
        raise SystemExit(f"Excel not found: {excel_path}")
    changes = update_workbook(json_path, excel_path)
    print(f"Updated {sum(changes.values())} CAS_No cells in {excel_path}")
    print(f"Changes by sheet: {changes}")


if __name__ == "__main__":
    main()
