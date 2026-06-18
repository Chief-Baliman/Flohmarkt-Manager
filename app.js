import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
  serverTimestamp,
  goOnline,
  goOffline
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA5kq-HiCkVroQLCwwVc24C8XYPJTZvegM',
  authDomain: 'queue-tracker-3fa3c.firebaseapp.com',
  databaseURL: 'https://queue-tracker-3fa3c-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'queue-tracker-3fa3c',
  storageBucket: 'queue-tracker-3fa3c.firebasestorage.app',
  messagingSenderId: '132132188124',
  appId: '1:132132188124:web:ecc130f7ee7ac9d61be919',
  measurementId: 'G-3QBWJHGDXG'
};

const APP_ROOT = 'flohmarktManager';
const CACHE_KEY = 'ccfm_cache_v2';
const OWNER_UID = 'FMZW16NbeQXPKmVE50BcnbRYI2o1';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = (id) => document.getElementById(id);
const state = {
  user: null,
  products: {},
  sales: {},
  settings: { lowStockLimit: 2 },
  activeTab: 'sell',
  sort: 'name',
  online: navigator.onLine,
  remoteReady: false,
  saving: false,
  scanStream: null,
  scanTimer: null,
  lastScanned: ''
};

const money = (value) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const escapeHtml = (text = '') => String(text).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const productsArray = () => Object.values(state.products || {}).sort((a, b) => a.name.localeCompare(b.name, 'de'));
const salesArray = () => Object.values(state.sales || {}).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

function loadCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    state.products = cached.products || {};
    state.sales = cached.sales || {};
    state.settings = cached.settings || state.settings;
  } catch (error) {
    console.warn('Cache konnte nicht geladen werden', error);
  }
}

function saveCache() {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    products: state.products,
    sales: state.sales,
    settings: state.settings,
    savedAt: new Date().toISOString()
  }));
}

async function saveRemote() {
  if (!state.user || state.user.uid !== OWNER_UID) return;
  state.saving = true;
  setSyncStatus('Speichert...');
  const payload = {
    products: state.products,
    sales: state.sales,
    settings: state.settings,
    meta: {
      updatedAt: serverTimestamp(),
      updatedBy: state.user.email,
      version: '1.1.0'
    }
  };
  try {
    await set(ref(db, APP_ROOT), payload);
    saveCache();
    setSyncStatus('Synchronisiert');
  } catch (error) {
    console.error(error);
    setSyncStatus('Offline gespeichert');
    saveCache();
  } finally {
    state.saving = false;
  }
}

function setSyncStatus(text) {
  $('syncStatus').textContent = text;
  $('syncStatus').className = `status-pill ${state.online ? 'online' : 'offline'}`;
}

function showLogin(show) {
  $('loginView').classList.toggle('hidden', !show);
  $('mainView').classList.toggle('hidden', show);
}

function initAuth() {
  setPersistence(auth, browserLocalPersistence);
  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('loginError').textContent = '';
    try {
      await signInWithEmailAndPassword(auth, $('emailInput').value.trim(), $('passwordInput').value);
    } catch (error) {
      $('loginError').textContent = 'Login fehlgeschlagen. Bitte E-Mail und Passwort prüfen.';
    }
  });
  $('logoutBtn').addEventListener('click', () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    if (!user) {
      showLogin(true);
      return;
    }
    if (user.uid !== OWNER_UID) {
      await signOut(auth);
      $('loginError').textContent = 'Dieser Nutzer ist für diese App nicht freigeschaltet.';
      showLogin(true);
      return;
    }
    showLogin(false);
    startRealtimeSync();
    renderAll();
  });
}

function startRealtimeSync() {
  const rootRef = ref(db, APP_ROOT);
  onValue(rootRef, (snapshot) => {
    const data = snapshot.val();
    state.remoteReady = true;
    if (data) {
      state.products = data.products || {};
      state.sales = data.sales || {};
      state.settings = data.settings || state.settings;
      saveCache();
    } else if (Object.keys(state.products).length || Object.keys(state.sales).length) {
      saveRemote();
    }
    setSyncStatus(navigator.onLine ? 'Synchronisiert' : 'Offline');
    renderAll();
  }, (error) => {
    console.error(error);
    setSyncStatus('Keine Berechtigung');
  });
}

function bindNavigation() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTab = button.dataset.tab;
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === button));
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === state.activeTab));
      renderAll();
    });
  });
}

function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function levenshtein(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a) return b.length;
  if (!b) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function productMatches(product, query) {
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize(`${product.name} ${product.category} ${product.barcode || ''} ${product.notes || ''}`);
  if (hay.includes(q)) return true;
  return product.name.split(/\s+/).some((part) => levenshtein(part, q) <= Math.max(1, Math.floor(q.length / 4)));
}

