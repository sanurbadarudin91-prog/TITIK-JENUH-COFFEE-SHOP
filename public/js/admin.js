/* ==================================================================
   TITIK JENUH — panel admin (tanpa backend sendiri)
   Login lewat Supabase Auth; seluruh data dijaga Row Level Security.
   ================================================================== */
const CFG = window.TJ_CONFIG;
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');

let currentStatus = 'pending';
let adminUsername = '';

/* ---------------- helpers ---------------- */
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

function logActivity(action, detail = '') {
  sb.rpc('log_activity', { p_action: action, p_detail: detail }).then(() => {}, () => {});
}

/* ---------------- auth ---------------- */
function showLogin() {
  $('#loginView').hidden = false;
  $('#adminView').hidden = true;
}

function showAdmin(username) {
  adminUsername = username;
  $('#loginView').hidden = true;
  $('#adminView').hidden = false;
  $('#welcomeText').textContent = `Masuk sebagai ${username}. Kelola pesanan & keuangan di sini.`;
  refreshAll();
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#loginMsg');
  msg.textContent = 'Memeriksa...';

  const username = $('#lUsername').value.trim();
  const email = $('#lEmail').value.trim();
  const password = $('#lPassword').value;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    msg.textContent = 'Email atau password salah.';
    return;
  }

  // Pastikan akun ini terdaftar sebagai admin.
  const { data: row } = await sb
    .from('admins')
    .select('username')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (!row) {
    await sb.auth.signOut();
    msg.textContent = 'Akun ini tidak punya akses admin.';
    return;
  }

  if (username && row.username !== username) {
    await sb.auth.signOut();
    msg.textContent = 'Username tidak cocok dengan akun ini.';
    return;
  }

  msg.textContent = '';
  $('#lPassword').value = '';
  showAdmin(row.username);
  logActivity('login-berhasil', '');
});

$('#logoutBtn').addEventListener('click', async () => {
  logActivity('logout', '');
  await sb.auth.signOut();
  showLogin();
});

(async function boot() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return showLogin();

  const { data: row } = await sb
    .from('admins')
    .select('username')
    .eq('user_id', data.session.user.id)
    .maybeSingle();

  if (!row) return showLogin();
  showAdmin(row.username);
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
  const { data: s, error } = await sb.rpc('admin_stats');
  if (error || !s) {
    toast('Gagal memuat statistik.');
    return;
  }

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
  const label = $('#expLabel').value.trim();
  const amount = Math.round(Number($('#expAmount').value));

  const { error } = await sb.from('expenses').insert({ label, amount });
  if (error) return toast('Gagal mencatat pengeluaran.');

  $('#expLabel').value = '';
  $('#expAmount').value = '';
  toast('Pengeluaran dicatat');
  logActivity('catat-pengeluaran', `${label} Rp${amount}`);
  loadStats();
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
  let query = sb
    .from('orders')
    .select('*, items:order_items(name, price, qty, subtotal)')
    .order('id', { ascending: false })
    .limit(200);

  if (currentStatus) query = query.eq('status', currentStatus);

  const { data, error } = await query;
  const box = $('#ordersList');

  if (error) {
    box.innerHTML = '<p class="muted">Gagal memuat pesanan.</p>';
    return;
  }
  if (!data.length) {
    box.innerHTML = '<p class="muted">Tidak ada pesanan pada kategori ini.</p>';
    return;
  }

  box.innerHTML = data.map(orderCard).join('');
  $$('[data-act]').forEach((b) =>
    b.addEventListener('click', () => orderAction(b.dataset.act, Number(b.dataset.id), b.dataset.code))
  );
}

function orderCard(o) {
  const items = (o.items || [])
    .map(
      (it) => `<li><span class="oi-name">${esc(it.name)} <small>×${it.qty}</small></span><span>${rupiah(it.subtotal)}</span></li>`
    )
    .join('');

  const actions = [];
  if (o.status === 'pending') {
    actions.push(`<button class="btn btn-primary btn-sm" data-act="approve" data-id="${o.id}" data-code="${esc(o.code)}">✓ ACC</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm" data-act="reject" data-id="${o.id}" data-code="${esc(o.code)}">✕ Tolak</button>`);
  }
  if (o.status === 'approved' && o.payment_status !== 'paid') {
    actions.push(`<button class="btn btn-primary btn-sm" data-act="pay" data-id="${o.id}" data-code="${esc(o.code)}">💵 Tandai Dibayar</button>`);
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

async function orderAction(act, id, code) {
  const patch =
    act === 'pay'
      ? { payment_status: 'paid', updated_at: new Date().toISOString() }
      : { status: act === 'approve' ? 'approved' : 'rejected', updated_at: new Date().toISOString() };

  const { error } = await sb.from('orders').update(patch).eq('id', id);
  if (error) return toast('Gagal memperbarui pesanan.');

  toast(act === 'pay' ? 'Pembayaran dicatat' : act === 'approve' ? 'Pesanan di-ACC' : 'Pesanan ditolak');
  logActivity(
    act === 'pay' ? 'pembayaran-diterima' : `pesanan-${act === 'approve' ? 'approved' : 'rejected'}`,
    code || ''
  );
  await refreshAll();
}

/* ---------------- audit ---------------- */
async function loadAudit() {
  const { data, error } = await sb
    .from('activity_log')
    .select('created_at, actor, action, detail')
    .order('id', { ascending: false })
    .limit(50);

  $('#auditTable tbody').innerHTML = error
    ? '<tr><td colspan="4" class="muted">Gagal memuat log.</td></tr>'
    : (data || [])
        .map((l) => {
          const t = new Date(l.created_at).toLocaleString('id-ID');
          return `<tr><td>${esc(t)}</td><td>${esc(l.actor)}</td><td>${esc(l.action)}</td><td>${esc(l.detail)}</td></tr>`;
        })
        .join('');
}
