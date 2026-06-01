# LN2 Inventory

This folder contains the LN2 cell line inventory page integrated into `NHOteam_Maintenance`.

## Pages URL

- Main inventory: `https://namyunmong.github.io/NHOteam_Maintenance/`
- LN2 inventory: `https://namyunmong.github.io/NHOteam_Maintenance/ln2-inventory/`

## Structure

```text
ln2-inventory/
├── index.html
├── styles.css
├── src/
│   ├── app.js
│   └── dataProvider.js
└── data/
    └── inventory.json
```

`data/inventory.json` keeps the LN2 inventory payload used by the static page. Replace that file when the LN2 data is regenerated.