function filteredProducts(query, options = {}) {
  let items = productsArray().filter((product) => productMatches(product, query));
  if (options.activeOnly) items = items.filter((p) => p.active !== false);
  if (options.category && options.category !== 'all') items = items.filter((p) => p.category === options.category);
  if (options.stockFilter === 'available') items = items.filter((p) => Number(p.stock) > 0 && p.active !== false);
  if (options.stockFilter === 'low') items = items.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= state.settings.lowStockLimit);
  if (options.stockFilter === 'out') items = items.filter((p) => Number(p.stock) <= 0);
  if (options.stockFilter === 'inactive') items = items.filter((p) => p.active === false);
  return items;
}

function renderAll() {
  renderCategories();
  renderSellResults();
  renderPriceList();
  renderStock();
  renderAdminProducts();
  renderSalesLog();
}

function renderCategories() {
  const categories = [...new Set(productsArray().map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const options = ['<option value="all">Alle Kategorien</option>', ...categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)].join('');
  if ($('priceCategory').innerHTML !== options) $('priceCategory').innerHTML = options;
  $('categoryList').innerHTML = categories.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
}

function productCard(product, mode) {
  const stockClass = Number(product.stock) <= 0 ? 'out' : Number(product.stock) <= state.settings.lowStockLimit ? 'low' : '';
  const inactive = product.active === false ? '<span class="tag muted-tag">Inaktiv</span>' : '';
  const image = product.image ? `<img class="thumb" src="${escapeHtml(product.image)}" alt="" loading="lazy" />` : '<div class="thumb placeholder">CC</div>';
  const sellControls = mode === 'sell' ? `
    <div class="sell-controls">
      <button class="qty-btn" data-sell="${product.id}" data-qty="1">-1</button>
      <button class="qty-btn" data-sell="${product.id}" data-qty="2">-2</button>
      <button class="qty-btn" data-sell="${product.id}" data-qty="5">-5</button>
    </div>` : '';
  const editButton = mode === 'admin' ? `<button class="secondary" data-edit="${product.id}">Bearbeiten</button>` : '';
  return `
    <article class="product-card ${stockClass}">
      ${image}
      <div class="product-main">
        <div class="product-title-row"><h3>${escapeHtml(product.name)}</h3>${inactive}</div>
        <div class="meta"><span>${escapeHtml(product.category || 'Ohne Kategorie')}</span>${product.barcode ? `<span>${escapeHtml(product.barcode)}</span>` : ''}</div>
        ${product.notes ? `<p class="notes">${escapeHtml(product.notes)}</p>` : ''}
      </div>
      <div class="product-side">
        <strong>${money(product.price)}</strong>
        <span class="stock-badge ${stockClass}">${Number(product.stock || 0)} Stk.</span>
        ${sellControls}${editButton}
      </div>
    </article>`;
}

function renderSellResults() {
  const query = $('sellSearch').value;
  const items = filteredProducts(query, { activeOnly: true }).slice(0, query ? 20 : 8);
  $('sellResults').innerHTML = items.length ? items.map((p) => productCard(p, 'sell')).join('') : '<div class="empty">Kein Produkt gefunden.</div>';
  document.querySelectorAll('[data-sell]').forEach((button) => button.addEventListener('click', () => sellProduct(button.dataset.sell, Number(button.dataset.qty))));
}

function renderPriceList() {
  const query = $('priceSearch').value;
  let items = filteredProducts(query, { activeOnly: true, category: $('priceCategory').value });
  if (state.sort === 'price') items.sort((a, b) => Number(a.price) - Number(b.price));
  if (state.sort === 'stock') items.sort((a, b) => Number(b.stock) - Number(a.stock));
  $('priceList').innerHTML = items.length ? items.map((p) => `
    <div class="price-row">
      <div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.category || '')}</small></div>
      <div class="price-values"><b>${money(p.price)}</b><span>${Number(p.stock || 0)} Stk.</span></div>
    </div>`).join('') : '<div class="empty">Keine Produkte in der Preisliste.</div>';
}

function renderStock() {
  const items = productsArray();
  $('statProducts').textContent = items.length;
  $('statUnits').textContent = items.reduce((sum, p) => sum + Number(p.stock || 0), 0);
  $('statLow').textContent = items.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= state.settings.lowStockLimit).length;
  $('statOut').textContent = items.filter((p) => Number(p.stock) <= 0).length;
  const filtered = filteredProducts($('stockSearch').value, { stockFilter: $('stockFilter').value });
  $('stockList').innerHTML = filtered.length ? filtered.map((p) => productCard(p, 'stock')).join('') : '<div class="empty">Keine passenden Bestände.</div>';
}

