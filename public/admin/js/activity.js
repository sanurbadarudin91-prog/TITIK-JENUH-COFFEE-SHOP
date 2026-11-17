/* ==================================================================
   TITIK JENUH — halaman Log Aktivitas
   Menampilkan pelanggan yang sudah di-ACC + toggle status pembayaran,
   beserta riwayat aktivitas admin.
   ================================================================== */
let ctx;

TJ.mount(
  { active: 'activity', title: 'Log Aktivitas', subtitle: 'Pelanggan di-ACC, pembayaran, dan riwayat admin' },
  async (c) => {
    ctx = c;
    document.getElementById('btnRefresh').addEventListener('click', () => {
      loadAll();
      c.toast('Data diperbarui');
    });
    await loadAll();
  }
);

async function loadAll() {
  await Promise.all([loadAccepted(), loadLog()]);
}

/* ---------------- Pelanggan di-ACC + pembayaran ---------------- */
async function loadAccepted() {
  const { sb, rupiah, esc, tanggal, toast } = ctx;

  const { data, error } = await sb
    .from('orders')
    .select('id, code, customer_name, table_no, total, payment_status, created_at')
    .eq('status', 'approved')
    .order('id', { ascending: false })
    .limit(200);

  if (error) return toast('Gagal memuat data pelanggan', 'err');

  const paid = data.filter((o) => o.payment_status === 'paid');
  const unpaid = data.filter((o) => o.payment_status !== 'paid');
  const sum = (arr) => arr.reduce((t, o) => t + Number(o.total || 0), 0);

  document.getElementById('pAcc').textContent = data.length;
  document.getElementById('pPaid').textContent = rupiah(sum(paid));
  document.getElementById('pPaidCount').textContent = `${paid.length} pesanan`;
  document.getElementById('pUnpaid').textContent = rupiah(sum(unpaid));
  document.getElementById('pUnpaidCount').textContent = `${unpaid.length} pesanan`;

  const badge = (o) =>
    o.payment_status === 'paid'
      ? '<span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">● Sudah Bayar</span>'
      : '<span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">○ Belum Bayar</span>';

  const tombol = (o) =>
    o.payment_status === 'paid'
      ? `<button data-pay="${o.id}" data-next="unpaid" data-code="${esc(o.code)}"
           class="text-xs font-medium px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition">
           Tandai Belum Bayar</button>`
      : `<button data-pay="${o.id}" data-next="paid" data-code="${esc(o.code)}"
           class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition">
           💵 Tandai Sudah Bayar</button>`;

  /* Tabel desktop */
  const tbody = document.getElementById('accTable');
  tbody.innerHTML = data.length
    ? data
        .map(
          (o) => `<tr class="hover:bg-stone-50">
            <td class="px-5 py-3">
              <div class="font-medium">${esc(o.customer_name)}</div>
              ${o.table_no ? `<div class="text-xs text-stone-400">Meja ${esc(o.table_no)}</div>` : ''}
            </td>
            <td class="px-5 py-3 font-mono text-xs text-stone-500">${esc(o.code)}</td>
            <td class="px-5 py-3 text-stone-500">${tanggal(o.created_at)}</td>
            <td class="px-5 py-3 text-right font-semibold">${rupiah(o.total)}</td>
            <td class="px-5 py-3">
              <div class="flex items-center justify-center gap-2">
                ${badge(o)}${tombol(o)}
              </div>
            </td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="px-5 py-10 text-center text-stone-400">Belum ada pesanan yang di-ACC.</td></tr>';

  /* Kartu mobile */
  const cards = document.getElementById('accCards');
  cards.innerHTML = data.length
    ? data
        .map(
          (o) => `<div class="p-4 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="font-semibold">${esc(o.customer_name)}</div>
                <div class="font-mono text-xs text-stone-400">${esc(o.code)}</div>
              </div>
              <strong>${rupiah(o.total)}</strong>
            </div>
            <div class="text-xs text-stone-500">${tanggal(o.created_at)}</div>
            <div class="flex items-center justify-between gap-2 pt-1">
              ${badge(o)}${tombol(o)}
            </div>
          </div>`
        )
        .join('')
    : '<p class="p-8 text-center text-stone-400 text-sm">Belum ada pesanan yang di-ACC.</p>';

  document.querySelectorAll('[data-pay]').forEach((b) =>
    b.addEventListener('click', () => togglePay(Number(b.dataset.pay), b.dataset.next, b.dataset.code))
  );
}

async function togglePay(id, next, code) {
  const { sb, toast } = ctx;

  const { error } = await sb
    .from('orders')
    .update({ payment_status: next, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return toast('Gagal mengubah status pembayaran', 'err');

  await sb.rpc('log_activity', {
    p_action: next === 'paid' ? 'pembayaran-diterima' : 'pembayaran-dibatalkan',
    p_detail: code,
  });

  toast(next === 'paid' ? 'Ditandai sudah bayar' : 'Ditandai belum bayar');
  loadAll();
}

/* ---------------- Riwayat aktivitas ---------------- */
async function loadLog() {
  const { sb, esc, tanggal, toast } = ctx;

  const { data, error } = await sb
    .from('activity_log')
    .select('created_at, actor, action, detail')
    .order('id', { ascending: false })
    .limit(100);

  if (error) return toast('Gagal memuat log', 'err');

  document.getElementById('pLog').textContent = data.length;

  const IKON = {
    'login-berhasil': '🔓',
    logout: '🚪',
    'pesanan-disetujui': '✅',
    'pesanan-ditolak': '❌',
    'pembayaran-diterima': '💵',
    'pembayaran-dibatalkan': '↩️',
    'catat-pengeluaran': '🧾',
    'menu-ditambah': '➕',
    'menu-dihapus': '🗑️',
    'menu-diubah': '✏️',
  };

  document.getElementById('logList').innerHTML = data.length
    ? data
        .map(
          (l) => `<li class="px-5 md:px-6 py-3 flex items-start gap-3 hover:bg-stone-50">
            <span class="text-lg shrink-0">${IKON[l.action] || '•'}</span>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium">${esc(l.action)}</div>
              ${l.detail ? `<div class="text-xs text-stone-500">${esc(l.detail)}</div>` : ''}
              <div class="text-xs text-stone-400 mt-0.5">${esc(l.actor)} · ${tanggal(l.created_at)}</div>
            </div>
          </li>`
        )
        .join('')
    : '<li class="px-6 py-10 text-center text-stone-400 text-sm">Belum ada aktivitas.</li>';
}
