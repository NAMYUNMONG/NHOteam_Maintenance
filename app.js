const STORAGE_KEY = "l1521_inventory_draft_v1";

const CATEGORY_COLUMNS = {
  Chemical: ["Category", "Item_ID", "Manufacturer", "Item_Name", "Cat_No", "Storage", "Opened_Date", "Quantity_Size", "Form_Type", "Requester", "Note"],
  Antibody: ["Category", "Item_ID", "Manufacturer", "Item_Name", "Cat_No", "Storage", "Location", "Opened_Date", "MW_kDa", "Requester", "Note"],
  Product: ["Category", "Item_ID", "Manufacturer", "Item_Name", "Cat_No", "Storage"],
};

const TABLE_COLUMNS = [
  "Category",
  "Item_ID",
  "Manufacturer",
  "Item_Name",
  "Cat_No",
  "Storage",
  "Location",
  "Opened_Date",
  "Quantity_Size",
  "Form_Type",
  "MW_kDa",
  "Requester",
  "Note",
];

const CATEGORY_PREFIX = {
  Chemical: "CHM",
  Antibody: "AB",
  Product: "PRD",
};

const HIDDEN_DISPLAY_COLUMNS = new Set(["Item_ID"]);

let sourceMeta = {};
let items = [];
let activeEditId = null;
let activeView = "Mainpage";

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value ?? "").trim();
}

function debounce(fn, delay = 160) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    sourceMeta = parsed.meta || {};
    items = parsed.items || [];
    $("lastUpdated").textContent = `${sourceMeta.source_file || "inventory.json"} (브라우저 임시 저장)`;
  } else {
    const response = await fetch("./data/inventory.json", { cache: "no-store" });
    const data = await response.json();
    sourceMeta = data.meta || {};
    items = data.items || [];
    $("lastUpdated").textContent = sourceMeta.source_file || "inventory.json";
  }
  buildStorageFilter();
  render();
}

