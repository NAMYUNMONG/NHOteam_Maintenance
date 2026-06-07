# NHOteam Maintenance

Static GitHub Pages dashboard for NHOteam lab inventory, LN2 cell stock tracking, and lab duties.

This branch is intentionally trimmed to the files required to render the web pages. Source Excel files, conversion scripts, backups, and development-only documents are not included in this branch.

## Pages

- `index.html` - main inventory dashboard and Lab Duties page.
- `ln2-inventory/index.html` - embedded LN2 Cell Stock page used by the main dashboard.

## Runtime Files

```text
.nojekyll
index.html
data/
  inventory.json
  roles.json
ln2-inventory/
  index.html
  styles.css
  data/inventory.json
  src/app.js
  src/dataProvider.js
```

## Local Preview

Run a static server from the repository root:

```powershell
python -m http.server 8083 --bind 127.0.0.1
```

If Python is not available, any static server can be used from the repository root.

Open:

```text
http://127.0.0.1:8083/
```

Do not open `index.html` directly from the file system. The page loads JSON files with `fetch`, so it must be served through a local server or GitHub Pages.

## Data Files

- `data/inventory.json` - inventory data for Chemical, Antibody/Protein, and Products pages.
- `data/roles.json` - Lab Duties assignments, guidelines, and Space arrangement data.
- `ln2-inventory/data/inventory.json` - LN2 cell stock inventory data.

## Updating Data

For browser edits on the main inventory page:

1. Edit in the web page.
2. Export JSON from the page.
3. Replace `data/inventory.json`.
4. Commit and push the updated JSON.

For Lab Duties edits:

1. Update `data/roles.json`.
2. Preview locally and verify the Lab Duties page.
3. Commit and push the updated JSON.

For LN2 Cell Stock edits:

1. Update or export `ln2-inventory/data/inventory.json`.
2. Preview `http://127.0.0.1:8083/ln2-inventory/`.
3. Commit and push the updated JSON.

## Validation

Recommended checks before pushing:

```powershell
node --check ln2-inventory\src\app.js
node --check ln2-inventory\src\dataProvider.js
```

Also verify these URLs return HTTP 200 in local preview:

- `http://127.0.0.1:8083/`
- `http://127.0.0.1:8083/data/inventory.json`
- `http://127.0.0.1:8083/data/roles.json`
- `http://127.0.0.1:8083/ln2-inventory/`
- `http://127.0.0.1:8083/ln2-inventory/data/inventory.json`

## Important Notes

- Keep `.nojekyll` so GitHub Pages serves static files without Jekyll processing.
- Keep JSON paths stable because the pages fetch them by relative path.
- Changes saved in browser `localStorage` are local drafts only. Commit JSON changes to update the shared site.
