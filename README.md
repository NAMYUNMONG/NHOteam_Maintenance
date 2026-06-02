# NHOteam Lab Maintenance

Static GitHub Pages inventory dashboard for NHOteam lab maintenance.

This branch, `Lab_maintenance_V3_NYS`, uses a category-tab Excel workbook as the source of truth and generates `data/inventory.json` for the web page.

## Features

- Inventory pages for `Chemical`, `Antibody/Protein`, and `Products`
- Search across name, catalog number, CAS number, manufacturer, and other fields
- Filters for Subcategory, Storage, and Location
- Sortable and resizable table columns
- Sticky table header while scrolling
- Detail and edit side panel
- Multi-select order text generation
- JSON / Excel / CSV upload merge
- Browser local draft storage through `localStorage`
- CAS-based MSDS/SDS links through Sigma or PubChem
- EN / KR language toggle

## Main Files

- `index.html` - static web dashboard.
- `data/inventory.json` - generated JSON consumed by the web page.
- `source/Inventory_Master_CategoryTabs_V4.xlsx` - source workbook.
- `scripts/convert_categorytabs_to_json.py` - converts CategoryTabs Excel to the current web JSON schema.
- `scripts/normalize_categorytabs_excel.py` - normalizes Manufacturer names in the source workbook.
- `scripts/fetch_cas.py` - fills missing `CAS_No` values in `data/inventory.json` using PubChem/Sigma lookup.
- `scripts/update_categorytabs_excel_cas.py` - writes `CAS_No` values from JSON back into the CategoryTabs Excel workbook.
- `scripts/convert_excel_to_json.py` and `scripts/update_excel_cas.py` - legacy single-sheet `Inventory_Master_V*.xlsx` helpers.

## Preview

Run a local static server from the repository root:

```powershell
python -m http.server 8083 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8083/
```

Do not open `index.html` directly from the file system. The page fetches `data/inventory.json`, so it should be served through a local server or GitHub Pages.

## Data Model

The web page expects these category names:

- `Chemical`
- `Antibody/Protein`
- `Products`

The source workbook uses separate sheets:

- `Chemical`
- `Antibody`
- `Product`

During conversion:

- `Antibody` becomes `Antibody/Protein`
- `Product` becomes `Products`
- Missing web fields are filled with blank values, `null`, or `false`
- Antibody box-style locations such as `CST #1` are stored as `Sub_Location`

Current generated data:

| Category | Count |
|---|---:|
| Chemical | 353 |
| Antibody/Protein | 323 |
| Products | 205 |
| Total | 881 |

Current CAS coverage:

| Scope | Count |
|---|---:|
| Chemical/Products target items | 558 |
| CAS values found | 237 |
| Missing CAS values | 321 |

## Standard Update Workflow

1. Edit source data in:

```text
source/Inventory_Master_CategoryTabs_V4.xlsx
```

2. Normalize Manufacturer names:

```powershell
python scripts\normalize_categorytabs_excel.py source\Inventory_Master_CategoryTabs_V4.xlsx
```

3. Generate web JSON:

```powershell
python scripts\convert_categorytabs_to_json.py source\Inventory_Master_CategoryTabs_V4.xlsx data\inventory.json
```

4. Fill CAS numbers for web MSDS links:

```powershell
python scripts\fetch_cas.py data\inventory.json
```

5. Write CAS numbers back to the Excel source:

```powershell
python scripts\update_categorytabs_excel_cas.py data\inventory.json source\Inventory_Master_CategoryTabs_V4.xlsx
```

6. Regenerate JSON so Excel and JSON stay synchronized:

```powershell
python scripts\convert_categorytabs_to_json.py source\Inventory_Master_CategoryTabs_V4.xlsx data\inventory.json
```

7. Commit and push:

```powershell
git add index.html data/inventory.json source/Inventory_Master_CategoryTabs_V4.xlsx scripts README.md
git commit -m "Update inventory data"
git push origin Lab_maintenance_V3_NYS
```

## MSDS Links

The page does not fetch MSDS live in the browser. It uses `CAS_No` and `MSDS_URL` from `data/inventory.json`:

- If `MSDS_URL` exists, the page links to that URL.
- If `CAS_No` exists, the page generates a Sigma or PubChem SDS link.
- If neither exists, the table shows a missing MSDS state.

Run `scripts/fetch_cas.py` after adding or changing Chemical/Products items.

## Browser Edits

Edits made in the web page are saved in browser `localStorage` first. To update team data, export JSON from the page and commit the resulting `data/inventory.json`, or preferably update the Excel source and regenerate JSON through the workflow above.

## Important Rules

- `Item_ID` is the stable merge key. Do not change it casually.
- Keep the Excel source and `data/inventory.json` synchronized.
- After adding new Chemical/Products items, run CAS lookup and write CAS values back to Excel.
- Review generated CAS values before relying on SDS links for safety-critical use.
- GitHub Pages updates after branch push according to repository Pages settings.
