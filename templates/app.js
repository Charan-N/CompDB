/* ════════════════════════════════════════════════
   CompDB — app.js  (flat parts model)
════════════════════════════════════════════════ */
'use strict';

// ════════════════════════════════════════════════
// API HELPERS
// ════════════════════════════════════════════════

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401 || res.redirected) { window.location.href = '/login'; throw new Error('unauth'); }
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`);
  return res.json();
}

const GET    = path       => api('GET',    path);
const POST   = (path, b) => api('POST',   path, b);
const PUT    = (path, b) => api('PUT',    path, b);
const PATCH  = (path, b) => api('PATCH',  path, b);
const DELETE = path       => api('DELETE', path);

function doLogout() { window.location.href = '/logout'; }

// ════════════════════════════════════════════════
// IN-MEMORY STATE
// ════════════════════════════════════════════════

let db = { parts: [], wishlist: [], categories: [], history: [] };
let nextPartId = 1, nextWishId = 1;

function refreshCounters() {
  const pNums = db.parts.map(p => parseInt(p.id.replace('p','')) || 0);
  const wNums = db.wishlist.map(w => parseInt(w.id.replace('w','')) || 0);
  nextPartId = Math.max(0, ...pNums) + 1;
  nextWishId = Math.max(0, ...wNums) + 1;
}

// ════════════════════════════════════════════════
// DATA LOADING
// ════════════════════════════════════════════════

async function loadAll() {
  const [pv, wl, cats, hist] = await Promise.all([
    GET('/api/parts'),
    GET('/api/wishlist'),
    GET('/api/categories'),
    GET('/api/history'),
  ]);
  db.parts      = pv.parts;
  db.wishlist   = wl.wishlist;
  db.categories = cats.categories;
  db.history    = hist.history;
  refreshCounters();
}

// ════════════════════════════════════════════════
// ROUTING
// ════════════════════════════════════════════════

let currentPage = 'inventory';

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  if (page === 'inventory') renderInventory();
  if (page === 'wishlist')  renderWishlist();
  if (page === 'restock')   renderRestock();
  if (page === 'heatmap')   renderHeatmap();
}

// ════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════

let theme = localStorage.getItem('cdb_theme') || 'light';

function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-label').textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
}

function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('cdb_theme', theme);
  applyTheme();
}

// ════════════════════════════════════════════════
// CATEGORIES
// ════════════════════════════════════════════════

const CAT_COLORS = {
  'Resistor':             ['#1d4ed8','#dbeafe','#bfdbfe','#1e40af22'],
  'Capacitor':            ['#7c3aed','#ede9fe','#ddd6fe','#6d28d922'],
  'Inductor':             ['#b45309','#fef3c7','#fde68a','#92400e22'],
  'Diode':                ['#be185d','#fce7f3','#fbcfe8','#9d174d22'],
  'Transistor':           ['#065f46','#d1fae5','#a7f3d0','#064e3b22'],
  'MOSFET':               ['#0e7490','#cffafe','#a5f3fc','#0e749022'],
  'LED':                  ['#854d0e','#fef9c3','#fef08a','#713f1222'],
  'Crystal / Oscillator': ['#1e3a5f','#e0f2fe','#bae6fd','#0c4a6e22'],
  'MCU':                  ['#991b1b','#fee2e2','#fecaca','#7f1d1d22'],
  'Sensor':               ['#166534','#dcfce7','#bbf7d0','#14532d22'],
  'Module':               ['#3730a3','#e0e7ff','#c7d2fe','#31279322'],
  'IC — Analog':          ['#6b21a8','#f3e8ff','#e9d5ff','#581c8722'],
  'IC — Digital':         ['#1e40af','#dbeafe','#bfdbfe','#1e3a8a22'],
  'IC — Power':           ['#92400e','#ffedd5','#fed7aa','#78350f22'],
  'Connector':            ['#374151','#f3f4f6','#e5e7eb','#1f293722'],
  'Switch / Button':      ['#9d174d','#fdf2f8','#fce7f3','#83124322'],
  'Display':              ['#0c4a6e','#e0f2fe','#bae6fd','#07304722'],
  'Relay':                ['#78350f','#fef3c7','#fde68a','#62280c22'],
  'Fuse / Protection':    ['#7f1d1d','#fff1f2','#ffe4e6','#6b1a1a22'],
  'Other':                ['#374151','#f9fafb','#f3f4f6','#1f293722'],
};

function getCatColors(cat) { return CAT_COLORS[cat] || ['#374151','#f9fafb','#f3f4f6','#1f293722']; }

function catBadgeHTML(cat) {
  const [text, bg, border] = getCatColors(cat);
  return `<span class="cat-badge" style="color:${text};background:${bg};border-color:${border};">${cat}</span>`;
}

function populateCatSelects() {
  ['p-cat','ep-cat','w-cat'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">Select...</option>' +
      db.categories.map(c => `<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('') +
      `<option value="__new__">+ Add category...</option>`;
  });
  ['inv-cat-filter','wish-cat-filter'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">All Categories</option>' +
      db.categories.map(c => `<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');
  });
}

function handleCatSelect(selectId) {
  const el = document.getElementById(selectId);
  if (el && el.value === '__new__') { el.value = ''; openAddCategory(selectId); }
}

let pendingCatSelect = null;

function openAddCategory(returnSelectId) {
  pendingCatSelect = returnSelectId;
  document.getElementById('new-cat-name').value = '';
  openModal('modal-category');
  setTimeout(() => document.getElementById('new-cat-name').focus(), 50);
}

async function saveCategory() {
  const name = document.getElementById('new-cat-name').value.trim();
  if (!name) { showToast('Category name required.'); return; }
  if (db.categories.includes(name)) { showToast('Category already exists.'); return; }
  try {
    await POST('/api/categories', { name });
    db.categories.push(name);
    CAT_COLORS[name] = ['#374151','#f9fafb','#f3f4f6','#1f293722'];
    populateCatSelects();
    if (pendingCatSelect) {
      const el = document.getElementById(pendingCatSelect);
      if (el) el.value = name;
      pendingCatSelect = null;
    }
    closeModal('modal-category');
    showToast(`Category "${name}" added.`);
  } catch(e) { showToast('Failed to save category.'); }
}

// ════════════════════════════════════════════════
// INVENTORY HELPERS
// ════════════════════════════════════════════════

function qtyClass(qty, low) {
  if (low && qty <= 0)   return 'qty-low';
  if (low && qty <= low) return 'qty-warn';
  return 'qty-ok';
}

// ════════════════════════════════════════════════
// RENDER INVENTORY
// ════════════════════════════════════════════════

function renderInventory() {
  const q    = (document.getElementById('inv-search').value || '').toLowerCase();
  const cat  = document.getElementById('inv-cat-filter').value;
  const sort = document.getElementById('inv-sort').value;
  populateCatSelects();

  let parts = db.parts.filter(p => {
    const matchCat = !cat || p.cat === cat;
    const matchQ   = !q || [p.name, p.value, p.cat, p.mpn, p.notes, p.pkg, p.loc]
      .some(f => f && f.toLowerCase().includes(q));
    return matchCat && matchQ;
  });

  parts.sort((a,b) => {
    if (sort==='name')     return a.name.localeCompare(b.name);
    if (sort==='cat')      return a.cat.localeCompare(b.cat);
    if (sort==='qty-asc')  return (a.qty||0)-(b.qty||0);
    if (sort==='qty-desc') return (b.qty||0)-(a.qty||0);
    return 0;
  });

  const totalUnits = db.parts.reduce((s,p) => s+(p.qty||0), 0);
  document.getElementById('inv-sub').textContent =
    `${db.parts.length} parts · ${totalUnits.toLocaleString()} units total`;

  const bar = document.getElementById('low-stock-bar');
  const lowParts = db.parts.filter(p => p.low && p.qty <= p.low);
  if (lowParts.length) {
    bar.style.display = 'flex';
    bar.innerHTML = `⚠ Low stock: ${lowParts.map(p=>`${p.name} ${p.value}`).join(', ')}`;
  } else { bar.style.display = 'none'; }

  const container = document.getElementById('parts-list');
  if (!parts.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">◎</div>
      <div class="empty-title">No parts found</div>
      <div class="empty-sub">${q ? 'Try a different search term' : 'Add your first component to get started'}</div>
    </div>`;
    return;
  }

  container.innerHTML = parts.map(p => {
    const qc  = qtyClass(p.qty, p.low);
    const low = p.low && p.qty <= p.low;
    const valuePkg = p.value + (p.pkg ? ` — ${p.pkg}` : '') + (p.mpn ? ` · ${p.mpn}` : '');
    return `<div class="part-card" id="part-card-${p.id}">
      <div class="part-row">
        <div class="part-col-left">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="part-name">${p.name}</span>
            ${catBadgeHTML(p.cat)}
            ${low ? '<span style="font-size:10px;color:var(--red);font-family:Geist Mono,monospace;font-weight:600;">LOW STOCK</span>' : ''}
          </div>
          <div class="part-value">${valuePkg}</div>
        </div>
        <div class="part-col-notes">
          ${p.notes ? `<span class="part-notes-inline">${p.notes}</span>` : ''}
        </div>
        <div class="part-col-right">
          ${p.loc ? `<span class="part-loc">${p.loc}</span>` : ''}
          <div class="part-qty-cell">
            <span class="part-qty ${qc}">${p.qty}</span>
            <div class="qty-adj">
              <button class="qty-btn" onclick="adjustPartQty('${p.id}',-1)">−</button>
              <button class="qty-btn" onclick="adjustPartQty('${p.id}',1)">+</button>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="openEditPart('${p.id}')">Edit</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function adjustPartQty(partId, delta) {
  const p = db.parts.find(x => x.id === partId); if (!p) return;
  const newQty = Math.max(0, (p.qty||0) + delta);
  try {
    await PATCH(`/api/parts/${partId}/qty`, { qty: newQty });
    p.qty = newQty;
    renderInventory();
  } catch(e) { showToast('Failed to update quantity.'); }
}

// ════════════════════════════════════════════════
// DUPLICATE DETECTION
// ════════════════════════════════════════════════

function findDuplicates(name, value, pkg, excludeId=null) {
  const n = name.toLowerCase().trim();
  return db.parts.filter(x => {
    if (x.id === excludeId) return false;
    return x.name.toLowerCase().trim() === n;
  });
}

function showDupWarning(dups) {
  const w = document.getElementById('p-dup-warning');
  const l = document.getElementById('p-dup-list');
  if (!dups.length) { w.style.display='none'; return; }
  w.style.display = 'block';
  l.innerHTML = dups.map((d,i) =>
    `<div class="dup-item">
      <span>${d.name} · ${d.value}${d.pkg?' · '+d.pkg:''} <span class="dup-qty">${d.qty} in stock</span></span>
      <label class="dup-merge-label"><input type="checkbox" class="dup-merge-cb" data-id="${d.id}"> Merge qty</label>
    </div>`
  ).join('');
}

// ════════════════════════════════════════════════
// ADD / EDIT PART
// ════════════════════════════════════════════════

let editingPartId = null;

function openAddPart() {
  editingPartId = null;
  ['p-name','p-value','p-pkg','p-loc','p-mpn','p-notes'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('p-qty').value = '';
  document.getElementById('p-low').value = '';
  document.getElementById('p-dup-warning').style.display = 'none';
  document.getElementById('modal-part-title').textContent = 'Add Part';
  document.getElementById('modal-part-sub').textContent = 'New component entry';
  populateCatSelects();
  openModal('modal-part');
  setTimeout(() => document.getElementById('p-name').focus(), 50);
}

// Check dups live as user types
['p-name','p-value','p-pkg'].forEach(id => {
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', checkDupLive);
  });
});

function checkDupLive() {
  if (editingPartId) return; // only for add
  const name  = document.getElementById('p-name').value.trim();
  const value = document.getElementById('p-value').value.trim();
  const pkg   = document.getElementById('p-pkg').value.trim();
  if (!name || !value) { document.getElementById('p-dup-warning').style.display='none'; return; }
  showDupWarning(findDuplicates(name, value, pkg));
}

async function savePart() {
  const name  = document.getElementById('p-name').value.trim();
  const cat   = document.getElementById('p-cat').value;
  const value = document.getElementById('p-value').value.trim();
  if (!name||!cat||!value) { showToast('Name, category and value are required.'); return; }
  if (cat==='__new__') { handleCatSelect('p-cat'); return; }

  const inQty  = parseInt(document.getElementById('p-qty').value)||0;
  const inPkg  = document.getElementById('p-pkg').value.trim();
  const inLoc  = document.getElementById('p-loc').value.trim();
  const inLow  = parseInt(document.getElementById('p-low').value)||0;
  const inMpn  = document.getElementById('p-mpn').value.trim();
  const inNotes= document.getElementById('p-notes').value.trim();

  // Handle merge checkboxes
  const mergeBoxes = [...document.querySelectorAll('.dup-merge-cb:checked')];
  if (mergeBoxes.length) {
    try {
      for (const cb of mergeBoxes) {
        const existing = db.parts.find(x => x.id === cb.dataset.id); if (!existing) continue;
        const newQty = (existing.qty||0) + inQty;
        await PATCH(`/api/parts/${existing.id}/qty`, { qty: newQty });
        existing.qty = newQty;
      }
      closeModal('modal-part');
      renderInventory();
      showToast(`Merged qty into ${mergeBoxes.length} existing part${mergeBoxes.length>1?'s':''}.`);
    } catch(e) { showToast('Failed to merge.'); }
    return;
  }

  const part = {
    id: `p${nextPartId++}`,
    name, cat, value,
    pkg:   inPkg,
    qty:   inQty,
    loc:   inLoc,
    low:   inLow,
    mpn:   inMpn,
    notes: inNotes,
  };

  try {
    await POST('/api/parts', part);
    db.parts.push(part);
    closeModal('modal-part');
    renderInventory();
    showToast('Part added.');
  } catch(e) { showToast('Failed to save part.'); }
}

function openEditPart(partId) {
  editingPartId = partId;
  const p = db.parts.find(x => x.id===partId); if(!p) return;
  populateCatSelects();
  document.getElementById('ep-name').value  = p.name;
  document.getElementById('ep-cat').value   = p.cat;
  document.getElementById('ep-value').value = p.value;
  document.getElementById('ep-pkg').value   = p.pkg||'';
  document.getElementById('ep-qty').value   = p.qty??0;
  document.getElementById('ep-loc').value   = p.loc||'';
  document.getElementById('ep-low').value   = p.low??0;
  document.getElementById('ep-mpn').value   = p.mpn||'';
  document.getElementById('ep-notes').value = p.notes||'';
  openModal('modal-edit-part');
  setTimeout(() => document.getElementById('ep-name').focus(), 50);
}

async function saveEditPart() {
  const p = db.parts.find(x => x.id===editingPartId); if(!p) return;
  const name=document.getElementById('ep-name').value.trim();
  const cat=document.getElementById('ep-cat').value;
  const value=document.getElementById('ep-value').value.trim();
  if(!name||!cat||!value) { showToast('Name, category and value required.'); return; }
  const updated = {
    name, cat, value,
    pkg:   document.getElementById('ep-pkg').value.trim(),
    qty:   parseInt(document.getElementById('ep-qty').value)||0,
    loc:   document.getElementById('ep-loc').value.trim(),
    low:   parseInt(document.getElementById('ep-low').value)||0,
    mpn:   document.getElementById('ep-mpn').value.trim(),
    notes: document.getElementById('ep-notes').value.trim(),
  };
  try {
    await PUT(`/api/parts/${editingPartId}`, updated);
    Object.assign(p, updated);
    closeModal('modal-edit-part');
    renderInventory();
    showToast('Part updated.');
  } catch(e) { showToast('Failed to update part.'); }
}

async function deletePartConfirm() {
  const p = db.parts.find(x => x.id===editingPartId); if(!p) return;
  if(!confirm(`Delete "${p.name} ${p.value}"?`)) return;
  try {
    await DELETE(`/api/parts/${editingPartId}`);
    db.parts = db.parts.filter(x => x.id!==editingPartId);
    closeModal('modal-edit-part');
    renderInventory();
    showToast('Part deleted.');
  } catch(e) { showToast('Failed to delete part.'); }
}

// ════════════════════════════════════════════════
// SESSION
// ════════════════════════════════════════════════

let sessionItems = [];
let sessSearchIdx = -1;  // for arrow key navigation

function openSession() {
  sessionItems = [];
  document.getElementById('sess-name').value  = '';
  document.getElementById('sess-notes').value = '';
  document.getElementById('sess-search').value = '';
  document.getElementById('sess-results').style.display = 'none';
  sessSearchIdx = -1;
  renderSessionItems();
  openModal('modal-session');
  setTimeout(() => document.getElementById('sess-name').focus(), 50);
}

function sessionSearch() {
  const q = document.getElementById('sess-search').value.trim().toLowerCase();
  const resultsEl = document.getElementById('sess-results');
  sessSearchIdx = -1;
  if (!q) { resultsEl.style.display='none'; return; }

  const matches = db.parts.filter(p =>
    [p.name,p.value,p.cat,p.pkg,p.loc].filter(Boolean).join(' ').toLowerCase().includes(q)
  ).slice(0, 10);

  if (!matches.length) { resultsEl.style.display='none'; return; }
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = matches.map((p, i) => `
    <div class="dropdown-row" data-idx="${i}" data-part-id="${p.id}"
         onclick="addToSessionPart('${p.id}')"
         onmouseenter="sessHighlight(${i})">
      <div>
        <div class="dropdown-row-name">${p.name} <span style="color:var(--text-muted);font-weight:400">${p.value}</span></div>
        <div class="dropdown-row-meta">${[p.pkg,p.loc].filter(Boolean).join(' · ')}</div>
      </div>
      <span class="dropdown-row-stock">${p.qty} in stock</span>
    </div>`).join('');
}

function sessHighlight(idx) {
  sessSearchIdx = idx;
  document.querySelectorAll('#sess-results .dropdown-row').forEach((r,i) => {
    r.classList.toggle('highlighted', i===idx);
  });
}

// Arrow key / Enter navigation in session search
document.addEventListener('keydown', e => {
  const resultsEl = document.getElementById('sess-results');
  if (!resultsEl || resultsEl.style.display==='none') return;
  if (document.activeElement.id !== 'sess-search') return;

  const rows = resultsEl.querySelectorAll('.dropdown-row');
  if (!rows.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    sessSearchIdx = Math.min(sessSearchIdx + 1, rows.length - 1);
    sessHighlight(sessSearchIdx);
    rows[sessSearchIdx]?.scrollIntoView({ block:'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    sessSearchIdx = Math.max(sessSearchIdx - 1, 0);
    sessHighlight(sessSearchIdx);
    rows[sessSearchIdx]?.scrollIntoView({ block:'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const highlighted = rows[sessSearchIdx] || rows[0];
    if (highlighted) {
      const partId = highlighted.dataset.partId;
      if (partId) addToSessionPart(partId);
    }
  }
}, true);

function addToSessionPart(partId) {
  const p = db.parts.find(x => x.id===partId); if(!p) return;
  const existing = sessionItems.find(x => x.partId===partId);
  if (existing) existing.qty++;
  else sessionItems.push({ partId:p.id, name:p.name, value:p.value, pkg:p.pkg||'', qty:1 });
  document.getElementById('sess-search').value = '';
  document.getElementById('sess-results').style.display = 'none';
  sessSearchIdx = -1;
  renderSessionItems();
}

function updateSessionQty(partId, val) {
  const item = sessionItems.find(x => x.partId===partId); if(!item) return;
  const n = parseInt(val)||0;
  if(n<=0) sessionItems = sessionItems.filter(x => x.partId!==partId);
  else item.qty = n;
  renderSessionItems();
}

function removeFromSession(partId) {
  sessionItems = sessionItems.filter(x => x.partId!==partId);
  renderSessionItems();
}

function renderSessionItems() {
  const el = document.getElementById('sess-items');
  const countEl = document.getElementById('sess-count');
  if(!sessionItems.length) {
    el.innerHTML = `<div class="sess-empty">No items yet — search above to add components.</div>`;
    countEl.textContent = '';
    return;
  }
  countEl.textContent = `(${sessionItems.length} item${sessionItems.length>1?'s':''})`;
  el.innerHTML = sessionItems.map(item => {
    const p = db.parts.find(x => x.id===item.partId);
    const avail = p?p.qty:0;
    const over  = item.qty>avail;
    return `<div class="session-item">
      <div class="session-item-info">
        <div class="session-item-name">${item.name} <span style="color:var(--text-muted);font-weight:400;">${item.value}</span></div>
        <div class="session-item-meta">${item.pkg||''}${item.pkg?' · ':''}${avail} in stock</div>
      </div>
      <span style="font-size:12px;color:var(--text-muted);">use</span>
      <input type="number" min="1" value="${item.qty}" class="session-item-qty-input${over?' over':''}"
        oninput="updateSessionQty('${item.partId}',this.value)">
      ${over?`<span style="font-size:11px;color:var(--red);font-family:Geist Mono,monospace;">over!</span>`:''}
      <button class="session-remove" onclick="removeFromSession('${item.partId}')">✕</button>
    </div>`;
  }).join('');
}

async function commitSession() {
  if(!sessionItems.length) { showToast('No items in session.'); return; }
  const name  = document.getElementById('sess-name').value.trim() || 'Unnamed Session';
  const notes = document.getElementById('sess-notes').value.trim();
  const over  = sessionItems.filter(item => {
    const p = db.parts.find(x => x.id===item.partId);
    return item.qty>(p?p.qty:0);
  });
  if(over.length && !confirm(`⚠ ${over.map(x=>x.name+' '+x.value).join(', ')} will go below zero. Proceed?`)) return;

  const snapshot = sessionItems.map(item => {
    const p = db.parts.find(x => x.id===item.partId);
    return { partId:item.partId, partName:item.name, value:item.value, pkg:item.pkg, used:item.qty, before:p?p.qty:0 };
  });

  try {
    await POST('/api/history', { name, timestamp:new Date().toISOString(), items:snapshot, notes });
    snapshot.forEach(item => {
      const p = db.parts.find(x => x.id===item.partId);
      if(p) p.qty = Math.max(0, p.qty - item.used);
    });
    db.history.unshift({ name, timestamp:new Date().toISOString(), items:snapshot, notes });
    closeModal('modal-session');
    renderInventory();
    showToast(`✓ "${name}" — ${snapshot.length} component${snapshot.length>1?'s':''} deducted.`);
  } catch(e) { showToast('Failed to commit session.'); }
}

// ════════════════════════════════════════════════
// SESSION HISTORY
// ════════════════════════════════════════════════

function openHistory() { renderHistory(); openModal('modal-history'); }

function renderHistory() {
  const body = document.getElementById('history-body');
  if(!db.history.length) {
    body.innerHTML = `<div class="sess-empty" style="padding:48px">No sessions yet.</div>`;
    return;
  }
  body.innerHTML = db.history.map((entry,i) => {
    const dt = new Date(entry.timestamp);
    const dateStr = dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    const timeStr = dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    const totalUsed = entry.items.reduce((s,x) => s+x.used, 0);
    return `<div class="history-entry">
      <div class="history-entry-header" onclick="toggleHistoryEntry(${i},this)">
        <div style="flex:1;min-width:0;">
          <div class="history-entry-name">${entry.name}</div>
          <div class="history-entry-meta">${dateStr} at ${timeStr}</div>
          ${entry.notes ? `<div class="history-entry-notes">${entry.notes}</div>` : ''}
        </div>
        <div class="history-entry-right">
          <span class="history-badge">${entry.items.length} parts · ${totalUsed} units</span>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openEditSessionNotes(${i})" style="font-size:12px;">✎ Notes</button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();exportSessionBOM(${i})" style="font-size:12px;">↓ BOM</button>
          <span class="history-chevron">▶</span>
        </div>
      </div>
      <div class="history-rows" id="hist-rows-${i}">
        ${entry.items.map(item=>`
          <div class="history-row">
            <div>
              <span class="history-row-name">${item.partName}</span>
              <span style="font-family:Geist Mono,monospace;font-size:11px;color:var(--text-muted);margin-left:6px;">${item.value}${item.pkg?' · '+item.pkg:''}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="history-row-qty">−${item.used}</span>
              <span class="history-row-meta">was ${item.before}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleHistoryEntry(i, headerEl) {
  const rows = document.getElementById(`hist-rows-${i}`);
  const open = rows.classList.toggle('open');
  headerEl.classList.toggle('open', open);
}

let editingSessionIdx = -1;

function openEditSessionNotes(idx) {
  editingSessionIdx = idx;
  const entry = db.history[idx]; if(!entry) return;
  document.getElementById('sess-edit-notes').value = entry.notes || '';
  openModal('modal-session-notes');
  setTimeout(() => document.getElementById('sess-edit-notes').focus(), 50);
}

async function saveSessionNotes() {
  const entry = db.history[editingSessionIdx]; if(!entry) return;
  const notes = document.getElementById('sess-edit-notes').value.trim();
  if (!entry.id) { showToast('Session ID missing — reload and try again.'); return; }
  try {
    await PATCH(`/api/history/${entry.id}/notes`, { notes });
    entry.notes = notes;
    closeModal('modal-session-notes');
    renderHistory();
    showToast('Notes saved.');
  } catch(e) { showToast('Failed to save notes.'); }
}

function exportSessionBOM(index) {
  const entry = db.history[index]; if(!entry) return;
  const headers = ['Part Name','Value','Package','Qty Used','Stock Before'];
  const rows = entry.items.map(item =>
    [item.partName,item.value,item.pkg||'',item.used,item.before]
    .map(v=>`"${(v??'').toString().replace(/"/g,'""')}"`)
  );
  const csv = [headers,...rows].map(r=>r.join(',')).join('\n');
  downloadCSV(csv, `bom_${entry.name.replace(/[^a-z0-9]/gi,'_').toLowerCase()}.csv`);
  showToast('BOM exported.');
}

// ════════════════════════════════════════════════
// WISHLIST
// ════════════════════════════════════════════════

let editingWishId = null;

function openAddWishItem(id=null) {
  editingWishId = id;
  populateCatSelects();
  if(id) {
    const w = db.wishlist.find(x=>x.id===id); if(!w) return;
    document.getElementById('modal-wish-title').textContent='Edit Wishlist Item';
    document.getElementById('w-name').value=w.name||'';
    document.getElementById('w-cat').value=w.cat||'';
    document.getElementById('w-value').value=w.value||'';
    document.getElementById('w-pkg').value=w.pkg||'';
    document.getElementById('w-qty').value=w.qtyWanted??1;
    document.getElementById('w-priority').value=w.priority||'medium';
    document.getElementById('w-notes').value=w.notes||'';
  } else {
    document.getElementById('modal-wish-title').textContent='Add to Wishlist';
    ['w-name','w-value','w-pkg','w-notes'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('w-qty').value=1;
    document.getElementById('w-priority').value='medium';
  }
  openModal('modal-wish');
  setTimeout(()=>document.getElementById('w-name').focus(),50);
}

async function saveWishItem() {
  const name=document.getElementById('w-name').value.trim();
  const cat=document.getElementById('w-cat').value;
  if(!name||!cat) { showToast('Name and category required.'); return; }
  const data = {
    name,cat,
    value:document.getElementById('w-value').value.trim(),
    pkg:document.getElementById('w-pkg').value.trim(),
    qtyWanted:parseInt(document.getElementById('w-qty').value)||1,
    priority:document.getElementById('w-priority').value,
    notes:document.getElementById('w-notes').value.trim(),
  };
  try {
    if(editingWishId) {
      await PUT(`/api/wishlist/${editingWishId}`, data);
      const idx = db.wishlist.findIndex(x=>x.id===editingWishId);
      db.wishlist[idx] = {...db.wishlist[idx],...data};
      showToast('Wishlist item updated.');
    } else {
      const newItem = {id:`w${nextWishId++}`,...data};
      await POST('/api/wishlist', newItem);
      db.wishlist.push(newItem);
      showToast('Added to wishlist.');
    }
    closeModal('modal-wish');
    renderWishlist();
  } catch(e) { showToast('Failed to save wishlist item.'); }
}

async function deleteWishItem(id) {
  const w = db.wishlist.find(x=>x.id===id); if(!w) return;
  if(!confirm(`Remove "${w.name}" from wishlist?`)) return;
  try {
    await DELETE(`/api/wishlist/${id}`);
    db.wishlist = db.wishlist.filter(x=>x.id!==id);
    renderWishlist();
    showToast('Removed from wishlist.');
  } catch(e) { showToast('Failed to remove item.'); }
}

function renderWishlist() {
  populateCatSelects();
  const q=(document.getElementById('wish-search').value||'').toLowerCase();
  const cat=document.getElementById('wish-cat-filter').value;

  let items = db.wishlist.filter(w => {
    const matchCat=!cat||w.cat===cat;
    const matchQ=!q||[w.name,w.value,w.pkg,w.cat,w.notes].some(f=>f&&f.toLowerCase().includes(q));
    return matchCat&&matchQ;
  });

  const pOrder={high:0,medium:1,low:2};
  items.sort((a,b)=>(pOrder[a.priority]||1)-(pOrder[b.priority]||1));
  document.getElementById('wish-sub').textContent=`${db.wishlist.length} item${db.wishlist.length!==1?'s':''} on wishlist`;

  const container=document.getElementById('wishlist-body');
  if(!items.length) {
    container.innerHTML=`<div class="empty-state">
      <div class="empty-icon">✦</div>
      <div class="empty-title">Wishlist is empty</div>
      <div class="empty-sub">Add components you want to acquire</div>
    </div>`;
    return;
  }
  container.innerHTML=items.map(w=>`
    <div class="wish-card">
      <div class="wish-info">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="wish-name">${w.name}</span>
          ${catBadgeHTML(w.cat)}
          <span class="priority-badge priority-${w.priority}">${w.priority}</span>
        </div>
        <div class="wish-meta">${[w.value,w.pkg].filter(Boolean).join(' · ')}${w.qtyWanted>1?` · want ${w.qtyWanted}`:''}</div>
        ${w.notes?`<div class="wish-notes">${w.notes}</div>`:''}
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" onclick="openAddWishItem('${w.id}')">Edit</button>
        <button class="btn btn-danger-outline btn-sm" onclick="deleteWishItem('${w.id}')">✕</button>
      </div>
    </div>`).join('');
}

// ════════════════════════════════════════════════
// RESTOCK
// ════════════════════════════════════════════════

function renderRestock() {
  const lowParts = db.parts.filter(p=>p.low&&p.qty<=p.low).map(p=>({
    type:'inventory',id:p.id,
    name:`${p.name} ${p.value}`,
    meta:[p.pkg,p.loc].filter(Boolean).join(' · '),
    qty:p.qty,low:p.low
  }));
  const wishItems = db.wishlist.map(w=>({
    type:'wish',id:w.id,name:w.name,
    meta:[w.value,w.pkg].filter(Boolean).join(' · '),
    qty:w.qtyWanted,priority:w.priority,
  }));
  const body=document.getElementById('restock-body');
  if(!lowParts.length&&!wishItems.length) {
    body.innerHTML=`<div class="restock-empty">✓ Nothing to restock. All stock levels are healthy and wishlist is empty.</div>`;
    return;
  }
  let html='<div class="restock-body-scroll">';
  if(lowParts.length) {
    html+=`<div class="restock-section"><div class="restock-section-title">Low Stock — Inventory (${lowParts.length})</div></div>`;
    html+=lowParts.map(item=>`
      <div class="restock-row">
        <input type="checkbox" class="restock-check" id="rc-${item.id}" data-type="${item.type}" data-id="${item.id}">
        <div class="restock-info">
          <div class="restock-name">${item.name}</div>
          <div class="restock-meta">${item.meta}</div>
        </div>
        <span class="restock-qty-badge restock-qty-low">${item.qty} / ${item.low} min</span>
      </div>`).join('');
  }
  if(lowParts.length&&wishItems.length) html+=`<hr class="restock-divider">`;
  if(wishItems.length) {
    html+=`<div class="restock-section"><div class="restock-section-title">Wishlist (${wishItems.length})</div></div>`;
    html+=wishItems.map(item=>`
      <div class="restock-row">
        <input type="checkbox" class="restock-check" id="rc-${item.id}" data-type="${item.type}" data-id="${item.id}">
        <div class="restock-info">
          <div class="restock-name">${item.name}</div>
          <div class="restock-meta">${item.meta}${item.priority?` · ${item.priority} priority`:''}</div>
        </div>
        <span class="restock-qty-badge restock-qty-wish">want ${item.qty}</span>
      </div>`).join('');
  }
  html+='</div>';
  body.innerHTML=html;
}

function selectAllRestock() {
  document.querySelectorAll('.restock-check').forEach(cb=>cb.checked=true);
}

function generateShoppingList() {
  const checked=[...document.querySelectorAll('.restock-check:checked')];
  if(!checked.length) { showToast('Select at least one item.'); return; }
  const rows=checked.map(cb=>{
    const {type,id}=cb.dataset;
    if(type==='inventory') {
      const p=db.parts.find(x=>x.id===id);
      return p?[p.name,p.value,p.pkg||'',p.qty,p.low,'Low Stock',p.mpn||'']:null;
    } else {
      const w=db.wishlist.find(x=>x.id===id);
      return w?[w.name,w.value||'',w.pkg||'','',w.qtyWanted,'Wishlist','']:null;
    }
  }).filter(Boolean);
  const headers=['Name','Value','Package','Current Qty','Need Qty','Source','MPN'];
  const csv=[headers,...rows].map(r=>r.map(v=>`"${(v??'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadCSV(csv,`compdb_shopping_list_${new Date().toISOString().slice(0,10)}.csv`);
  showToast(`Shopping list with ${rows.length} items exported.`);
}

function exportInventoryCSV() {
  if (!db.parts.length) { showToast('No parts to export.'); return; }
  const headers = ['Name','Category','Value','Package','Quantity','Location','Low Stock Alert','MPN','Notes'];
  const rows = db.parts.map(p => [
    p.name, p.cat, p.value, p.pkg||'', p.qty, p.loc||'', p.low||'', p.mpn||'', p.notes||''
  ].map(v => `"${(v??'').toString().replace(/"/g,'""')}"`));
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  downloadCSV(csv, `compdb_inventory_${new Date().toISOString().slice(0,10)}.csv`);
  showToast(`Exported ${db.parts.length} parts.`);
}

// ════════════════════════════════════════════════
// HEATMAP
// ════════════════════════════════════════════════

function renderHeatmap() {
  const container=document.getElementById('heatmap-body');
  if(!db.history.length) {
    container.innerHTML=`<div class="heatmap-container"><div class="empty-state">
      <div class="empty-icon">◈</div>
      <div class="empty-title">No session data yet</div>
      <div class="empty-sub">Use sessions will appear here once you start logging component usage</div>
    </div></div>`;
    return;
  }
  const usage={};
  db.history.forEach(entry=>{
    entry.items.forEach(item=>{
      if(!usage[item.partId]) usage[item.partId]={partName:item.partName,value:item.value,totalUsed:0,sessionCount:0};
      usage[item.partId].totalUsed+=item.used;
      usage[item.partId].sessionCount+=1;
    });
  });
  const sorted=Object.values(usage).sort((a,b)=>b.totalUsed-a.totalUsed);
  if(!sorted.length) {
    container.innerHTML=`<div class="heatmap-container"><div class="empty-state"><div class="empty-icon">◈</div><div class="empty-title">No usage data</div></div></div>`;
    return;
  }
  const maxUsed=sorted[0].totalUsed;
  container.innerHTML=`<div class="heatmap-container">
    <div class="heatmap-section-title">Most Used Parts — All Time</div>
    <div class="heatmap-grid">
      ${sorted.map(u=>{
        const pct=maxUsed>0?Math.round((u.totalUsed/maxUsed)*100):0;
        const color=pct>75?'var(--red)':pct>40?'var(--amber)':'var(--accent)';
        return `<div class="heatmap-card">
          <div class="heatmap-card-name">${u.partName}</div>
          <div class="heatmap-card-value">${u.value}</div>
          <div class="heatmap-bar-wrap"><div class="heatmap-bar" style="width:${pct}%;background:${color};"></div></div>
          <div class="heatmap-stats"><span>Total used</span><span class="heatmap-stat-val">${u.totalUsed} units</span></div>
          <div class="heatmap-stats"><span>In sessions</span><span class="heatmap-stat-val">${u.sessionCount}</span></div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════
// BULK CSV IMPORT
// ════════════════════════════════════════════════

let importPreviewData = null;
let importStep = 'upload'; // 'upload' | 'preview'

function openImport() {
  importStep = 'upload';
  importPreviewData = null;
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-upload-error').style.display = 'none';
  document.getElementById('import-step-upload').style.display = 'block';
  document.getElementById('import-step-preview').style.display = 'none';
  document.getElementById('import-action-btn').textContent = 'Preview';
  openModal('modal-import');
}

async function importNext() {
  if (importStep === 'upload') {
    await runImportPreview();
  } else if (importStep === 'preview') {
    await runImportCommit();
  }
}

async function runImportPreview() {
  const fileInput = document.getElementById('import-file-input');
  const errEl     = document.getElementById('import-upload-error');
  errEl.style.display = 'none';

  if (!fileInput.files.length) { errEl.textContent='Please select a CSV file.'; errEl.style.display='block'; return; }

  const text = await fileInput.files[0].text();
  let rows;
  try { rows = parseCSV(text); } catch(e) { errEl.textContent='Failed to parse CSV: '+e.message; errEl.style.display='block'; return; }

  if (!rows.length) { errEl.textContent='CSV is empty.'; errEl.style.display='block'; return; }

  // validate headers
  const required = ['name','category','value'];
  const headers  = Object.keys(rows[0]).map(h=>h.toLowerCase().trim());
  const missing  = required.filter(r => !headers.includes(r));
  if (missing.length) { errEl.textContent=`Missing columns: ${missing.join(', ')}`; errEl.style.display='block'; return; }

  try {
    const preview = await POST('/api/import/preview', { rows });
    importPreviewData = preview;
    renderImportPreview(preview);
    importStep = 'preview';
    document.getElementById('import-action-btn').textContent = 'Import';
    document.getElementById('import-step-upload').style.display = 'none';
    document.getElementById('import-step-preview').style.display = 'block';
  } catch(e) { errEl.textContent='Preview failed. Check server.'; errEl.style.display='block'; }
}

function renderImportPreview(preview) {
  const { new_parts, merges, errors } = preview;
  let html = '';

  if (errors.length) {
    html += `<div class="import-section-title import-err-title">⚠ ${errors.length} Row Error${errors.length>1?'s':''}</div>`;
    html += errors.map(e=>`<div class="import-error-row">Row ${e.row}: ${e.reason}</div>`).join('');
  }

  if (merges.length) {
    html += `<div class="import-section-title">🔀 ${merges.length} Merge Candidate${merges.length>1?'s':''} <span style="font-weight:400;color:var(--text-muted)">(same name+value+package found)</span></div>`;
    html += merges.map((m,i)=>`
      <div class="import-preview-row" id="ipr-merge-${i}">
        <div class="import-preview-info">
          <div class="import-preview-name">${m.name} <span style="color:var(--text-muted);font-weight:400">${m.value}</span>${m.pkg?` · ${m.pkg}`:''}</div>
          <div class="import-preview-meta">Existing: ${m.merge_name} · ${m.merge_qty} in stock → +${m.qty} = ${m.merge_qty+m.qty}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <label class="import-radio"><input type="radio" name="imp-merge-${i}" value="merge" checked> Merge qty</label>
          <label class="import-radio"><input type="radio" name="imp-merge-${i}" value="new"> Add new</label>
          <label class="import-radio"><input type="radio" name="imp-merge-${i}" value="skip"> Skip</label>
        </div>
      </div>`).join('');
  }

  if (new_parts.length) {
    html += `<div class="import-section-title">✚ ${new_parts.length} New Part${new_parts.length>1?'s':''}</div>`;
    html += new_parts.map((p,i)=>`
      <div class="import-preview-row">
        <div class="import-preview-info">
          <div class="import-preview-name">${p.name} <span style="color:var(--text-muted);font-weight:400">${p.value}</span>${p.pkg?` · ${p.pkg}`:''}</div>
          <div class="import-preview-meta">${p.cat} · qty ${p.qty}${p.loc?' · '+p.loc:''}
          ${p.similar_name?`<span style="color:var(--amber);"> ⚠ similar: ${p.similar_name}</span>`:''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <label class="import-radio"><input type="radio" name="imp-new-${i}" value="new" checked> Add</label>
          <label class="import-radio"><input type="radio" name="imp-new-${i}" value="skip"> Skip</label>
        </div>
      </div>`).join('');
  }

  if (!new_parts.length && !merges.length) {
    html = `<div class="sess-empty" style="padding:32px">Nothing to import — all rows had errors.</div>`;
    document.getElementById('import-action-btn').disabled = true;
  }

  document.getElementById('import-preview-content').innerHTML = html;
}

async function runImportCommit() {
  const { new_parts, merges } = importPreviewData;
  const rows = [];

  merges.forEach((m,i) => {
    const action = document.querySelector(`input[name="imp-merge-${i}"]:checked`)?.value || 'merge';
    rows.push({ ...m, action });
  });
  new_parts.forEach((p,i) => {
    const action = document.querySelector(`input[name="imp-new-${i}"]:checked`)?.value || 'new';
    rows.push({ ...p, action });
  });

  try {
    const result = await POST('/api/import/commit', { rows });
    closeModal('modal-import');
    // Reload data
    const pv = await GET('/api/parts');
    db.parts = pv.parts;
    refreshCounters();
    renderInventory();
    showToast(`Import done: ${result.added} added, ${result.merged} merged, ${result.skipped} skipped.`);
  } catch(e) { showToast('Import failed. Check server.'); }
}

// Simple CSV parser — handles quoted fields
function parseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(l=>l.trim());
  if (lines.length < 2) throw new Error('Need at least a header row and one data row');
  const headers = splitCSVLine(lines[0]).map(h=>h.toLowerCase().trim());
  return lines.slice(1).filter(l=>l.trim()).map(line => {
    const vals = splitCSVLine(line);
    const obj = {};
    headers.forEach((h,i) => { obj[h] = (vals[i]||'').trim(); });
    return obj;
  });
}

function splitCSVLine(line) {
  const result = []; let cur=''; let inQ=false;
  for(let i=0;i<line.length;i++) {
    const c=line[i];
    if(c==='"') { if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
    else if(c===','&&!inQ){result.push(cur);cur='';}
    else cur+=c;
  }
  result.push(cur);
  return result;
}

// ════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════

function downloadCSV(csv,filename) {
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download=filename; a.click();
}

function openModal(id)  { document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).style.display='none'; }

let toastTimer;
function showToast(msg) {
  const existing=document.querySelector('.toast');
  if(existing) existing.remove();
  clearTimeout(toastTimer);
  const t=document.createElement('div');
  t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  toastTimer=setTimeout(()=>t.remove(),3000);
}

// ════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  const tag=e.target.tagName.toLowerCase();
  const inInput=['input','textarea','select'].includes(tag);
  const anyModalOpen=document.querySelector('.modal-overlay[style*="flex"]');

  if(e.key==='Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m=>m.style.display='none');
    return;
  }
  if(anyModalOpen) return;

  if(e.key==='/'&&!inInput) {
    e.preventDefault();
    if(currentPage==='inventory')     document.getElementById('inv-search').focus();
    else if(currentPage==='wishlist') document.getElementById('wish-search').focus();
    else { navigate('inventory'); setTimeout(()=>document.getElementById('inv-search').focus(),50); }
    return;
  }

  if(!inInput) {
    if(e.key==='n'||e.key==='N') { currentPage==='wishlist'?openAddWishItem():openAddPart(); return; }
    if(e.key==='u'||e.key==='U') { openSession();         return; }
    if(e.key==='s'||e.key==='S') { openHistory();         return; }
    if(e.key==='i'||e.key==='I') { navigate('inventory'); return; }
    if(e.key==='w'||e.key==='W') { navigate('wishlist');  return; }
    if(e.key==='r'||e.key==='R') { navigate('restock');   return; }
    if(e.key==='h'||e.key==='H') { navigate('heatmap');   return; }
  }
});

document.addEventListener('click', e => {
  if(!e.target.closest('#sess-search')&&!e.target.closest('#sess-results')) {
    const r=document.getElementById('sess-results');
    if(r) r.style.display='none';
  }
});

['p-cat','ep-cat','w-cat'].forEach(id => {
  const el=document.getElementById(id);
  if(el) el.addEventListener('change',()=>handleCatSelect(id));
});

// Live dup check wiring (after DOM ready)
['p-name','p-value','p-pkg'].forEach(id => {
  const el=document.getElementById(id);
  if(el) el.addEventListener('input', checkDupLive);
});

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════

applyTheme();

loadAll()
  .then(() => {
    populateCatSelects();
    navigate('inventory');
  })
  .catch(err => {
    if (err.message === 'unauth') return;
    console.error('Failed to load data:', err);
    document.body.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:monospace;color:#dc2626;flex-direction:column;gap:12px;">
      <div style="font-size:32px;">⊗</div>
      <div>Failed to connect to CompDB server.</div>
      <div style="font-size:13px;color:#9ca3af;">Make sure app.py is running on localhost:5000</div>
    </div>`;
  });