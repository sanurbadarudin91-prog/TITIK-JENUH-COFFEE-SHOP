/* ==================================================================
   TITIK JENUH — halaman Keuangan (Financial Analytics)
   Laba dihitung otomatis: harga jual − harga modal (per item pesanan
   yang sudah di-ACC), lalu dikurangi pengeluaran operasional.
   ================================================================== */
let ctx, chart;

TJ.mount(
  { active: 'finance', title: 'Keuangan', subtitle: 'Laporan laba/rugi otomatis' },
  async (c) => {
    ctx = c;

    document.getElementById('expForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const label = document.getElementById('expLabel').value.trim();
      const amount = Math.round(Number(document.getElementById('expAmount').value));
      if (!label || !amount) return;

      const { error } = await c.sb.from('expenses').insert({ label, amount });
      if (error) return c.toast('Gagal mencatat pengeluaran', 'err');

      await c.sb.rpc('log_activity', { p_action: 'catat-pengeluaran', p_detail: `${label} Rp${amount}` });
      e.target.reset();
      c.toast('Pengeluaran dicatat');
      load();
    });

    await load();
  }
);

async function load() {
  const { sb, rupiah, esc, toast } = ctx;

  let f = null;

  // Jalur utama: fungsi database (butuh migrasi-v2.sql).
  const { data, error } = await sb.rpc('finance_report');
  if (!error && data) f = data;

  // Cadangan: hitung di sisi klien supaya laporan tetap tampil
  // meski fungsi database belum dibuat.
  if (!f) {
    try {
      f = await laporanCadangan(sb);
    } catch (e) {
      return toast('Gagal memuat laporan keuangan', 'err');
    }
  }

  document.getElementById('fGross').textContent = rupiah(f.gross);
  document.getElementById('fCogs').textContent = rupiah(f.cogs);
  document.getElementById('fProfit').textContent = rupiah(f.profit);
  document.getElementById('fNet').textContent = rupiah(f.net);

  document.getElementById('rGross').textContent = rupiah(f.gross);
  document.getElementById('rCogs').textContent = '−' + rupiah(f.cogs);
  document.getElementById('rProfit').textContent = rupiah(f.profit);
  document.getElementById('rExp').textContent = '−' + rupiah(f.expenses);
  document.getElementById('rNet').textContent = rupiah(f.net);
  document.getElementById('rPaid').textContent = rupiah(f.paid.amount);
  document.getElementById('rUnpaid').textContent = rupiah(f.unpaid.amount);

  renderChart(f.daily);

  document.getElementById('topItems').innerHTML = f.topItems.length
    ? f.topItems
        .map(
          (t) => `<tr>
            <td class="py-2.5 pr-3">${esc(t.name)}</td>
            <td class="py-2.5 text-right text-stone-500">${t.qty}x</td>
            <td class="py-2.5 text-right font-medium">${rupiah(t.revenue)}</td>
            <td class="py-2.5 text-right font-semibold text-emerald-700">${rupiah(t.profit)}</td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="4" class="py-8 text-center text-stone-400">Belum ada penjualan.</td></tr>';

  await loadExpenses();
}

async function loadExpenses() {
  const { sb, rupiah, esc, tanggal } = ctx;

  const { data } = await sb
    .from('expenses')
    .select('id, label, amount, created_at')
    .order('id', { ascending: false })
    .limit(10);

  document.getElementById('expList').innerHTML = data && data.length
    ? data
        .map(
          (e) => `<li class="flex items-center justify-between gap-2 border-b border-stone-100 pb-2">
            <div class="min-w-0">
              <div class="truncate">${esc(e.label)}</div>
              <div class="text-xs text-stone-400">${tanggal(e.created_at, false)}</div>
            </div>
            <span class="shrink-0 font-semibold text-red-600">−${rupiah(e.amount)}</span>
          </li>`
        )
        .join('')
    : '<li class="text-stone-400">Belum ada pengeluaran.</li>';
}

/* Perhitungan cadangan di sisi klien (dipakai bila fungsi DB belum ada). */
async function laporanCadangan(sb) {
  const { data: orders, error: e1 } = await sb
    .from('orders')
    .select('id, total, payment_status, created_at, items:order_items(name, qty, subtotal, cost)')
    .eq('status', 'approved');
  if (e1) throw e1;

  const { data: expenses, error: e2 } = await sb.from('expenses').select('amount');
  if (e2) throw e2;

  const angkaAtauNol = (v) => Number(v || 0);
  const kunciHari = (iso) => new Date(iso).toISOString().slice(0, 10);

  let gross = 0, cogs = 0, itemsSold = 0;
  let paid = 0, paidCount = 0, unpaid = 0, unpaidCount = 0;
  const perHari = new Map();
  const perMenu = new Map();
  const batas = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);

  for (const o of orders) {
    const total = angkaAtauNol(o.total);
    gross += total;

    if (o.payment_status === 'paid') { paid += total; paidCount++; }
    else { unpaid += total; unpaidCount++; }

    let modalPesanan = 0;
    for (const it of o.items || []) {
      const qty = angkaAtauNol(it.qty);
      const sub = angkaAtauNol(it.subtotal);
      const modal = angkaAtauNol(it.cost) * qty;

      modalPesanan += modal;
      itemsSold += qty;

      const m = perMenu.get(it.name) || { name: it.name, qty: 0, revenue: 0, profit: 0 };
      m.qty += qty;
      m.revenue += sub;
      m.profit += sub - modal;
      perMenu.set(it.name, m);
    }
    cogs += modalPesanan;

    const hari = kunciHari(o.created_at);
    if (hari >= batas) {
      const d = perHari.get(hari) || { day: hari, gross: 0, cogs: 0, profit: 0 };
      d.gross += total;
      d.cogs += modalPesanan;
      d.profit += total - modalPesanan;
      perHari.set(hari, d);
    }
  }

  const totalPengeluaran = (expenses || []).reduce((t, e) => t + angkaAtauNol(e.amount), 0);
  const profit = gross - cogs;

  return {
    gross,
    cogs,
    expenses: totalPengeluaran,
    profit,
    net: profit - totalPengeluaran,
    paid: { amount: paid, count: paidCount },
    unpaid: { amount: unpaid, count: unpaidCount },
    approved: orders.length,
    itemsSold,
    daily: [...perHari.values()].sort((a, b) => a.day.localeCompare(b.day)),
    topItems: [...perMenu.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
  };
}

function renderChart(rows) {
  const box = document.getElementById('chart');
  box.innerHTML = '<canvas></canvas>';

  const labels = rows.length
    ? rows.map((r) => new Date(r.day + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }))
    : ['Belum ada'];

  if (chart) chart.destroy();

  chart = new Chart(box.firstChild, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Pendapatan Kotor',
          data: rows.length ? rows.map((r) => r.gross) : [0],
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14,165,233,.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
        },
        {
          label: 'Laba Kotor',
          data: rows.length ? rows.map((r) => r.profit) : [0],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${ctx.rupiah(c.parsed.y)}` } },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => (v >= 1000 ? v / 1000 + 'rb' : v) },
          grid: { color: '#f5f5f4' },
        },
        x: { grid: { display: false } },
      },
    },
  });
}
