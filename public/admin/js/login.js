/* ==================================================================
   TITIK JENUH — halaman Login (berdiri sendiri)
   Setelah berhasil, langsung dialihkan ke dashboard.html
   ================================================================== */
const CFG = window.TJ_CONFIG;
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);

const form = document.getElementById('loginForm');
const btn = document.getElementById('loginBtn');
const msg = document.getElementById('loginMsg');
const loginCard = document.getElementById('loginCard');
const redirectCard = document.getElementById('redirectCard');

function setBusy(busy) {
  btn.disabled = busy;
  btn.textContent = busy ? 'Memeriksa...' : 'Masuk';
}

/* Kalau sudah punya sesi admin, langsung ke dashboard. */
(async function boot() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return;

  const { data: row } = await sb
    .from('admins')
    .select('username')
    .eq('user_id', data.session.user.id)
    .maybeSingle();

  if (row) window.location.replace('dashboard');
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  setBusy(true);

  const username = document.getElementById('lUsername').value.trim();
  const email = document.getElementById('lEmail').value.trim();
  const password = document.getElementById('lPassword').value;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    setBusy(false);
    msg.textContent = 'Email atau password salah.';
    return;
  }

  const { data: row } = await sb
    .from('admins')
    .select('username')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (!row) {
    await sb.auth.signOut();
    setBusy(false);
    msg.textContent = 'Akun ini tidak punya akses admin.';
    return;
  }

  if (username && row.username !== username) {
    await sb.auth.signOut();
    setBusy(false);
    msg.textContent = 'Username tidak cocok dengan akun ini.';
    return;
  }

  // Berhasil — tampilkan layar transisi lalu pindah halaman.
  loginCard.classList.add('hidden');
  redirectCard.classList.remove('hidden');
  window.location.replace('dashboard');
});