function renderAdminProducts() {
  const items = filteredProducts($('productSearch').value);
  $('adminProductList').innerHTML = items.length ? items.map((p) => productCard(p, 'admin')).join('') : '<div class="empty">Noch keine Produkte angelegt.</div>';
  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openProductDialog(button.dataset.edit)));
}

function renderSalesLog() {
  const sales = salesArray().slice(0, 60);
  $('salesLog').innerHTML = sales.length ? sales.map((sale) => `
    <div class="sale-row">
      <div><strong>${escapeHtml(sale.productName)}</strong><small>${new Date(sale.createdAt).toLocaleString('de-DE')}</small></div>
      <div><b>${sale.quantity}×</b><span>${money(sale.totalPrice)}</span></div>
    </div>`).join('') : '<div class="empty">Noch keine Verkäufe.</div>';
}

async function sellProduct(productId, quantity) {
  const product = state.products[productId];
  if (!product) return;
  const qty = Math.max(1, quantity);
  if (Number(product.stock) < qty) {
    flash(`Nicht genug Bestand für ${product.name}.`, true);
    return;
  }
  product.stock = Number(product.stock) - qty;
  product.updatedAt = new Date().toISOString();
  const saleId = uid();
  state.sales[saleId] = {
    id: saleId,
    productId,
    productName: product.name,
    quantity: qty,
    unitPrice: Number(product.price || 0),
    totalPrice: Number(product.price || 0) * qty,
    createdAt: new Date().toISOString()
  };
  flash(`${qty}× ${product.name} verkauft. Bestand: ${product.stock}`);
  renderAll();
  await saveRemote();
}

function flash(text, error = false) {
  const box = $('lastSale');
  box.textContent = text;
  box.className = `success-flash ${error ? 'error' : ''}`;
  setTimeout(() => box.classList.add('hidden'), 2600);
}

function openProductDialog(id = '') {
  const p = id ? state.products[id] : null;
  $('dialogTitle').textContent = p ? 'Produkt bearbeiten' : 'Produkt erstellen';
  $('productId').value = p?.id || '';
  $('nameField').value = p?.name || '';
  $('categoryField').value = p?.category || '';
  $('priceField').value = p?.price ?? '';
  $('costField').value = p?.cost ?? '';
  $('stockField').value = p?.stock ?? 1;
  $('barcodeField').value = p?.barcode || '';
  $('imageField').value = p?.image || '';
  $('notesField').value = p?.notes || '';
  $('activeField').checked = p?.active !== false;
  $('deleteProductBtn').classList.toggle('hidden', !p);
  $('productDialog').showModal();
}

async function saveProductFromForm(event) {
  event.preventDefault();
  const id = $('productId').value || uid();
  state.products[id] = {
    id,
    name: $('nameField').value.trim(),
    category: $('categoryField').value.trim() || 'Allgemein',
    price: Number($('priceField').value || 0),
    cost: $('costField').value === '' ? '' : Number($('costField').value),
    stock: Number($('stockField').value || 0),
    barcode: $('barcodeField').value.trim(),
    image: $('imageField').value.trim(),
    notes: $('notesField').value.trim(),
    active: $('activeField').checked,
    updatedAt: new Date().toISOString(),
    createdAt: state.products[id]?.createdAt || new Date().toISOString()
  };
  $('productDialog').close();
  renderAll();
  await saveRemote();
}

async function deleteCurrentProduct() {
  const id = $('productId').value;
  if (!id) return;
  if (!confirm('Produkt wirklich löschen?')) return;
  delete state.products[id];
  $('productDialog').close();
  renderAll();
  await saveRemote();
}

function bindForms() {
  $('newProductBtn').addEventListener('click', () => openProductDialog());
  $('closeDialogBtn').addEventListener('click', () => $('productDialog').close());
  $('productForm').addEventListener('submit', saveProductFromForm);
  $('deleteProductBtn').addEventListener('click', deleteCurrentProduct);
  ['sellSearch', 'priceSearch', 'stockSearch', 'productSearch'].forEach((id) => $(id).addEventListener('input', renderAll));
  ['priceCategory', 'stockFilter'].forEach((id) => $(id).addEventListener('change', renderAll));
  $('sortNameBtn').addEventListener('click', () => setSort('name'));
  $('sortPriceBtn').addEventListener('click', () => setSort('price'));
  $('sortStockBtn').addEventListener('click', () => setSort('stock'));
  $('manualBarcodeBtn').addEventListener('click', () => {
    const code = prompt('Barcode eingeben');
    if (code) {
      $('sellSearch').value = code.trim();
      renderSellResults();
      autoSellByBarcode(code.trim());
    }
  });
}

function setSort(sort) {
  state.sort = sort;
  $('sortNameBtn').classList.toggle('active', sort === 'name');
  $('sortPriceBtn').classList.toggle('active', sort === 'price');
  $('sortStockBtn').classList.toggle('active', sort === 'stock');
  renderPriceList();
}

