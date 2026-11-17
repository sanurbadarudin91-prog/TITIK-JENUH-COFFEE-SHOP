/* ==================================================================
   TITIK JENUH — halaman Dashboard (statistik & grafik)
   ================================================================== */
let ctx, chart;

TJ.mount(
  { active: 'dashboard', title: 'Dashboard', subtitle: 'Ringkasan performa kafe hari ini' },
  async (c) => {
    ctx = c;

    document.getElementById('btnRefresh').addEventListener('click', () => {
      load();
      c.toast('Data diperbarui');
    });

    await load();
  }
);

async function load() {
  const { sb, rupiah, esc } = ctx;

  const { data: s, error } = await sb.rpc('admin_stats');
  if (error || !s) return ctx.toast('Gagal memuat statistik', 'err');

  const total = s.orders.approved + s.orders.pending + s.orders.rejected;

  document.getElementById('kTotal').textContent = total;
  document.getElementById('kGross').textContent = rupiah(s.revenue.gross);
  document.getElementById('kNet').textContent = rupiah(s.revenue.net);
  document.getElementById('kPending').textContent = s.orders.pending;
  document.getElementById('kPendingSub').textContent = `senilai ${rupiah(s.orders.pendingValue)}`;

  /* Menu terlaris */
  const best = document.getElementById('bestSeller');
  best.innerHTML = s.bestSeller.length
    ? s.bestSeller
        .map(
          (b, i) => `<li class="flex items-center justify-between border-b border-stone-100 pb-2">
            <span>${i + 1}. ${esc(b.name)}</span>
            <span class="font-semibold text-stone-500">${b.qty}x</span>
          </li>`
        )
        .join('')
    : '<li class="text-stone-400">Belum ada data.</li>';

  renderChart(s.last7);
  await loadRecent();
}

/* ---------------- Grafik (Chart.js) ---------------- */
function renderChart(rows) {
  const canvas = document.getElementById('chart');
  canvas.innerHTML = '<canvas></canvas>';

  const labels = rows.length
    ? rows.map((r) => new Date(r.day + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }))
    : ['Belum ada'];
  const values = rows.length ? rows.map((r) => r.total) : [0];

  if (chart) chart.destroy();

  chart = new Chart(canvas.firstChild, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: values,
          backgroundColor: '#f59e0b',
          hoverBackgroundColor: '#d97706',
          borderRadius: 8,
          maxBarThickness: 48,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => ctx.rupiah(c.parsed.y) },
        },
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

/* ---------------- Pesanan terbaru ---------------- */
async function loadRecent() {
  const { sb, rupiah, esc, tanggal, STATUS_LABEL, STATUS_CLASS } = ctx;

  const { data, error } = await sb
    .from('orders')
    .select('code, customer_name, total, status, created_at')
    .order('id', { ascending: false })
    .limit(5);

  const box = document.getElementById('recentOrders');
  if (error) { box.innerHTML = '<p class="text-stone-400">Gagal memuat.</p>'; return; }
  if (!data.length) { box.innerHTML = '<p class="text-stone-400">Belum ada pesanan.</p>'; return; }

  box.innerHTML = data
    .map(
      (o) => `<div class="flex items-center justify-between gap-2 border-b border-stone-100 pb-2">
        <div class="min-w-0">
          <div class="font-medium truncate">${esc(o.customer_name)}</div>
          <div class="text-xs text-stone-400">${esc(o.code)} · ${tanggal(o.created_at, false)}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="font-semibold">${rupiah(o.total)}</div>
          <span class="text-xs px-2 py-0.5 rounded-full ${STATUS_CLASS[o.status]}">${STATUS_LABEL[o.status]}</span>
        </div>
      </div>`
    )
    .join('');
}
