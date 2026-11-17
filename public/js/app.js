/* ==================================================================
   TITIK JENUH — halaman pengunjung (tanpa backend sendiri)
   Data menu & pesanan langsung ke Supabase.
   ================================================================== */
const CFG = window.TJ_CONFIG;
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');

let MENU = [];
let activeCategory = 'Semua';
const cart = new Map(); // id -> qty

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------------- Navbar ---------------- */
$('#hamburger').addEventListener('click', () => $('#navLinks').classList.toggle('open'));
$$('#navLinks a').forEach((a) => a.addEventListener('click', () => $('#navLinks').classList.remove('open')));

/* ---------------- Search (sekaligus gerbang admin) ---------------- */
const searchPanel = $('#searchPanel');
$('#searchToggle').addEventListener('click', () => {
  searchPanel.classList.toggle('open');
  if (searchPanel.classList.contains('open')) $('#searchInput').focus();
});
$('#searchClose').addEventListener('click', () => searchPanel.classList.remove('open'));
$('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
$('#searchGo').addEventListener('click', runSearch);

function runSearch() {
  const q = $('#searchInput').value.trim();
  if (!q) return;

  // Pintu tersembunyi panel admin.
  if (q === CFG.gateToken) {
    sessionStorage.setItem('tj_gate', '1');
    $('#searchResults').innerHTML = '<p class="muted">Membuka panel admin...</p>';
    window.location.href = CFG.adminPath;
    return;
  }

  const term = q.toLowerCase();
  const items = MENU.filter(
    (m) =>
      m.name.toLowerCase().includes(term) ||
      m.category.toLowerCase().includes(term) ||
      (m.description || '').toLowerCase().includes(term)
  );
  renderSearch(items);
}

function renderSearch(items) {
  const box = $('#searchResults');
  if (!items.length) {
    box.innerHTML = '<p class="muted">Menu tidak ditemukan. Coba kata lain.</p>';
    return;
  }
  box.innerHTML = items
    .map(
      (m) => `<div class="sr-item">
        <div><strong>${esc(m.name)}</strong><span>${esc(m.category)}</span></div>
        <span class="sr-price">${rupiah(m.price)}</span>
      </div>`
    )
    .join('');
}

/* ---------------- Config ---------------- */
function loadConfig() {
  const c = CFG.cafe;
  $('#infoHours').textContent = c.hours;
  $('#infoAddress').textContent = c.address;
  $('#infoPhone').textContent = c.phone;
  $('#infoIg').href = c.instagram;
  $('#mapsBtn').href = c.maps;
  $('#year').textContent = new Date().getFullYear();
}

/* ---------------- Menu ---------------- */
// Kolom foto (image_url) ada setelah migrasi-v2.sql dijalankan. Kalau belum,
// otomatis mundur ke daftar kolom tanpa foto supaya website tetap tampil.
async function ambilMenu() {
  const dasar = 'id, name, category, description, price';
  const denganFoto = await sb
    .from('menu_items')
    .select(`${dasar}, image_url`)
    .eq('available', true)
    .order('category')
    .order('sort_order');

  if (!denganFoto.error) return denganFoto;

  return sb
    .from('menu_items')
    .select(dasar)
    .eq('available', true)
    .order('category')
    .order('sort_order');
}

async function loadMenu() {
  const { data, error } = await ambilMenu();

  if (error) {
    $('#menuGrid').innerHTML = '<p class="muted">Gagal memuat menu. Coba muat ulang halaman.</p>';
    return;
  }

  MENU = data || [];
  buildTabs();
  renderMenu();
  buildPicker();
}

function buildTabs() {
  const cats = ['Semua', ...new Set(MENU.map((m) => m.category))];
  $('#menuTabs').innerHTML = cats
    .map((c) => `<button class="tab ${c === activeCategory ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join('');
  $$('#menuTabs .tab').forEach((btn) =>
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      buildTabs();
      renderMenu();
    })
  );
}

const EMOJI = { Coffee: '☕', 'Non-Coffee': '🧋', 'Snack & Pastry': '🥐' };

function renderMenu() {
  const list = activeCategory === 'Semua' ? MENU : MENU.filter((m) => m.category === activeCategory);
  $('#menuGrid').innerHTML = list
    .map(
      (m) => `<article class="menu-card">
        <div class="mc-img">${
          m.image_url
            ? `<img src="${esc(m.image_url)}" alt="${esc(m.name)}" loading="lazy" />`
            : EMOJI[m.category] || '🍽️'
        }</div>
        <div class="mc-body">
          <span class="mc-cat">${esc(m.category)}</span>
          <h3>${esc(m.name)}</h3>
          <p>${esc(m.description || '')}</p>
          <div class="mc-foot">
            <span class="mc-price">${rupiah(m.price)}</span>
            <button class="btn btn-ghost" data-add="${m.id}">+ Pesan</button>
          </div>
        </div>
      </article>`
    )
    .join('');

  $$('[data-add]').forEach((btn) =>
    btn.addEventListener('click', () => {
      addToCart(Number(btn.dataset.add), 1);
      toast('Ditambahkan ke pesanan');
    })
  );
}

/* ---------------- Order form ---------------- */
function buildPicker() {
  $('#orderPicker').innerHTML = MENU.map(
    (m) => `<div class="pick-row">
      <div>
        <span class="pr-name">${esc(m.name)}</span>
        <span class="pr-price">${rupiah(m.price)}</span>
      </div>
      <div class="qty">
        <button type="button" data-dec="${m.id}">−</button>
        <input type="number" min="0" value="0" data-qty="${m.id}" readonly />
        <button type="button" data-inc="${m.id}">+</button>
      </div>
    </div>`
  ).join('');

  $$('[data-inc]').forEach((b) => b.addEventListener('click', () => addToCart(Number(b.dataset.inc), 1)));
  $$('[data-dec]').forEach((b) => b.addEventListener('click', () => addToCart(Number(b.dataset.dec), -1)));
}

function addToCart(id, delta) {
  const next = Math.max(0, (cart.get(id) || 0) + delta);
  if (next === 0) cart.delete(id); else cart.set(id, next);
  const input = $(`[data-qty="${id}"]`);
  if (input) input.value = next;
  updateTotal();
}

function updateTotal() {
  let total = 0;
  cart.forEach((qty, id) => {
    const m = MENU.find((x) => x.id === id);
    if (m) total += m.price * qty;
  });
  $('#orderTotal').textContent = rupiah(total);
}

$('#orderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#orderMsg');
  const name = $('#custName').value.trim();
  if (!name) { msg.className = 'order-msg err'; msg.textContent = 'Nama wajib diisi.'; return; }
  if (cart.size === 0) { msg.className = 'order-msg err'; msg.textContent = 'Pilih minimal 1 menu dulu ya.'; return; }

  const items = [...cart.entries()].map(([id, qty]) => ({ id, qty }));
  msg.className = 'order-msg';
  msg.textContent = 'Mengirim pesanan...';

  const { data, error } = await sb.rpc('create_order', {
    p_name: name,
    p_table: $('#custTable').value.trim(),
    p_note: $('#custNote').value.trim(),
    p_items: items,
  });

  if (error) {
    msg.className = 'order-msg err';
    msg.textContent = error.message || 'Gagal mengirim pesanan.';
    return;
  }

  msg.className = 'order-msg ok';
  msg.textContent = `Pesanan terkirim! Kode: ${data.code}. Total ${rupiah(data.total)}. Menunggu konfirmasi kasir.`;
  cart.clear();
  $$('[data-qty]').forEach((i) => (i.value = 0));
  updateTotal();
  $('#orderForm').reset();
  toast('Pesanan berhasil dikirim ☕');
});

/* ---------------- utils ---------------- */
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

loadConfig();
loadMenu();
updateTotal();
