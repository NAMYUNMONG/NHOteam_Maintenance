import { loadInventoryData } from './dataProvider.js';

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
  wellDetails: document.querySelector('#wellDetails'),
  inventoryBody: document.querySelector('#inventoryBody'),
  resultCount: document.querySelector('#resultCount'),
  refreshBtn: document.querySelector('#refreshBtn'),
  exportCsvBtn: document.querySelector('#exportCsvBtn'),
  emptyState: document.querySelector('#emptyStateTemplate'),
};

const state = {
  data: null,
  selectedRack: '',
  selectedBox: '',
  selectedWellId: '',
  filtered: [],
};

function fmt(n) {
  return new Intl.NumberFormat('ko-KR').format(n ?? 0);
}

function locationText(record) {
  return `T${record.tank} · ${record.rack} · Box ${record.box} · Well ${String(record.well).padStart(3, '0')}`;
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

function renderSummary() {
  const { summary, meta } = state.data;
  els.totalSlots.textContent = fmt(summary.totalSlots);
  els.occupiedSlots.textContent = fmt(summary.occupiedSlots);
  els.emptySlots.textContent = fmt(summary.emptySlots);
  els.utilization.textContent = `${summary.utilization}%`;
  els.cellLineCount.textContent = fmt(summary.cellLineCount);
  const generated = meta.generatedAt ? new Date(meta.generatedAt).toLocaleString('ko-KR') : '-';
  els.sourceInfo.textContent = `Source: ${meta.sourceFile} / ${meta.sourceSheet} · generated ${generated} · 정적 JSON 기반`;
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
  state.selectedWellId = '';
  els.mapRackSelect.value = rack;
  els.mapBoxSelect.value = String(box);
  renderRackOverview();
  renderBoxMap();
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
    btn.className = `well ${record.occupied ? 'occupied' : 'empty'} ${record.id === state.selectedWellId ? 'selected' : ''}`;
    btn.title = `${locationText(record)} ${record.cellLine || 'Empty'}`;
    btn.textContent = record.well;
    btn.addEventListener('click', () => {
      state.selectedWellId = record.id;
      renderBoxMap();
      renderWellDetails(record);
    });
    els.boxMap.appendChild(btn);
  });
  if (!state.selectedWellId) {
    const summary = state.data.boxSummary.find((item) => item.rack === rack && String(item.box) === box);
    els.wellDetails.innerHTML = summary
      ? `<strong>${rack} Box ${box}</strong><br>${summary.occupiedSlots}/${summary.totalSlots} occupied · ${summary.utilization}% used · ${summary.cellLineCount} cell lines`
      : '선택한 Box 정보를 찾을 수 없습니다.';
  }
}

function renderWellDetails(record) {
  els.wellDetails.innerHTML = record.occupied
    ? `<strong>${locationText(record)}</strong><br>
      <span class="badge">${escapeHtml(record.cellLine)}</span>
      ${record.tissue ? `<span class="muted"> · ${escapeHtml(record.tissue)}</span>` : ''}<br>
      Date: ${escapeHtml(record.date || '-')} · Passage: ${escapeHtml(record.passage || '-')} · Depositor: ${escapeHtml(record.depositor || '-')}<br>
      Note: ${escapeHtml(record.note || '-')}`
    : `<strong>${locationText(record)}</strong><br>빈 위치입니다.`;
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
    tr.addEventListener('click', () => selectBox(record.rack, record.box));
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
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ln2_inventory_filtered_${new Date().toISOString().slice(0, 10)}.csv`;
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
  state.data = await loadInventoryData();
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

init().catch((error) => {
  console.error(error);
  els.sourceInfo.textContent = '데이터를 불러오지 못했습니다. data/inventory.json 파일 경로를 확인하세요.';
});
