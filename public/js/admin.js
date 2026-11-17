const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');

let currentStatus = 'pending';

/* ---------------- helpers ---------------- */
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('Sesi berakhir, silakan masuk ulang.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.');
  return data;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- auth ---------------- */
function showLogin() {
  $('#loginView').hidden = false;
  $('#adminView').hidden = true;
}
function showAdmin(username) {
  $('#loginView').hidden = true;
  $('#adminView').hidden = false;
  $('#welcomeText').textContent = `Masuk sebagai ${username}. Kelola pesanan & keuangan di sini.`;
  refreshAll();
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#loginMsg');
  msg.textContent = 'Memeriksa...';
  try {
    const data = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: $('#lUsername').value.trim(),
        email: $('#lEmail').value.trim(),
        password: $('#lPassword').value,
      }),
    });
    msg.textContent = '';
    showAdmin(data.username);
  } catch (err) {
    msg.textContent = err.message;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  showLogin();
});

(async function boot() {
  try {
    const data = await api('/api/admin/session');
    if (data.authenticated) showAdmin(data.username);
    else showLogin();
  } catch {
    showLogin();
  }
})();

/* ---------------- navigation ---------------- */
const TITLES = { dashboard: 'Dashboard', orders: 'Pesanan Pelanggan', finance: 'Keuangan', audit: 'Log Aktivitas' };
$$('.side-link').forEach((btn) =>
  btn.addEventListener('click', () => {
    $$('.side-link').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    $$('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
    $('#viewTitle').textContent = TITLES[view] || 'Dashboard';
    if (view === 'audit') loadAudit();
  })
);
$('#refreshBtn').addEventListener('click', () => { refreshAll(); toast('Data diperbarui'); });

/* ---------------- dashboard / finance ---------------- */
async function refreshAll() {
  await Promise.all([loadStats(), loadOrders()]);
}

async function loadStats() {
  const s = await api('/api/admin/stats');

  $('#statGross').textContent = rupiah(s.revenue.gross);
  $('#statGrossSub').textContent = `dari ${s.orders.approved} pesanan disetujui`;
  $('#statNet').textContent = rupiah(s.revenue.net);
  $('#statBalance').textContent = rupiah(s.balance.paid);
  $('#statBalanceSub').textContent = `${s.balance.ordersPaid} pesanan sudah dibayar`;
  $('#statPending').textContent = s.orders.pending;
  $('#statPendingSub').textContent = `senilai ${rupiah(s.orders.pendingValue)}`;

  $('#finGross').textContent = rupiah(s.revenue.gross);
  $('#finCogs').textContent = '−' + rupiah(s.revenue.cogs);
  $('#finExpenses').textContent = '−' + rupiah(s.revenue.expenses);
  $('#finNet').textContent = rupiah(s.revenue.net);

  $('#fBalance').textContent = rupiah(s.balance.paid);
  $('#fGross').textContent = rupiah(s.revenue.gross);
  $('#fCost').textContent = '−' + rupiah(s.revenue.cogs + s.revenue.expenses);
  $('#fNet').textContent = rupiah(s.revenue.net);

  const rank = $('#bestSeller');
  rank.innerHTML = s.bestSeller.length
    ? s.bestSeller.map((b, i) => `<li><span>${i + 1}. ${esc(b.name)}</span><span class="r-qty">${b.qty}x</span></li>`).join('')
    : '<li class="muted">Belum ada data.</li>';

  renderBars(s.last7);
}

function renderBars(rows) {
  const box = $('#barChart');
  if (!rows.length) { box.innerHTML = '<p class="muted">Belum ada pemasukan.</p>'; return; }
  const max = Math.max(...rows.map((r) => r.total), 1);
  box.innerHTML = rows
    .map((r) => {
      const h = Math.round((r.total / max) * 100);
      const day = new Date(r.day + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
      return `<div class="bar-col">
        <strong>${rupiah(r.total).replace('Rp', '')}</strong>
        <div class="bar" style="height:${h}%"></div>
        <span>${day}</span>
      </div>`;
    })
    .join('');
}

$('#expenseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/expenses', {
      method: 'POST',
      body: JSON.stringify({ label: $('#expLabel').value.trim(), amount: Number($('#expAmount').value) }),
    });
    $('#expLabel').value = '';
    $('#expAmount').value = '';
    toast('Pengeluaran dicatat');
    loadStats();
  } catch (err) {
    toast(err.message);
  }
});

/* ---------------- orders ---------------- */
$$('.chip').forEach((chip) =>
  chip.addEventListener('click', () => {
    $$('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    currentStatus = chip.dataset.status;
    loadOrders();
  })
);

async function loadOrders() {
  const url = currentStatus ? `/api/admin/orders?status=${currentStatus}` : '/api/admin/orders';
  const data = await api(url);
  const box = $('#ordersList');
  if (!data.orders.length) {
    box.innerHTML = '<p class="muted">Tidak ada pesanan pada kategori ini.</p>';
    return;
  }
  box.innerHTML = data.orders.map(orderCard).join('');
  $$('[data-act]').forEach((b) =>
    b.addEventListener('click', () => orderAction(b.dataset.act, Number(b.dataset.id)))
  );
}

function orderCard(o) {
  const items = o.items
    .map(
      (it) => `<li><span class="oi-name">${esc(it.name)} <small>×${it.qty}</small></span><span>${rupiah(it.subtotal)}</span></li>`
    )
    .join('');
  const actions = [];
  if (o.status === 'pending') {
    actions.push(`<button class="btn btn-primary btn-sm" data-act="approve" data-id="${o.id}">✓ ACC</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm" data-act="reject" data-id="${o.id}">✕ Tolak</button>`);
  }
  if (o.status === 'approved' && o.payment_status !== 'paid') {
    actions.push(`<button class="btn btn-primary btn-sm" data-act="pay" data-id="${o.id}">💵 Tandai Dibayar</button>`);
  }

  return `<article class="order">
    <div class="order-head">
      <div>
        <div class="order-code">${esc(o.code)}</div>
        <div class="order-cust">${esc(o.customer_name)}${o.table_no ? ' · Meja ' + esc(o.table_no) : ''}</div>
      </div>
      <div style="display:flex;gap:.4rem;flex-direction:column;align-items:flex-end">
        <span class="badge ${esc(o.status)}">${esc(o.status)}</span>
        <span class="badge ${esc(o.payment_status)}">${o.payment_status === 'paid' ? 'lunas' : 'belum bayar'}</span>
      </div>
    </div>
    <ul class="order-items">${items}</ul>
    ${o.note ? `<div class="order-cust">📝 ${esc(o.note)}</div>` : ''}
    <div class="order-total"><span>Total</span><span>${rupiah(o.total)}</span></div>
    ${actions.length ? `<div class="order-actions">${actions.join('')}</div>` : ''}
  </article>`;
}

async function orderAction(act, id) {
  const map = { approve: 'approve', reject: 'reject', pay: 'pay' };
  try {
    await api(`/api/admin/orders/${id}/${map[act]}`, { method: 'POST' });
    toast(act === 'pay' ? 'Pembayaran dicatat' : act === 'approve' ? 'Pesanan di-ACC' : 'Pesanan ditolak');
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
}

/* ---------------- audit ---------------- */
async function loadAudit() {
  const data = await api('/api/admin/audit');
  $('#auditTable tbody').innerHTML = data.log
    .map(
      (l) => `<tr><td>${esc(l.created_at)}</td><td>${esc(l.actor)}</td><td>${esc(l.action)}</td><td>${esc(l.detail)}</td></tr>`
    )
    .join('');
}