function buildStorageFilter() {
  const storageValues = [...new Set(items.map((item) => normalize(item.Storage)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const select = $("storageFilter");
  const current = select.value;
  select.innerHTML = '<option value="">전체</option>' + storageValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  select.value = current;
}

function filteredItems() {
  const query = normalize($("searchInput").value).toLowerCase();
  const viewCategory = CATEGORY_COLUMNS[activeView] ? activeView : "";
  const category = viewCategory || $("categoryFilter").value;
  const storage = $("storageFilter").value;
  const sortKey = $("sortSelect").value;

  if (activeView === "Mainpage" && !query) {
    return [];
  }

  return items
    .filter((item) => {
      if (category && item.Category !== category) return false;
      if (storage && normalize(item.Storage) !== storage) return false;
      if (!query) return true;
      const haystack = Object.values(item).map((v) => normalize(v)).join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => normalize(a[sortKey]).localeCompare(normalize(b[sortKey]), "ko", { numeric: true }));
}

function renderStats() {
  const counts = { Chemical: 0, Antibody: 0, Product: 0 };
  for (const item of items) {
    if (counts[item.Category] !== undefined) counts[item.Category] += 1;
  }
  $("statTotal").textContent = items.length.toLocaleString("ko-KR");
  $("statChemical").textContent = counts.Chemical.toLocaleString("ko-KR");
  $("statAntibody").textContent = counts.Antibody.toLocaleString("ko-KR");
  $("statProduct").textContent = counts.Product.toLocaleString("ko-KR");
}

function renderTable() {
  const rows = filteredItems();
  const query = normalize($("searchInput").value);
  const prefix = CATEGORY_COLUMNS[activeView] ? `${activeView} ` : "";
  const columns = (CATEGORY_COLUMNS[activeView] || TABLE_COLUMNS).filter((col) => !HIDDEN_DISPLAY_COLUMNS.has(col));
  $("resultCount").textContent = `${prefix}검색 결과 ${rows.length.toLocaleString("ko-KR")}개`;

  const thead = $("inventoryTable").querySelector("thead");
  const tbody = $("inventoryTable").querySelector("tbody");

  thead.innerHTML = `<tr>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("")}<th>Edit</th></tr>`;

  if (rows.length === 0) {
    const emptyMessage = activeView === "Mainpage" && !query
      ? "검색어를 입력하면 결과가 표시됩니다."
      : "검색 결과가 없습니다.";
    tbody.innerHTML = `<tr><td colspan="${columns.length + 1}">${emptyMessage}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((item) => {
    const cells = columns.map((col) => {
      if (col === "Category") {
        return `<td><span class="badge ${escapeHtml(item.Category)}">${escapeHtml(item.Category)}</span></td>`;
      }
      return `<td>${escapeHtml(item[col] || "")}</td>`;
    }).join("");
    return `<tr class="row-${escapeHtml(item.Category)}">${cells}<td class="edit-cell"><button type="button" data-edit-id="${escapeHtml(item.Item_ID)}">Edit</button></td></tr>`;
  }).join("");

  tbody.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => openDialog(button.dataset.editId));
  });
}

function render() {
  renderViewState();
  renderStats();
  renderTable();
}

function setView(view) {
  activeView = CATEGORY_COLUMNS[view] ? view : "Mainpage";
  $("searchInput").value = "";
  render();
}

function renderViewState() {
  const viewCategory = CATEGORY_COLUMNS[activeView] ? activeView : "";
  const categoryLabel = $("categoryFilterLabel");
  const categoryFilter = $("categoryFilter");

  if (viewCategory) {
    categoryFilter.value = viewCategory;
    categoryFilter.disabled = true;
    categoryLabel.classList.add("locked-filter");
  } else {
    categoryFilter.disabled = false;
    categoryLabel.classList.remove("locked-filter");
  }

  document.querySelectorAll("[data-view]").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === activeView);
  });
}

function categoryFields(category) {
  return CATEGORY_COLUMNS[category] || CATEGORY_COLUMNS.Chemical;
}

function makeField(name, value, category) {
  const full = ["Item_Name", "Note"].includes(name) ? " full" : "";
  const readonly = name === "Item_ID" ? "readonly" : "";
  if (name === "Category") {
    return `<label class="${full}">
      <span>${name}</span>
      <select name="${name}" required>
        ${Object.keys(CATEGORY_COLUMNS).map((cat) => `<option value="${cat}" ${cat === value ? "selected" : ""}>${cat}</option>`).join("")}
      </select>
    </label>`;
  }
  if (name === "Note") {
    return `<label class="${full}">
      <span>${name}</span>
      <textarea name="${name}">${escapeHtml(value || "")}</textarea>
    </label>`;
  }
  return `<label class="${full}">
    <span>${name}</span>
    <input name="${name}" value="${escapeHtml(value || "")}" ${readonly} ${name === "Item_Name" ? "required" : ""} />
  </label>`;
}

function renderFormFields(item) {
  const category = item?.Category || "Chemical";
  const fields = categoryFields(category).filter((name) => !HIDDEN_DISPLAY_COLUMNS.has(name));
  const fieldValues = { ...item };
  if (!activeEditId) fieldValues.Item_ID = nextItemId(category);
  $("formFields").innerHTML = fields.map((name) => makeField(name, fieldValues?.[name] || "", category)).join("");
  const categorySelect = $("formFields").querySelector('select[name="Category"]');
  categorySelect.addEventListener("change", () => {
    const current = getFormObject();
    current.Category = categorySelect.value;
    if (!activeEditId) current.Item_ID = nextItemId(current.Category);
    renderFormFields(current);
  });
}

function openDialog(itemId = null) {
  activeEditId = itemId;
  const item = itemId ? items.find((entry) => entry.Item_ID === itemId) : { Category: "Chemical", Item_ID: nextItemId("Chemical") };
  $("dialogTitle").textContent = itemId ? "항목 편집" : "신규 항목 추가";
  $("deleteItemBtn").style.display = itemId ? "inline-flex" : "none";
  renderFormFields(item);
  $("itemDialog").showModal();
}

function closeDialog() {
  $("itemDialog").close();
  activeEditId = null;
}

function getFormObject() {
  const data = {};
  new FormData($("itemForm")).forEach((value, key) => {
    data[key] = normalize(value);
  });
  return data;
}

function nextItemId(category) {
  const prefix = CATEGORY_PREFIX[category] || "ITM";
  const numbers = items
    .filter((item) => item.Item_ID && item.Item_ID.startsWith(prefix + "-"))
    .map((item) => Number(item.Item_ID.split("-")[1]))
    .filter((num) => Number.isFinite(num));
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

function saveItem(event) {
  event.preventDefault();
  const formData = getFormObject();
  const category = formData.Category || "Chemical";
  const allowedFields = categoryFields(category);
  const item = {};
  for (const key of TABLE_COLUMNS) item[key] = "";
  for (const key of allowedFields) item[key] = formData[key] || "";
  item.Category = category;

  if (activeEditId) {
    const index = items.findIndex((entry) => entry.Item_ID === activeEditId);
    if (index >= 0) {
      item.Item_ID = activeEditId;
      items[index] = { ...items[index], ...item };
    }
  } else {
    item.Item_ID = item.Item_ID || nextItemId(category);
    items.push(item);
  }

  localSave(false);
  buildStorageFilter();
  render();
  closeDialog();
}

function deleteActiveItem() {
  if (!activeEditId) return;
  const item = items.find((entry) => entry.Item_ID === activeEditId);
  if (!confirm(`${item?.Item_Name || activeEditId} 항목을 삭제할까요?`)) return;
  items = items.filter((entry) => entry.Item_ID !== activeEditId);
  localSave(false);
  buildStorageFilter();
  render();
  closeDialog();
}

function localSave(showAlert = true) {
  const payload = {
    meta: {
      ...sourceMeta,
      updated_in_browser_at: new Date().toISOString(),
      record_count: items.length,
    },
    items,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  $("lastUpdated").textContent = `${sourceMeta.source_file || "inventory.json"} (브라우저 임시 저장 완료)`;
  if (showAlert) alert("현재 브라우저에 임시 저장했습니다. 팀 전체 반영은 JSON 다운로드 후 GitHub에 커밋해야 합니다.");
}

function resetLocal() {
  if (!confirm("브라우저 임시 저장 데이터를 삭제하고 원본 JSON을 다시 불러올까요?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function downloadText(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadJson() {
  const payload = {
    meta: {
      ...sourceMeta,
      exported_at: new Date().toISOString(),
      record_count: items.length,
      categories: countByCategory(),
    },
    items,
  };
  downloadText("inventory.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function csvEscape(value) {
  const str = normalize(value);
  return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
}

function downloadCsv() {
  const lines = [TABLE_COLUMNS.join(",")];
  for (const item of items) {
    lines.push(TABLE_COLUMNS.map((col) => csvEscape(item[col])).join(","));
  }
  downloadText("inventory.csv", "\uFEFF" + lines.join("\n"), "text/csv;charset=utf-8");
}

function countByCategory() {
  return items.reduce((acc, item) => {
    acc[item.Category] = (acc[item.Category] || 0) + 1;
    return acc;
  }, {});
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quote && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quote = !quote;
    } else if (char === "," && !quote) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quote) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  const headers = rows.shift().map(normalize);
  return rows.map((line) => Object.fromEntries(headers.map((header, index) => [header, normalize(line[index])]))); 
}

async function handleUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  let imported = [];
  const lower = file.name.toLowerCase();

  try {
    if (lower.endsWith(".json")) {
      const text = await file.text();
      const parsed = JSON.parse(text);
      imported = Array.isArray(parsed) ? parsed : parsed.items || [];
    } else if (lower.endsWith(".csv")) {
      imported = parseCsv(await file.text());
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      imported = await parseExcel(file);
    } else {
      alert("지원하지 않는 파일 형식입니다.");
      return;
    }

    if (!imported.length) {
      alert("가져올 항목이 없습니다.");
      return;
    }
    mergeItems(imported);
  } catch (error) {
    console.error(error);
    alert("파일을 읽는 중 오류가 발생했습니다. Excel 업로드는 인터넷 연결과 SheetJS CDN 로딩이 필요합니다.");
  } finally {
    event.target.value = "";
  }
}

async function parseExcel(file) {
  if (!window.XLSX) {
    throw new Error("XLSX library is not loaded.");
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const imported = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const categoryFromSheet = Object.keys(CATEGORY_COLUMNS).find((category) => sheetName.toLowerCase().includes(category.toLowerCase()));
    for (const row of rows) {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[normalize(key)] = normalize(value);
      }
      normalized.Category = normalized.Category || categoryFromSheet || "Product";
      if (normalized.Item_Name || normalized.Cat_No) imported.push(normalized);
    }
  }
  return imported;
}

function mergeItems(imported) {
  let added = 0;
  let updated = 0;

  for (const raw of imported) {
    const category = raw.Category || "Product";
    const cleanItem = {};
    for (const key of TABLE_COLUMNS) cleanItem[key] = normalize(raw[key]);
    cleanItem.Category = category;
    cleanItem.Item_ID = cleanItem.Item_ID || nextItemId(category);

    if (!cleanItem.Item_Name && !cleanItem.Cat_No) continue;

    const index = items.findIndex((item) => item.Item_ID === cleanItem.Item_ID);
    if (index >= 0) {
      items[index] = { ...items[index], ...cleanItem };
      updated += 1;
    } else {
      items.push(cleanItem);
      added += 1;
    }
  }

  localSave(false);
  buildStorageFilter();
  render();
  alert(`업로드 병합 완료: 추가 ${added}개, 업데이트 ${updated}개`);
}

function initEvents() {
  const rerender = debounce(render);
  ["searchInput", "categoryFilter", "storageFilter", "sortSelect"].forEach((id) => {
    $(id).addEventListener("input", rerender);
    $(id).addEventListener("change", rerender);
  });

  $("sidebarToggle").addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("sidebar-collapsed");
    $("sidebarToggle").setAttribute("aria-expanded", String(!collapsed));
  });

  document.querySelectorAll("[data-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const view = link.dataset.view;
      const href = link.getAttribute("href") || `#${view.toLowerCase()}`;
      history.replaceState(null, "", href);
      setView(view);
    });
  });

  $("addItemBtn").addEventListener("click", () => openDialog());
  $("fileInput").addEventListener("change", handleUpload);

  $("itemForm").addEventListener("submit", saveItem);
  $("deleteItemBtn").addEventListener("click", deleteActiveItem);
  $("cancelBtn").addEventListener("click", closeDialog);
  $("closeDialogBtn").addEventListener("click", closeDialog);
}

document.addEventListener("DOMContentLoaded", async () => {
  initEvents();
  const hashView = {
    "#chemical": "Chemical",
    "#antibody": "Antibody",
    "#product": "Product",
  }[window.location.hash.toLowerCase()];
  if (hashView) activeView = hashView;
  try {
    await loadData();
  } catch (error) {
    console.error(error);
    $("lastUpdated").textContent = "데이터를 불러오지 못했습니다. 로컬 서버로 실행했는지 확인하세요.";
    alert("data/inventory.json을 불러오지 못했습니다. index.html을 직접 더블클릭하지 말고 로컬 서버 또는 GitHub Pages에서 실행하세요.");
  }
});
