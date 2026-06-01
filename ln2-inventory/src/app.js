import { loadInventoryData } from './dataProvider.js';

const STORAGE_KEY = 'ln2_inventory_draft_v2';
const COLUMN_WIDTH_KEY = 'ln2_inventory_column_widths_v1';
const STOCK_FIELDS = ['cellLine', 'tissue', 'date', 'passage', 'depositor', 'note'];
const TABLE_COLUMNS = [
  { key: 'location', width: 150, min: 120, max: 240 },
  { key: 'cellLine', width: 180, min: 120, max: 320 },
  { key: 'tissue', width: 110, min: 80, max: 220 },
  { key: 'date', width: 96, min: 86, max: 150 },
  { key: 'passage', width: 82, min: 68, max: 140 },
  { key: 'depositor', width: 112, min: 88, max: 200 },
  { key: 'note', width: 220, min: 120, max: 420 },
];

const els = {
  sourceInfo: document.querySelector('#sourceInfo'),
  totalSlots: document.querySelector('#totalSlots'),
  occupiedSlots: document.querySelector('#occupiedSlots'),
  emptySlots: document.querySelector('#emptySlots'),
  utilization: document.querySelector('#utilization'),
  cellLineCount: document.querySelector('#cellLineCount'),
  queryInput: document.querySelector('#queryInput'),
  rackFilter: document.querySelector('#rackFilter'),
  boxFilter: document.querySelector('#boxFilter'),
  depositorFilter: document.querySelector('#depositorFilter'),
  statusFilter: document.querySelector('#statusFilter'),
  rackToggle: document.querySelector('#rackToggle'),
  rackOverview: document.querySelector('#rackOverview'),
  mapRackSelect: document.querySelector('#mapRackSelect'),
  mapBoxSelect: document.querySelector('#mapBoxSelect'),
  selectedBoxLabel: document.querySelector('#selectedBoxLabel'),
  boxMap: document.querySelector('#boxMap'),
  selectedWellCount: document.querySelector('#selectedWellCount'),
  addStockBtn: document.querySelector('#addStockBtn'),
  editStockBtn: document.querySelector('#editStockBtn'),
  deleteStockBtn: document.querySelector('#deleteStockBtn'),
  clearSelectionBtn: document.querySelector('#clearSelectionBtn'),
  wellDetails: document.querySelector('#wellDetails'),
  inventoryBody: document.querySelector('#inventoryBody'),
  tableCols: document.querySelector('#ln2TableCols'),
  resultCount: document.querySelector('#resultCount'),
  refreshBtn: document.querySelector('#refreshBtn'),
  exportCsvBtn: document.querySelector('#exportCsvBtn'),
  exportJsonBtn: document.querySelector('#exportJsonBtn'),
  stockDialog: document.querySelector('#stockDialog'),
  stockForm: document.querySelector('#stockForm'),
  stockDialogTitle: document.querySelector('#stockDialogTitle'),
  stockDialogSummary: document.querySelector('#stockDialogSummary'),
  closeStockDialogBtn: document.querySelector('#closeStockDialogBtn'),
  cancelStockBtn: document.querySelector('#cancelStockBtn'),
  emptyState: document.querySelector('#emptyStateTemplate'),
};
let columnWidths = loadColumnWidths();

const state = {
  data: null,
  selectedRack: '',
  selectedBox: '',
  selectedWellIds: new Set(),
  filtered: [],
  dialogMode: 'add',
};

function fmt(n) {
  return new Intl.NumberFormat('ko-KR').format(n ?? 0);
}

function locationText(record) {
  return `T${record.tank} · ${record.rack} · Box ${record.box} · Well ${String(record.well).padStart(3, '0')}`;
}

function normalize(value) {
  return String(value ?? '').trim();
}

function loadColumnWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMN_WIDTH_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch (error) {
    return {};
  }
}

function saveColumnWidths() {
  localStorage.setItem(COLUMN_WIDTH_KEY, JSON.stringify(columnWidths));
}

function getColumnWidth(column) {
  const saved = Number(columnWidths[column.key]);
  const width = Number.isFinite(saved) ? saved : column.width;
  return Math.min(column.max, Math.max(column.min, width));
}

