# ☕ TITIK JENUH COFFEE SHOP

Website coffee shop lengkap: **halaman pengunjung** + **panel admin tersembunyi**.
Dibangun dengan Node.js (Express) + SQLite bawaan Node — tanpa database eksternal.

---

## 🚀 Menjalankan

```bash
npm install
npm start
```

Buka `http://localhost:12000`.

---

## 🔐 Akses Panel Admin (Tersembunyi)

Panel admin **tidak punya link apa pun** di halaman publik. Cara masuknya:

1. Klik tombol **🔍 Cari** di navbar.
2. Ketik **token akses** di search bar, lalu tekan Enter:

   ```
   ADM-2026TITKJENUH-TOKEN
   ```

3. Kamu otomatis diarahkan ke `/admin` dan diminta login:

   | Field | Nilai |
   |---|---|
   | Username | `admin@jenuh` |
   | Email | `titik@jenuh.admin` |
   | Password | `titik-jenuh@440` |

> Token dan kredensial bisa diganti lewat file `.env` (lihat `.env.example`).

**Catatan keamanan:** URL `/admin` mengembalikan **404** kalau token belum pernah
dimasukkan — jadi orang yang menebak-nebak alamat admin tidak akan menemukan apa pun.
Password disimpan sebagai hash (scrypt + salt), bukan teks biasa.

---

## 📊 Fitur Panel Admin

| Fitur | Keterangan |
|---|---|
| **Pemasukan Kotor** | Total semua pesanan yang sudah di-ACC |
| **Pemasukan Bersih** | Kotor − modal bahan − pengeluaran operasional |
| **Total Saldo Masuk** | Uang yang benar-benar sudah dibayar pelanggan |
| **ACC Pesanan** | Setujui / tolak pesanan — lengkap dengan rincian menu & total harga |
| **Tandai Dibayar** | Catat pelanggan yang sudah melunasi |
| **Catat Pengeluaran** | Input biaya operasional (beli bahan, listrik, dll) |
| **Menu Terlaris** | Top 5 menu paling banyak dipesan |
| **Grafik 7 Hari** | Tren pemasukan seminggu terakhir |
| **Log Aktivitas** | Rekam jejak semua aksi admin |

---

## 🗂️ Struktur Proyek

```
├── server.js              # Express: API publik + API admin
├── lib/
│   ├── db.js              # Skema SQLite + data awal menu
│   └── auth.js            # Token gerbang, sesi, hash password
├── views/
│   └── admin.html         # Halaman admin (di luar public/ → tidak bisa diakses langsung)
├── public/                # Halaman pengunjung (static)
│   ├── index.html         # Navbar, hero, menu, vibe, fasilitas, lokasi, footer, search
│   ├── 404.html
│   ├── css/style.css      # Tema pengunjung
│   ├── css/admin.css      # Tema admin
│   ├── js/app.js          # Logika pengunjung + search & gerbang admin
│   ├── js/admin.js        # Logika dashboard admin
│   └── assets/            # 👉 TARUH LOGO & FOTO DI SINI
└── data/                  # Database SQLite (dibuat otomatis, tidak di-commit)
```

---

## 🖼️ Mengganti Logo & Foto

Semua aset ada di **`public/assets/`**. Cukup ganti file dengan nama yang sama:

| File | Kegunaan |
|---|---|
| `logo.png` | Logo navbar, footer, dan admin |
| `hero.mp4` | Video hero (proses seduh / suasana kafe) |
| `hero-poster.jpg` | Gambar pembuka video |
| `vibe-indoor.jpg` | Foto area indoor ber-AC |
| `vibe-outdoor.jpg` | Foto area outdoor |
| `vibe-workspace.jpg` | Foto spot kerja |
| `vibe-bar.jpg` | Foto coffee bar |

Logo bawaan saat ini hanya **placeholder**. Tinggal timpa `logo.png` dengan logomu.
Kalau foto belum ada, website tetap tampil rapi (pakai placeholder otomatis).

---

## 🔌 API Ringkas

| Method | Endpoint | Akses | Fungsi |
|---|---|---|---|
| GET | `/api/config` | publik | Info kafe (jam, alamat, kontak) |
| GET | `/api/menu` | publik | Daftar menu |
| GET | `/api/menu/search?q=` | publik | Cari menu |
| POST | `/api/search` | publik | Cari menu **atau** buka gerbang admin (kalau isinya token) |
| POST | `/api/orders` | publik | Pelanggan kirim pesanan |
| POST | `/api/admin/login` | gerbang | Login admin |
| GET | `/api/admin/stats` | login | Statistik keuangan & pesanan |
| GET | `/api/admin/orders` | login | Daftar pesanan |
| POST | `/api/admin/orders/:id/approve` | login | ACC pesanan |
| POST | `/api/admin/orders/:id/reject` | login | Tolak pesanan |
| POST | `/api/admin/orders/:id/pay` | login | Tandai sudah dibayar |
| POST | `/api/admin/expenses` | login | Catat pengeluaran |

---

## ♻️ Reset Data

Hapus folder `data/` lalu jalankan ulang server. Database beserta contoh
pesanan demo akan dibuat ulang dari nol.

---

**Powered by X-VIBE Cyber Development**
