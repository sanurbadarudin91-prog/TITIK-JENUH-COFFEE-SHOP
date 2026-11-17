/* ==================================================================
   TITIK JENUH — halaman Kelola Menu
   Tambah menu (dengan foto), hapus menu, dan ubah ketersediaan.
   Foto disimpan di Supabase Storage bucket 'menu-photos'.
   ================================================================== */
const BUCKET = 'menu-photos';
const EMOJI = { Coffee: '☕', 'Non-Coffee': '🧋', 'Snack & Pastry': '🥐' };

let ctx;
let MENU = [];
let fileTerpilih = null;

TJ.mount(
  { active: 'menu', title: 'Kelola Menu', subtitle: 'Tambah, ubah, dan hapus menu kafe' },
  async (c) => {
    ctx = c;
    pasangForm();
    await load();
  }
);

/* ---------------- Form: pilih foto ---------------- */
function pasangForm() {
  const { toast } = ctx;

  const input = document.getElementById('mPhoto');
  const zone = document.getElementById('dropZone');
  const preview = document.getElementById('preview');
  const hint = document.getElementById('dropHint');

  zone.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) return toast('File harus berupa gambar', 'err');
    if (file.size > 5 * 1024 * 1024) return toast('Ukuran foto maksimal 5 MB', 'err');

    fileTerpilih = file;
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
    hint.classList.add('hidden');
  });

  const cost = document.getElementById('mCost');
  const price = document.getElementById('mPrice');
  const info = document.getElementById('marginInfo');

  const hitungMargin = () => {
    const modal = Number(cost.value || 0);
    const jual = Number(price.value || 0);
    if (!jual) { info.textContent = 'Margin: —'; return; }
    const margin = jual - modal;
    const persen = modal ? Math.round((margin / modal) * 100) : 0;
    info.innerHTML = `Margin: <strong class="text-emerald-700">${ctx.rupiah(margin)}</strong> (${persen}%)`;
  };
  cost.addEventListener('input', hitungMargin);
  price.addEventListener('input', hitungMargin);

  document.getElementById('searchMenu').addEventListener('input', render);

  document.getElementById('menuForm').addEventListener('submit', simpan);
}

/* ---------------- Simpan menu baru ---------------- */
async function simpan(e) {
  e.preventDefault();
  const { sb, toast } = ctx;

  const btn = document.getElementById('submitBtn');
  const msg = document.getElementById('formMsg');

  const name = document.getElementById('mName').value.trim();
  const category = document.getElementById('mCategory').value;
  const cost = Math.round(Number(document.getElementById('mCost').value));
  const price = Math.round(Number(document.getElementById('mPrice').value));
  const description = document.getElementById('mDesc').value.trim();

  if (!name) { msg.textContent = 'Nama menu wajib diisi.'; return; }
  if (price <= 0) { msg.textContent = 'Harga jual harus lebih dari 0.'; return; }

  msg.textContent = '';
  btn.disabled = true;

  try {
    const payload = {
      name,
      category,
      description,
      price,
      cost,
      available: true,
    };

    if (adaKolomFoto) {
      payload.image_url = fileTerpilih ? await uploadFoto(fileTerpilih) : '';
    } else if (fileTerpilih) {
      msg.textContent = 'Foto dilewati: jalankan migration-v2.sql dulu.';
    }

    btn.textContent = 'Menyimpan...';

    const { error } = await sb.from('menu_items').insert(payload);
    if (error) throw error;

    await sb.rpc('log_activity', { p_action: 'menu-ditambah', p_detail: `${name} · ${ctx.rupiah(price)}` });

    e.target.reset();
    fileTerpilih = null;
    document.getElementById('preview').classList.add('hidden');
    document.getElementById('dropHint').classList.remove('hidden');
    document.getElementById('marginInfo').textContent = 'Margin: —';

    toast('Menu berhasil ditambahkan');
    await load();
  } catch (err) {
    msg.textContent = err.message || 'Gagal menyimpan menu.';
  } finally {
    btn.disabled = false;
    btn.textContent = '+ Simpan Menu';
  }
}

