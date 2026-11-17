/* ==================================================================
   TITIK JENUH — halaman Pesanan (Order Management)
   ACC Pesanan  -> status jadi 'approved' + dicatat ke Log Aktivitas,
                   lalu pesanan HILANG dari daftar ini.
   ================================================================== */
let ctx;
let filter = 'pending';

TJ.mount(
  { active: 'orders', title: 'Pesanan', subtitle: 'Tinjau dan setujui pesanan pelanggan' },
  async (c) => {
    ctx = c;

    document.querySelectorAll('.tj-chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        document.querySelectorAll('.tj-chip').forEach((x) => {
          x.className = 'tj-chip px-4 py-2 rounded-full text-sm font-medium bg-white border border-stone-200 text-stone-600 hover:bg-stone-50';
        });
        chip.className = 'tj-chip px-4 py-2 rounded-full text-sm font-medium bg-amber-500 text-stone-900';
        filter = chip.dataset.filter;
        load();
      })
    );

    document.getElementById('btnRefresh').addEventListener('click', () => {
      load();
      c.toast('Data diperbarui');
    });

    await load();
  }
);

async function load() {
  const { sb } = ctx;

  let q = sb
    .from('orders')
    .select('id, code, customer_name, table_no, note, status, total, created_at, items:order_items(name, qty, subtotal)')
    .order('id', { ascending: false })
    .limit(200);

  if (filter) q = q.eq('status', filter);

  const { data, error } = await q;
  const box = document.getElementById('ordersList');

  if (error) { box.innerHTML = '<p class="text-red-600">Gagal memuat pesanan.</p>'; return; }
  if (!data.length) {
    box.innerHTML = `<div class="md:col-span-2 bg-white rounded-2xl p-8 text-center text-stone-400 border border-stone-200">
      Tidak ada pesanan pada kategori ini.</div>`;
    return;
  }

  box.innerHTML = data.map(card).join('');

  document.querySelectorAll('[data-act]').forEach((btn) =>
    btn.addEventListener('click', () => act(btn.dataset.act, Number(btn.dataset.id), btn.dataset.code))
  );
}

function card(o) {
  const { rupiah, esc, tanggal, STATUS_LABEL, STATUS_CLASS } = ctx;

  const items = (o.items || [])
    .map(
      (it) => `<li class="flex justify-between text-sm">
        <span>${esc(it.name)} <span class="text-stone-400">×${it.qty}</span></span>
        <span class="font-medium">${rupiah(it.subtotal)}</span>
      </li>`
    )
    .join('');

  const actions = [];
  if (o.status === 'pending') {
    actions.push(`<button data-act="approve" data-id="${o.id}" data-code="${esc(o.code)}"
      class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl transition">
      ✓ ACC Pesanan</button>`);
    actions.push(`<button data-act="reject" data-id="${o.id}" data-code="${esc(o.code)}"
      class="px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium py-2.5 rounded-xl transition">
      ✕ Tolak</button>`);
  }

  return `<article class="bg-white rounded-2xl p-5 shadow-sm border border-stone-200 flex flex-col">
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="min-w-0">
        <div class="font-mono text-xs text-stone-400">${esc(o.code)}</div>
        <div class="font-bold truncate">${esc(o.customer_name)}</div>
        <div class="text-xs text-stone-500">
          ${o.table_no ? 'Meja ' + esc(o.table_no) + ' · ' : ''}${tanggal(o.created_at)}
        </div>
      </div>
      <span class="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_CLASS[o.status]}">${STATUS_LABEL[o.status]}</span>
    </div>

    <ul class="space-y-1.5 border-t border-stone-100 pt-3 flex-1">${items}</ul>

    ${o.note ? `<p class="text-xs text-stone-500 mt-3 bg-stone-50 rounded-lg p-2">📝 ${esc(o.note)}</p>` : ''}

    <div class="flex items-center justify-between mt-4 pt-3 border-t border-stone-100">
      <span class="text-sm text-stone-500">Total</span>
      <strong class="text-lg">${rupiah(o.total)}</strong>
    </div>

    ${actions.length ? `<div class="flex gap-2 mt-3">${actions.join('')}</div>` : ''}
  </article>`;
}

async function act(action, id, code) {
  const { sb, toast } = ctx;

  const baru = action === 'approve' ? 'approved' : 'rejected';
  const { error } = await sb
    .from('orders')
    .update({ status: baru, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return toast('Gagal memperbarui pesanan.', 'err');

  await sb.rpc('log_activity', {
    p_action: action === 'approve' ? 'pesanan-disetujui' : 'pesanan-ditolak',
    p_detail: `${code} · ${action === 'approve' ? 'diterima kasir' : 'ditolak kasir'}`,
  });

  toast(action === 'approve' ? 'Pesanan di-ACC — dipindah ke Log Aktivitas' : 'Pesanan ditolak');
  load();
}
