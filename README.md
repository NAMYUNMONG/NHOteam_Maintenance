# NHOteam Lab Maintenance

Static inventory dashboard for NHOteam lab maintenance.

This branch (`Lab_maintenance_V3_NYS`) uses a category-tab Excel workbook as the source data and publishes a generated JSON file for the web page.

## Preview

Run a local static server from the repository root:

```powershell
python -m http.server 8083 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8083/
```

Opening `index.html` directly from the file system is not recommended because the page fetches `data/inventory.json`.

## Main Files

- `index.html` - static web dashboard.
- `data/inventory.json` - JSON data consumed by the web page.
- `source/Inventory_Master_CategoryTabs_V4.xlsx` - source workbook.
- `scripts/convert_categorytabs_to_json.py` - converts the CategoryTabs Excel workbook to the current web JSON schema.
- `scripts/normalize_categorytabs_excel.py` - normalizes Manufacturer names in the source workbook.
- `scripts/fetch_cas.py` - fills missing `CAS_No` values in `data/inventory.json` using PubChem/Sigma lookup.
- `scripts/update_categorytabs_excel_cas.py` - writes `CAS_No` values from JSON back into the CategoryTabs Excel workbook.

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
- Missing web fields are filled with blank values, `null`, or `false` as appropriate
- Antibody box-style locations such as `CST #1` are stored as `Sub_Location`

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
git add index.html data/inventory.json source/Inventory_Master_CategoryTabs_V4.xlsx scripts
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

Edits made in the web page are saved in browser `localStorage` first. To update the team data, export JSON from the page and commit the resulting `data/inventory.json`, or preferably update the Excel source and regenerate JSON through the workflow above.

## Current Data Snapshot

The current generated JSON is based on `Inventory_Master_CategoryTabs_V4.xlsx` and contains:

- `Chemical`: 353 items
- `Antibody/Protein`: 323 items
- `Products`: 205 items
- Total: 881 items

CAS coverage after the latest automated lookup:

- Chemical/Products target items: 558
- CAS values found: 237
- Missing CAS values: 321
