/* ==================================================================
   TITIK JENUH — kerangka bersama panel admin
   Berisi: klien Supabase, penjaga sesi, sidebar, topbar, dan util.
   ================================================================== */
window.TJ = (function () {
  const CFG = window.TJ_CONFIG;
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);

  const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
  const angka = (n) => Number(n || 0).toLocaleString('id-ID');
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- Toast ---------------- */
  let toastTimer;
  function toast(msg, kind = 'ok') {
    const el = document.getElementById('tj-toast');
    if (!el) return;
    const warna = kind === 'err' ? 'bg-red-600' : kind === 'warn' ? 'bg-amber-500' : 'bg-emerald-600';
    el.innerHTML = `<div class="${warna} text-white px-5 py-3 rounded-xl shadow-lg font-medium text-sm">${esc(msg)}</div>`;
    el.classList.remove('opacity-0', 'pointer-events-none');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('opacity-0', 'pointer-events-none'), 3200);
  }

  /* ---------------- Navigasi ---------------- */
  const NAV = [
    { href: 'dashboard', icon: '📊', label: 'Dashboard' },
    { href: 'orders', icon: '🧾', label: 'Pesanan' },
    { href: 'activity', icon: '🛡️', label: 'Log Aktivitas' },
    { href: 'finance', icon: '💰', label: 'Keuangan' },
    { href: 'menu', icon: '☕', label: 'Kelola Menu' },
  ];

  function navHtml(active) {
    return NAV.map((n) => {
      const on = n.href === active;
      return `<a href="${n.href}"
        class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition
        ${on ? 'bg-amber-500 text-stone-900 shadow' : 'text-stone-300 hover:bg-stone-700 hover:text-white'}">
        <span class="text-lg">${n.icon}</span><span>${n.label}</span>
      </a>`;
    }).join('');
  }

  function sidebarHtml(active) {
    return `
      <div class="flex items-center gap-3 px-5 py-5 border-b border-stone-700">
        <img src="../assets/logo.png" alt="" class="w-10 h-10 rounded-full object-cover bg-stone-700"
             onerror="this.style.display='none'" />
        <div class="leading-tight">
          <strong class="block text-white text-sm tracking-wide">TITIK JENUH</strong>
          <small class="text-stone-400 text-xs">PANEL ADMIN</small>
        </div>
      </div>
      <nav class="flex-1 p-3 space-y-1 overflow-y-auto">${navHtml(active)}</nav>
      <div class="p-3 border-t border-stone-700">
        <a href="../" class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-stone-300 hover:bg-stone-700 hover:text-white transition">
          <span class="text-lg">🌐</span><span>Lihat Website</span>
        </a>
        <button id="tj-logout" class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-300 hover:bg-red-900/40 transition">
          <span class="text-lg">🚪</span><span>Keluar</span>
        </button>
      </div>`;
  }

  function topbarHtml(title, subtitle, username) {
    return `
      <div class="flex items-center gap-3">
        <button id="tj-burger" class="lg:hidden text-2xl leading-none text-stone-600" aria-label="Menu">☰</button>
        <div>
          <h1 class="text-lg md:text-2xl font-bold text-stone-900">${esc(title)}</h1>
          <p class="text-xs md:text-sm text-stone-500">${esc(subtitle || '')}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="hidden sm:block text-xs text-stone-500">Masuk sebagai <strong class="text-stone-700">${esc(username)}</strong></span>
        <span class="w-9 h-9 rounded-full bg-amber-500 text-stone-900 grid place-items-center font-bold">${esc((username || 'A')[0].toUpperCase())}</span>
      </div>`;
  }

  function bindShell() {
    const sidebar = document.getElementById('tj-sidebar');
    const overlay = document.getElementById('tj-overlay');
    const burger = document.getElementById('tj-burger');
    const close = () => {
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    };
    if (burger) burger.addEventListener('click', () => {
      sidebar.classList.toggle('-translate-x-full');
      overlay.classList.toggle('hidden');
    });
    if (overlay) overlay.addEventListener('click', close);

    const logout = document.getElementById('tj-logout');
    if (logout) logout.addEventListener('click', async () => {
      await sb.auth.signOut();
      window.location.replace('index');
    });
  }

  /* ---------------- Penjaga sesi ---------------- */
  async function currentAdmin() {
    const { data } = await sb.auth.getSession();
    if (!data.session) return null;
    const { data: row } = await sb
      .from('admins')
      .select('username')
      .eq('user_id', data.session.user.id)
      .maybeSingle();
    if (!row) return null;
    return { user: data.session.user, username: row.username };
  }

  /* ---------------- Pemasangan halaman ---------------- */
  async function mount(opts, init) {
    const admin = await currentAdmin();
    if (!admin) {
      window.location.replace('index');
      return null;
    }

    const sidebar = document.getElementById('tj-sidebar');
    if (sidebar) sidebar.innerHTML = sidebarHtml(opts.active);

    const topbar = document.getElementById('tj-topbar');
    if (topbar) topbar.innerHTML = topbarHtml(opts.title, opts.subtitle, admin.username);

    document.getElementById('tj-app').classList.remove('hidden');
    bindShell();

    const ctx = {
      sb,
      admin,
      rupiah,
      angka,
      esc,
      toast,
      tanggal,
      STATUS_LABEL,
      STATUS_CLASS,
      CFG,
    };
    if (init) await init(ctx);
    return ctx;
  }

  /* ---------------- util lain ---------------- */
  function tanggal(iso, denganJam = true) {
    if (!iso) return '-';
    const d = new Date(iso);
    const opsi = { day: '2-digit', month: 'short', year: 'numeric' };
    if (denganJam) { opsi.hour = '2-digit'; opsi.minute = '2-digit'; }
    return d.toLocaleString('id-ID', opsi);
  }

  const STATUS_LABEL = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };
  const STATUS_CLASS = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
  };

  return { sb, rupiah, angka, esc, toast, mount, currentAdmin, tanggal, STATUS_LABEL, STATUS_CLASS };
})();