async function uploadFoto(file) {
  const { sb } = ctx;

  const bersih = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-40);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${bersih}`;

  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error('Gagal mengunggah foto: ' + error.message);

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/* ---------------- Daftar menu ---------------- */
let adaKolomFoto = true;

async function load() {
  const { sb, toast } = ctx;

  const dasar = 'id, name, category, description, price, cost, available';
  const lengkap = await sb
    .from('menu_items')
    .select(`${dasar}, image_url`)
    .order('category')
    .order('sort_order')
    .order('id');

  let data, error;

  if (lengkap.error) {
    // Kolom foto belum ada → migrasi-v2.sql belum dijalankan.
    adaKolomFoto = false;
    document.getElementById('migrasiWarning').classList.remove('hidden');
    ({ data, error } = await sb
      .from('menu_items')
      .select(dasar)
      .order('category')
      .order('sort_order')
      .order('id'));
  } else {
    adaKolomFoto = true;
    document.getElementById('migrasiWarning').classList.add('hidden');
    ({ data, error } = lengkap);
  }

  if (error) return toast('Gagal memuat menu', 'err');

  MENU = data || [];
  render();
}

function render() {
  const { rupiah, esc } = ctx;
  const q = document.getElementById('searchMenu').value.trim().toLowerCase();

  const list = q
    ? MENU.filter((m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q))
    : MENU;

  document.getElementById('menuCount').textContent = `${MENU.length} menu`;

  const box = document.getElementById('menuList');
  if (!list.length) {
    box.innerHTML = '<p class="text-stone-400 sm:col-span-2">Tidak ada menu yang cocok.</p>';
    return;
  }

  box.innerHTML = list
    .map((m) => {
      const margin = Number(m.price) - Number(m.cost);
      const persen = m.cost ? Math.round((margin / m.cost) * 100) : 0;
      const foto = m.image_url
        ? `<img src="${esc(m.image_url)}" alt="" class="w-full h-36 object-cover rounded-xl bg-stone-100" loading="lazy" />`
        : `<div class="w-full h-36 rounded-xl bg-stone-100 grid place-items-center text-4xl">${EMOJI[m.category] || '🍽️'}</div>`;

      return `<article class="bg-white rounded-2xl p-4 shadow-sm border border-stone-200 flex flex-col ${m.available ? '' : 'opacity-60'}">
        ${foto}
        <div class="mt-3 flex-1">
          <div class="flex items-start justify-between gap-2">
            <span class="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">${esc(m.category)}</span>
            ${m.available ? '' : '<span class="text-xs font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">Nonaktif</span>'}
          </div>
          <h3 class="font-bold mt-1.5">${esc(m.name)}</h3>
          <p class="text-xs text-stone-500 line-clamp-2 mt-0.5">${esc(m.description || 'Tanpa deskripsi.')}</p>

          <div class="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div class="bg-stone-50 rounded-lg p-2">
              <span class="text-stone-500 block">Harga Jual</span>
              <strong class="text-stone-900">${rupiah(m.price)}</strong>
            </div>
            <div class="bg-stone-50 rounded-lg p-2">
              <span class="text-stone-500 block">Harga Modal</span>
              <strong class="text-stone-900">${rupiah(m.cost)}</strong>
            </div>
          </div>
          <p class="text-xs text-stone-500 mt-2">Margin: <strong class="text-emerald-700">${rupiah(margin)}</strong> (${persen}%)</p>
        </div>

        <div class="flex gap-2 mt-3 pt-3 border-t border-stone-100">
          <button data-toggle="${m.id}" data-next="${m.available ? 'false' : 'true'}"
            class="flex-1 text-xs font-medium py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition">
            ${m.available ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
          <button data-del="${m.id}" data-name="${esc(m.name)}"
            class="flex-1 text-xs font-semibold py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition">
            🗑️ Delete Menu
          </button>
        </div>
      </article>`;
    })
    .join('');

  document.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => hapus(Number(b.dataset.del), b.dataset.name))
  );
  document.querySelectorAll('[data-toggle]').forEach((b) =>
    b.addEventListener('click', () => toggle(Number(b.dataset.toggle), b.dataset.next === 'true'))
  );
}

/* ---------------- Hapus / ubah menu ---------------- */
async function hapus(id, name) {
  const { sb, toast } = ctx;

  const menu = MENU.find((m) => m.id === id);
  if (!menu) return;
  if (!confirm(`Hapus menu "${name}"? Tindakan ini permanen.`)) return;

  // Hapus foto di Storage (abaikan kalau gagal — baris menu tetap dihapus).
  if (menu.image_url) {
    const path = menu.image_url.split(`/${BUCKET}/`)[1];
    if (path) await sb.storage.from(BUCKET).remove([decodeURIComponent(path)]);
  }

  const { error } = await sb.from('menu_items').delete().eq('id', id);
  if (error) return toast('Gagal menghapus menu', 'err');

  await sb.rpc('log_activity', { p_action: 'menu-dihapus', p_detail: name });
  toast(`Menu "${name}" dihapus`);
  await load();
}

async function toggle(id, jadiAktif) {
  const { sb, toast } = ctx;

  const { error } = await sb.from('menu_items').update({ available: jadiAktif }).eq('id', id);
  if (error) return toast('Gagal mengubah menu', 'err');

  await sb.rpc('log_activity', {
    p_action: 'menu-diubah',
    p_detail: jadiAktif ? 'menu diaktifkan' : 'menu dinonaktifkan',
  });
  toast(jadiAktif ? 'Menu diaktifkan' : 'Menu dinonaktifkan');
  await load();
}
