#!/usr/bin/env python3
"""
Normalize Manufacturer values in Inventory_Master_CategoryTabs_V4.xlsx.

Usage:
    python scripts/normalize_categorytabs_excel.py <input-output.xlsx>

This edits only the Manufacturer column in Chemical, Antibody, and Product sheets.
It uses the XLSX zip/XML structure directly, so it does not require openpyxl.
"""
from __future__ import annotations

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


def col_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
    return idx - 1


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


def normalize_workbook(path: Path) -> dict[str, int]:
    with zipfile.ZipFile(path, "r") as zf:
        files = {name: zf.read(name) for name in zf.namelist()}

    shared_root = ET.fromstring(files["xl/sharedStrings.xml"])
    shared = ["".join(t.text or "" for t in item.iter(NS + "t")) for item in shared_root]

    with zipfile.ZipFile(path, "r") as zf:
        sheet_paths = workbook_sheet_paths(zf)

    changes: dict[str, int] = {}
    for sheet_name, sheet_path in sheet_paths.items():
        root = ET.fromstring(files[sheet_path])
        rows = root.findall(NS + "sheetData/" + NS + "row")
        if not rows:
            continue

        header_cells = rows[0].findall(NS + "c")
        manufacturer_col = None
        for cell in header_cells:
            if get_cell_text(cell, shared).strip() == "Manufacturer":
                manufacturer_col = col_index(cell.attrib["r"])
                break
        if manufacturer_col is None:
            continue

        count = 0
        for row in rows[1:]:
            for cell in row.findall(NS + "c"):
                if col_index(cell.attrib["r"]) != manufacturer_col:
                    continue
                raw = get_cell_text(cell, shared).strip()
                if sheet_name == "Chemical" and raw.lower() in {"biacore", "(cytiva)biacore"}:
                    normalized = "Cytiva"
                else:
                    normalized = MANUFACTURER_MAP.get(raw.lower())
                if normalized and normalized != raw:
                    idx = ensure_shared_string(shared_root, shared, normalized)
                    set_shared_string(cell, idx)
                    count += 1
                break
        if count:
            files[sheet_path] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            changes[sheet_name] = count

    files["xl/sharedStrings.xml"] = ET.tostring(shared_root, encoding="utf-8", xml_declaration=True)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        tmp_path = Path(tmp.name)
    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as out:
            for name, content in files.items():
                out.writestr(name, content)
        shutil.move(str(tmp_path), path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

    return changes


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(1)
    path = Path(sys.argv[1])
    if not path.exists():
        raise SystemExit(f"Input file not found: {path}")
    changes = normalize_workbook(path)
    total = sum(changes.values())
    print(f"Updated {total} Manufacturer cells in {path}")
    print(f"Changes by sheet: {changes}")


if __name__ == "__main__":
    main()
