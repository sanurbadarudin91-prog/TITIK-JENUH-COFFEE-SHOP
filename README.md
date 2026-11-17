# ☕ TITIK JENUH COFFEE SHOP

Website coffee shop: **halaman pengunjung** + **panel admin tersembunyi**.

Situs ini **tanpa backend sendiri** — sepenuhnya statis, dengan **Supabase**
sebagai database, autentikasi, dan penjaga keamanan data (Row Level Security).

## 🌐 Live

**https://titik-jenuh.vercel.app**

---

## 🧱 Arsitektur

```
Pengunjung / Admin  ──►  Vercel (file statis)
                              │
                              │ supabase-js
                              ▼
                       Supabase
                       ├── Postgres      (menu, pesanan, keuangan)
                       ├── Auth          (login admin)
                       └── RLS + RPC     (aturan akses di database)
```

Tidak ada server yang perlu dijalankan. Vercel hanya menyajikan HTML/CSS/JS.

---

## 🚀 Setup (sekali saja)

### 1. Jalankan skema database

Buka **Supabase → SQL Editor → New query**, tempel seluruh isi
[`supabase/schema.sql`](supabase/schema.sql), lalu **Run**.

File itu membuat tabel, kebijakan RLS, fungsi RPC, data menu awal,
akun admin, dan data contoh.

### 2. Jalankan migrasi panel admin baru

Masih di **SQL Editor**, jalankan [`supabase/migration-v2.sql`](supabase/migration-v2.sql).

File itu menambahkan:

- kolom foto menu (`image_url`)
- bucket penyimpanan **`menu-photos`** + aturan unggah untuk admin
- fungsi laporan keuangan `finance_report()`

> Tanpa langkah ini, halaman **Kelola Menu** menampilkan peringatan dan
> foto menu tidak bisa disimpan. Halaman lain tetap berjalan normal.

### 3. Konfigurasi frontend

Semua pengaturan publik ada di [`public/js/config.js`](public/js/config.js):
URL Supabase, publishable key, token gerbang admin, dan info kafe.

### 4. Deploy

```bash
vercel deploy --prod
```

---

## 🔐 Akses Panel Admin (Tersembunyi)

Tidak ada link ke panel admin di halaman publik.

1. Buka halaman utama → klik **🔍 Cari**
2. Ketik token gerbang: `ADM-2026TITKJENUH-TOKEN`
3. Tekan **Enter** → diarahkan ke halaman login
4. Masuk dengan:

   | Kolom | Nilai |
   |---|---|
   | Username | `admin@jenuh` |
   | Email | `titik@jenuh.admin` |
   | Password | `titik-jenuh@440` |

> Mengakses `/admin` tanpa melewati token gerbang akan dialihkan ke 404.

### Keamanan berlapis

| Lapisan | Fungsi |
|---|---|
| Token gerbang | Menyembunyikan pintu admin |
| Supabase Auth | Verifikasi identitas (password di-hash Supabase) |
| Tabel `admins` | Hanya akun terdaftar yang dianggap admin |
| Row Level Security | Database sendiri yang menolak akses tidak sah |
| RPC `security definer` | Harga pesanan selalu dihitung di server |

Publishable key boleh terlihat publik — keamanan tidak bergantung padanya.
**Jangan pernah** menaruh secret key (`sb_secret_...`) di frontend.

---

## ✨ Fitur

**Halaman pengunjung**
- Navbar, hero (slot video), digital menu per kategori
- Vibe/galeri, fasilitas, lokasi & jam buka, footer
- Pencarian menu (sekaligus gerbang admin)
- Form pesan/reservasi meja

**Panel admin** (halaman terpisah, tidak saling tumpang tindih)

| Halaman | Isi |
|---|---|
| **Login** | Form masuk. Setelah berhasil **langsung pindah** ke Dashboard |
| **Dashboard** | Ringkasan statistik + grafik pemasukan 7 hari, menu terlaris, pesanan terbaru |
| **Pesanan** | Daftar pesanan masuk + tombol **ACC Pesanan** / Tolak |
| **Log Aktivitas** | Pelanggan yang sudah di-ACC + toggle **Sudah Bayar / Belum Bayar** + riwayat admin |
| **Keuangan** | Laba kotor & bersih otomatis (harga jual − harga modal), grafik 14 hari, catat pengeluaran |
| **Kelola Menu** | Tambah menu (foto, harga modal, harga jual, nama, deskripsi) + hapus/nonaktifkan |

**Alur ACC:** pesanan yang di-ACC **hilang dari halaman Pesanan** dan
**pindah ke halaman Log Aktivitas**.

Navigasi memakai sidebar (desktop) / menu geser (HP) dengan Tailwind CSS.
Setiap halaman berdiri sendiri — tidak ada konten yang menyatu dalam satu layar.

---

## 🛠️ Menjalankan Lokal

```bash
npm start        # http://localhost:12000
```

Atau server statis apa pun:

```bash
npx serve public -l 12000
```

---

## 📁 Struktur

```
public/
├── index.html              # halaman pengunjung
├── 404.html
├── admin/                  # panel admin — 6 halaman terpisah
│   ├── index.html          #   1. Login / Auth
│   ├── dashboard.html      #   2. Statistik & grafik
│   ├── orders.html         #   3. Pesanan (ACC / tolak)
│   ├── activity.html       #   4. Log aktivitas & status bayar
│   ├── finance.html        #   5. Keuangan (laba/rugi)
│   ├── menu.html           #   6. Kelola menu (foto, hapus)
│   └── js/
│       ├── common.js       #   kerangka bersama (sidebar, sesi, util)
│       ├── login.js
│       ├── dashboard.js
│       ├── orders.js
│       ├── activity.js
│       ├── finance.js
│       └── menu.js
├── css/style.css           # tema pengunjung
├── js/config.js            # konfigurasi publik
├── js/app.js               # logika pengunjung
└── assets/                 # logo, foto vibe, video hero
supabase/
├── schema.sql              # skema database + RLS + RPC
└── migration-v2.sql        # foto menu, storage, laporan keuangan
vercel.json                 # konfigurasi deploy statis
```

---

## 🖼️ Mengganti Aset

| Aset | Lokasi |
|---|---|
| Logo | `public/assets/logo.png` |
| Video hero | `public/assets/hero.mp4` (+ `hero-poster.jpg`) |
| Foto vibe | `public/assets/vibe-indoor.jpg`, `vibe-outdoor.jpg`, `vibe-workspace.jpg`, `vibe-bar.jpg` |

Panduan lengkap ada di `public/assets/README.md`.

---

## 📝 Mengubah Menu & Harga

Cara termudah: **Panel Admin → Kelola Menu** (tambah menu beserta foto,
atau hapus menu yang sudah tidak dijual).

Menu juga bisa diubah langsung di tabel `menu_items` pada Supabase:

```sql
update public.menu_items set price = 23000 where name = 'Kopi Susu Titik Jenuh';

insert into public.menu_items (name, category, description, price, cost, sort_order)
values ('Es Teh Manis', 'Non-Coffee', 'Teh manis dingin, segar.', 12000, 3000, 11);
```

> Kolom `cost` (harga modal) dipakai untuk menghitung laba di halaman Keuangan.

---

© 2026 TITIK JENUH COFFEE SHOP · Powered by **X-VIBE Cyber Development**