function autoSellByBarcode(code) {
  const product = productsArray().find((p) => p.barcode && p.barcode === code && p.active !== false);
  if (product) sellProduct(product.id, 1);
}

async function startScanner() {
  if (!('BarcodeDetector' in window)) {
    alert('Dein Browser unterstützt den direkten Kamera-Barcode-Scan nicht. Nutze bitte die Barcode-Eingabe oder Chrome/Android.');
    return;
  }
  try {
    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    state.scanStream = stream;
    $('scanVideo').srcObject = stream;
    await $('scanVideo').play();
    $('scannerBox').classList.remove('hidden');
    state.scanTimer = setInterval(async () => {
      try {
        const codes = await detector.detect($('scanVideo'));
        const value = codes?.[0]?.rawValue;
        if (value && value !== state.lastScanned) {
          state.lastScanned = value;
          $('sellSearch').value = value;
          autoSellByBarcode(value);
          setTimeout(() => { state.lastScanned = ''; }, 1800);
        }
      } catch (error) {
        console.warn(error);
      }
    }, 450);
  } catch (error) {
    alert('Kamera konnte nicht geöffnet werden. Prüfe die Browser-Berechtigung.');
  }
}

function stopScanner() {
  clearInterval(state.scanTimer);
  state.scanTimer = null;
  state.scanStream?.getTracks().forEach((track) => track.stop());
  state.scanStream = null;
  $('scannerBox').classList.add('hidden');
}

function bindScanner() {
  $('scanBtn').addEventListener('click', startScanner);
  $('stopScanBtn').addEventListener('click', stopScanner);
}

function toCsv(rows) {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function bindDataActions() {
  $('exportCsvBtn').addEventListener('click', () => {
    const header = ['id', 'name', 'category', 'price', 'cost', 'stock', 'barcode', 'notes', 'image', 'active'];
    const rows = productsArray().map((p) => header.map((key) => p[key] ?? ''));
    downloadFile('chiefcards-flohmarkt-produkte.csv', toCsv([header, ...rows]), 'text/csv;charset=utf-8');
  });
  $('exportSalesCsvBtn').addEventListener('click', () => {
    const header = ['id', 'createdAt', 'productId', 'productName', 'quantity', 'unitPrice', 'totalPrice'];
    const rows = salesArray().map((s) => header.map((key) => s[key] ?? ''));
    downloadFile('chiefcards-flohmarkt-verkaeufe.csv', toCsv([header, ...rows]), 'text/csv;charset=utf-8');
  });
  $('exportJsonBtn').addEventListener('click', () => {
    downloadFile('chiefcards-flohmarkt-backup.json', JSON.stringify({ products: state.products, sales: state.sales, settings: state.settings }, null, 2), 'application/json');
  });
  $('csvImport').addEventListener('change', importCsv);
  $('jsonImport').addEventListener('change', importJson);
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; continue;
    }
    cell += char;
  }
  row.push(cell); rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

async function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  const header = rows.shift().map((h) => h.trim());
  rows.forEach((row) => {
    const obj = Object.fromEntries(header.map((key, index) => [key, row[index] || '']));
    const id = obj.id || uid();
    state.products[id] = {
      id,
      name: obj.name || obj.Name || 'Unbenannt',
      category: obj.category || obj.Kategorie || 'Allgemein',
      price: Number(String(obj.price || obj.Verkaufspreis || 0).replace(',', '.')),
      cost: obj.cost || obj.Einkaufspreis ? Number(String(obj.cost || obj.Einkaufspreis).replace(',', '.')) : '',
      stock: Number(obj.stock || obj.Bestand || 0),
      barcode: obj.barcode || obj.Barcode || '',
      notes: obj.notes || obj.Notizen || '',
      image: obj.image || obj.Bild || '',
      active: String(obj.active ?? 'true') !== 'false',
      updatedAt: new Date().toISOString(),
      createdAt: state.products[id]?.createdAt || new Date().toISOString()
    };
  });
  event.target.value = '';
  renderAll();
  await saveRemote();
}

async function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  state.products = data.products || state.products;
  state.sales = data.sales || state.sales;
  state.settings = data.settings || state.settings;
  event.target.value = '';
  renderAll();
  await saveRemote();
}

function bindConnectivity() {
  window.addEventListener('online', () => { state.online = true; goOnline(db); setSyncStatus('Synchronisiert'); saveRemote(); });
  window.addEventListener('offline', () => { state.online = false; goOffline(db); setSyncStatus('Offline'); });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }
}

loadCache();
initAuth();
bindNavigation();
bindForms();
bindScanner();
bindDataActions();
bindConnectivity();
registerServiceWorker();
renderAll();
showLogin(true);