function renderTableColumns() {
  if (!els.tableCols) return;
  els.tableCols.innerHTML = TABLE_COLUMNS.map((column) => `<col data-col="${column.key}" style="width:${getColumnWidth(column)}px">`).join('');
}

function bindColumnResize() {
  const table = els.inventoryBody?.closest('table');
  if (!table) return;
  const definitions = Object.fromEntries(TABLE_COLUMNS.map((column) => [column.key, column]));
  table.querySelectorAll('thead th[data-col]').forEach((th) => {
    const column = definitions[th.dataset.col];
    if (!column || th.querySelector('.col-resizer')) return;
    th.style.position = 'relative';
    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    th.appendChild(resizer);
    let startX = 0;
    let startW = 0;
    let colEl = null;
    resizer.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      startX = event.pageX;
      colEl = table.querySelector(`col[data-col="${th.dataset.col}"]`);
      startW = colEl ? colEl.getBoundingClientRect().width : th.getBoundingClientRect().width;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const onMove = (moveEvent) => {
        const width = Math.min(column.max, Math.max(column.min, startW + moveEvent.pageX - startX));
        if (colEl) colEl.style.width = `${width}px`;
      };
      const onUp = () => {
        if (colEl) {
          const width = Number.parseFloat(colEl.style.width);
          if (Number.isFinite(width)) {
            columnWidths[th.dataset.col] = Math.round(width);
            saveColumnWidths();
          }
        }
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

function fillSelect(select, values, firstLabel = '전체') {
  const current = select.value;
  select.innerHTML = '';
  if (firstLabel !== null) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = firstLabel;
    select.appendChild(opt);
  }
  values.forEach((value) => {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = String(value);
    select.appendChild(opt);
  });
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

function selectedRecords() {
  if (!state.selectedWellIds.size) return [];
  return state.data.records.filter((record) => state.selectedWellIds.has(record.id));
}

function stockSnapshot(record) {
  return Object.fromEntries(STOCK_FIELDS.map((field) => [field, normalize(record[field])]));
}

function sameStockInfo(records) {
  if (!records.length) return false;
  const first = JSON.stringify(stockSnapshot(records[0]));
  return records.every((record) => JSON.stringify(stockSnapshot(record)) === first);
}

function recalculateData() {
  const records = state.data.records;
  const occupied = records.filter((record) => record.occupied);
  const racks = [...new Set(records.map((record) => record.rack).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const boxes = [...new Set(records.map((record) => Number(record.box)).filter(Number.isFinite))].sort((a, b) => a - b);
  const depositors = [...new Set(occupied.map((record) => normalize(record.depositor)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  const cellLines = [...new Set(occupied.map((record) => normalize(record.cellLine)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  const byBox = groupBy(records, (record) => `${record.tank}|${record.rack}|${record.box}`);
  const boxSummary = [...byBox.entries()].map(([key, items]) => {
    const [tank, rack, box] = key.split('|');
    const boxOccupied = items.filter((item) => item.occupied);
    return {
      tank: Number(tank),
      rack,
      box: Number(box),
      totalSlots: items.length,
      occupiedSlots: boxOccupied.length,
      emptySlots: items.length - boxOccupied.length,
      utilization: items.length ? Math.round((boxOccupied.length / items.length) * 1000) / 10 : 0,
      cellLineCount: new Set(boxOccupied.map((item) => item.cellLine).filter(Boolean)).size,
    };
  }).sort((a, b) => a.tank - b.tank || a.rack.localeCompare(b.rack, 'en', { numeric: true }) || a.box - b.box);

  const byCell = groupBy(occupied, (record) => record.cellLine);
  const cellLineSummary = [...byCell.entries()].map(([cellLine, items]) => {
    const dates = items.map((item) => item.date).filter(Boolean).sort();
    return {
      cellLine,
      tissue: items.find((item) => item.tissue)?.tissue || '',
      vialCount: items.length,
      boxCount: new Set(items.map((item) => `T${item.tank} ${item.rack}-B${item.box}`)).size,
      locations: [...new Set(items.map((item) => `T${item.tank} ${item.rack}-B${item.box}`))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
      depositors: [...new Set(items.map((item) => item.depositor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
      oldestDate: dates[0] || '',
      latestDate: dates.at(-1) || '',
    };
  }).sort((a, b) => b.vialCount - a.vialCount || a.cellLine.localeCompare(b.cellLine, 'en', { numeric: true }));

  state.data.summary = {
    ...state.data.summary,
    totalSlots: records.length,
    occupiedSlots: occupied.length,
    emptySlots: records.length - occupied.length,
    utilization: records.length ? Math.round((occupied.length / records.length) * 1000) / 10 : 0,
    tankCount: new Set(records.map((record) => record.tank)).size,
    rackCount: racks.length,
    boxCount: boxSummary.length,
    cellLineCount: cellLines.length,
    depositorCount: depositors.length,
  };
  state.data.options = { ...state.data.options, racks, boxes, depositors, cellLines };
  state.data.boxSummary = boxSummary;
  state.data.cellLineSummary = cellLineSummary;
  state.data.meta = {
    ...state.data.meta,
    updatedInBrowserAt: new Date().toISOString(),
  };
}

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function loadDraft(baseData) {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return baseData;
  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed.records) && parsed.records.length === baseData.records.length) return parsed;
  } catch (error) {
    console.warn('Failed to load LN2 draft', error);
  }
  return baseData;
}

function renderSummary() {
  const { summary, meta } = state.data;
  els.totalSlots.textContent = fmt(summary.totalSlots);
  els.occupiedSlots.textContent = fmt(summary.occupiedSlots);
  els.emptySlots.textContent = fmt(summary.emptySlots);
  els.utilization.textContent = `${summary.utilization}%`;
  els.cellLineCount.textContent = fmt(summary.cellLineCount);
  const generated = meta.generatedAt ? new Date(meta.generatedAt).toLocaleString('ko-KR') : '-';
  const draft = meta.updatedInBrowserAt ? ` · browser draft ${new Date(meta.updatedInBrowserAt).toLocaleString('ko-KR')}` : '';
  els.sourceInfo.textContent = `Source: ${meta.sourceFile} / ${meta.sourceSheet} · generated ${generated}${draft} · 정적 JSON 기반`;
}

function initializeFilters() {
  const { options } = state.data;
  fillSelect(els.rackFilter, options.racks);
  fillSelect(els.boxFilter, options.boxes);
  fillSelect(els.depositorFilter, options.depositors);
  fillSelect(els.mapRackSelect, options.racks, null);
  fillSelect(els.mapBoxSelect, options.boxes, null);
  state.selectedRack = options.racks[0] || '';
  state.selectedBox = String(options.boxes[0] || '');
  els.mapRackSelect.value = state.selectedRack;
  els.mapBoxSelect.value = state.selectedBox;
}

function refreshFilterOptions() {
  fillSelect(els.rackFilter, state.data.options.racks);
  fillSelect(els.boxFilter, state.data.options.boxes);
  fillSelect(els.depositorFilter, state.data.options.depositors);
}

function getFilters() {
  return {
    q: els.queryInput.value.trim().toLowerCase(),
    rack: els.rackFilter.value,
    box: els.boxFilter.value,
    depositor: els.depositorFilter.value,
    status: els.statusFilter.value,
  };
}

function applyFilters() {
  const filters = getFilters();
  const filtered = state.data.records.filter((record) => {
    if (filters.rack && record.rack !== filters.rack) return false;
    if (filters.box && String(record.box) !== filters.box) return false;
    if (filters.depositor && record.depositor !== filters.depositor) return false;
    if (filters.status === 'occupied' && !record.occupied) return false;
    if (filters.status === 'empty' && record.occupied) return false;
    if (filters.q) {
      const haystack = [
        record.id,
        locationText(record),
        record.cellLine,
        record.tissue,
        record.date,
        record.passage,
        record.depositor,
        record.note,
      ].join(' ').toLowerCase();
      if (!haystack.includes(filters.q)) return false;
    }
    return true;
  });
  filtered.sort((a, b) => a.tank - b.tank || a.rack.localeCompare(b.rack, 'en', { numeric: true }) || a.box - b.box || a.well - b.well);
  state.filtered = filtered;
  renderTable(filtered);
}

function renderRackToggle() {
  els.rackToggle.innerHTML = '';
  state.data.options.racks.forEach((rack) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = rack;
    button.className = rack === state.selectedRack ? 'active' : '';
    button.setAttribute('aria-pressed', rack === state.selectedRack ? 'true' : 'false');
    button.addEventListener('click', () => selectRack(rack));
    els.rackToggle.appendChild(button);
  });
}

function renderRackOverview() {
  renderRackToggle();
  const byRack = Map.groupBy ? Map.groupBy(state.data.boxSummary, (box) => box.rack) : groupBy(state.data.boxSummary, (box) => box.rack);
  const rack = state.selectedRack || state.data.options.racks[0] || '';
  const boxItems = byRack.get(rack) || [];
  els.rackOverview.innerHTML = '';

  const card = document.createElement('article');
  card.className = 'rack-card';
  card.innerHTML = `<h3>${rack}</h3><div class="box-chips"></div>`;
  const chips = card.querySelector('.box-chips');
  boxItems.forEach((box) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `box-chip ${box.occupiedSlots === 0 ? 'empty' : ''} ${box.emptySlots === 0 ? 'full' : ''}`;
    if (rack === state.selectedRack && String(box.box) === String(state.selectedBox)) chip.classList.add('active');
    chip.innerHTML = `<span>B${box.box}</span><small>${box.occupiedSlots}/${box.totalSlots}</small>`;
    chip.addEventListener('click', () => selectBox(rack, box.box));
    chips.appendChild(chip);
  });
  els.rackOverview.appendChild(card);
}

function groupBy(items, getter) {
  const map = new Map();
  items.forEach((item) => {
    const key = getter(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

function selectRack(rack) {
  const boxes = state.data.boxSummary
    .filter((item) => item.rack === rack)
    .map((item) => String(item.box));
  const nextBox = boxes.includes(String(state.selectedBox)) ? state.selectedBox : boxes[0] || '';
  selectBox(rack, nextBox);
}

function selectBox(rack, box) {
  state.selectedRack = rack;
  state.selectedBox = String(box);
  state.selectedWellIds.clear();
  els.mapRackSelect.value = rack;
  els.mapBoxSelect.value = String(box);
  renderRackOverview();
  renderBoxMap();
}

function toggleWell(record) {
  if (state.selectedWellIds.has(record.id)) {
    state.selectedWellIds.delete(record.id);
  } else {
    state.selectedWellIds.add(record.id);
  }
  renderBoxMap();
  renderWellDetails();
}

function renderBoxMap() {
  const rack = state.selectedRack;
  const box = String(state.selectedBox);
  els.selectedBoxLabel.textContent = rack && box ? `${rack} · Box ${box}` : '-';
  const wells = state.data.records
    .filter((record) => record.rack === rack && String(record.box) === box)
    .sort((a, b) => a.well - b.well);
  els.boxMap.innerHTML = '';
  wells.forEach((record) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `well ${record.occupied ? 'occupied' : 'empty'} ${state.selectedWellIds.has(record.id) ? 'selected' : ''}`;
    btn.title = `${locationText(record)} ${record.cellLine || 'Empty'}`;
    btn.textContent = record.well;
    btn.addEventListener('click', () => toggleWell(record));
    els.boxMap.appendChild(btn);
  });
  renderSelectionToolbar();
  if (!state.selectedWellIds.size) renderWellDetails();
}

function renderSelectionToolbar() {
  const records = selectedRecords();
  const count = records.length;
  const sameInfo = sameStockInfo(records);
  const hasOccupied = records.some((record) => record.occupied);
  const allEmpty = records.length > 0 && records.every((record) => !record.occupied);

  els.selectedWellCount.textContent = `${fmt(count)} selected`;
  els.addStockBtn.disabled = count === 0 || !allEmpty;
  els.editStockBtn.disabled = count === 0 || !sameInfo || !hasOccupied;
  els.deleteStockBtn.disabled = count === 0 || !hasOccupied;
  els.clearSelectionBtn.disabled = count === 0;
  els.editStockBtn.title = count && !sameInfo ? '선택한 well의 Cell stock 정보가 모두 같을 때만 수정할 수 있습니다.' : '';
  els.addStockBtn.title = count && !allEmpty ? '비어 있는 well만 선택했을 때 Cell stock을 추가할 수 있습니다.' : '';
}

function renderWellDetails() {
  const records = selectedRecords();
  if (!records.length) {
    const summary = state.data.boxSummary.find((item) => item.rack === state.selectedRack && String(item.box) === String(state.selectedBox));
    els.wellDetails.innerHTML = summary
      ? `<strong>${state.selectedRack} Box ${state.selectedBox}</strong><br>${summary.occupiedSlots}/${summary.totalSlots} occupied · ${summary.utilization}% used · ${summary.cellLineCount} cell lines`
      : '선택한 Box 정보를 찾을 수 없습니다.';
    return;
  }

  if (records.length === 1) {
    const record = records[0];
    els.wellDetails.innerHTML = record.occupied
      ? `<strong>${locationText(record)}</strong><br>
        <span class="badge">${escapeHtml(record.cellLine)}</span>
        ${record.tissue ? `<span class="muted"> · ${escapeHtml(record.tissue)}</span>` : ''}<br>
        Date: ${escapeHtml(record.date || '-')} · Passage: ${escapeHtml(record.passage || '-')} · Depositor: ${escapeHtml(record.depositor || '-')}<br>
        Note: ${escapeHtml(record.note || '-')}`
      : `<strong>${locationText(record)}</strong><br>빈 위치입니다.`;
    return;
  }

  const occupiedCount = records.filter((record) => record.occupied).length;
  const sameInfo = sameStockInfo(records);
  els.wellDetails.innerHTML = `<strong>${fmt(records.length)} wells selected</strong><br>${fmt(occupiedCount)} occupied · ${fmt(records.length - occupiedCount)} empty<br>${sameInfo ? '선택한 well의 Cell stock 정보가 같습니다.' : '선택한 well의 Cell stock 정보가 서로 다릅니다.'}`;
}

function openStockDialog(mode) {
  const records = selectedRecords();
  if (!records.length) return;
  if (mode === 'edit' && (!sameStockInfo(records) || !records.some((record) => record.occupied))) return;
  state.dialogMode = mode;
  els.stockDialogTitle.textContent = mode === 'add' ? 'Cell stock 추가' : 'Cell stock 정보 수정';
  els.stockDialogSummary.textContent = `${state.selectedRack} Box ${state.selectedBox} · ${fmt(records.length)} wells selected`;
  const defaults = mode === 'edit' ? stockSnapshot(records[0]) : { cellLine: '', tissue: '', date: '', passage: '', depositor: '', note: '' };
  STOCK_FIELDS.forEach((field) => {
    const input = els.stockForm.elements[field];
    if (input) input.value = defaults[field] || '';
  });
  els.stockDialog.showModal();
}

function closeStockDialog() {
  els.stockDialog.close();
}

function getStockFormValues() {
  const form = new FormData(els.stockForm);
  return Object.fromEntries(STOCK_FIELDS.map((field) => [field, normalize(form.get(field))]));
}

function saveStock(event) {
  event.preventDefault();
  const records = selectedRecords();
  if (!records.length) return;
  const values = getStockFormValues();
  records.forEach((record) => {
    Object.assign(record, values, {
      rawDate: values.date,
      occupied: Boolean(values.cellLine),
    });
  });
  afterDataMutation();
  closeStockDialog();
}

function deleteSelectedStock() {
  const records = selectedRecords().filter((record) => record.occupied);
  if (!records.length) return;
  if (!confirm(`${fmt(records.length)}개 well의 Cell stock 정보를 삭제할까요?`)) return;
  records.forEach((record) => {
    Object.assign(record, {
      cellLine: '',
      tissue: '',
      date: '',
      rawDate: '',
      passage: '',
      depositor: '',
      note: '',
      occupied: false,
    });
  });
  afterDataMutation();
}

function afterDataMutation() {
  recalculateData();
  saveDraft();
  refreshFilterOptions();
  renderSummary();
  renderRackOverview();
  renderBoxMap();
  applyFilters();
  renderWellDetails();
}

function clearSelection() {
  state.selectedWellIds.clear();
  renderBoxMap();
  renderWellDetails();
}

function renderTable(rows) {
  els.inventoryBody.innerHTML = '';
  els.resultCount.textContent = `${fmt(rows.length)}개`;
  if (rows.length === 0) {
    els.inventoryBody.appendChild(els.emptyState.content.cloneNode(true));
    return;
  }
  const fragment = document.createDocumentFragment();
  rows.slice(0, 1000).forEach((record) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="location">${escapeHtml(locationText(record))}</td>
      <td>${record.occupied ? escapeHtml(record.cellLine) : '<span class="muted">Empty</span>'}</td>
      <td>${escapeHtml(record.tissue || '')}</td>
      <td>${escapeHtml(record.date || '')}</td>
      <td>${escapeHtml(record.passage || '')}</td>
      <td>${escapeHtml(record.depositor || '')}</td>
      <td>${escapeHtml(record.note || '')}</td>`;
    tr.addEventListener('click', () => {
      selectBox(record.rack, record.box);
      state.selectedWellIds.add(record.id);
      renderBoxMap();
      renderWellDetails();
    });
    fragment.appendChild(tr);
  });
  if (rows.length > 1000) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7" class="empty-state">성능을 위해 첫 1,000개만 표시합니다. 필터를 더 좁혀주세요.</td>`;
    fragment.appendChild(tr);
  }
  els.inventoryBody.appendChild(fragment);
}

function exportFilteredCsv() {
  const headers = ['location', 'tank', 'rack', 'box', 'well', 'cellLine', 'tissue', 'date', 'passage', 'depositor', 'note', 'occupied'];
  const lines = [headers.join(',')];
  state.filtered.forEach((record) => {
    const row = [locationText(record), record.tank, record.rack, record.box, record.well, record.cellLine, record.tissue, record.date, record.passage, record.depositor, record.note, record.occupied]
      .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`);
    lines.push(row.join(','));
  });
  downloadText(`ln2_inventory_filtered_${new Date().toISOString().slice(0, 10)}.csv`, '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
}

function exportJson() {
  downloadText('inventory.json', JSON.stringify(state.data, null, 2), 'application/json;charset=utf-8');
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function init() {
  state.data = loadDraft(await loadInventoryData());
  recalculateData();
  renderTableColumns();
  bindColumnResize();
  renderSummary();
  initializeFilters();
  renderRackOverview();
  renderBoxMap();
  applyFilters();
}

['input', 'change'].forEach((eventName) => {
  [els.queryInput, els.rackFilter, els.boxFilter, els.depositorFilter, els.statusFilter].forEach((el) => {
    el.addEventListener(eventName, applyFilters);
  });
});
els.mapRackSelect.addEventListener('change', () => selectBox(els.mapRackSelect.value, els.mapBoxSelect.value));
els.mapBoxSelect.addEventListener('change', () => selectBox(els.mapRackSelect.value, els.mapBoxSelect.value));
els.refreshBtn.addEventListener('click', () => window.location.reload());
els.exportCsvBtn.addEventListener('click', exportFilteredCsv);
els.exportJsonBtn.addEventListener('click', exportJson);
els.addStockBtn.addEventListener('click', () => openStockDialog('add'));
els.editStockBtn.addEventListener('click', () => openStockDialog('edit'));
els.deleteStockBtn.addEventListener('click', deleteSelectedStock);
els.clearSelectionBtn.addEventListener('click', clearSelection);
els.stockForm.addEventListener('submit', saveStock);
els.closeStockDialogBtn.addEventListener('click', closeStockDialog);
els.cancelStockBtn.addEventListener('click', closeStockDialog);

init().catch((error) => {
  console.error(error);
  els.sourceInfo.textContent = '데이터를 불러오지 못했습니다. data/inventory.json 파일 경로를 확인하세요.';
});
