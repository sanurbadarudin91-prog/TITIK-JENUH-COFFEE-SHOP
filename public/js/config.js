// Konfigurasi publik TITIK JENUH.
//
// Kunci publishable AMAN ditaruh di frontend — keamanan data dijaga oleh
// Row Level Security di Supabase, bukan oleh kerahasiaan kunci ini.
// JANGAN pernah menaruh secret key (sb_secret_...) di file ini.
window.TJ_CONFIG = {
  supabaseUrl: 'https://szykjpenoslrqrmysykm.supabase.co',
  supabaseKey: 'sb_publishable_4RrTb3qV_Yyc-TnbWK6QPg_o-8mbdOw',

  // Token gerbang panel admin (diketik di kolom pencarian).
  // Ini hanya menyembunyikan pintu, bukan pengaman data — pengaman
  // sebenarnya adalah Supabase Auth + Row Level Security.
  gateToken: 'ADM-2026TITKJENUH-TOKEN',
  adminPath: '/admin/',

  cafe: {
    name: 'TITIK JENUH COFFEE SHOP',
    shortName: 'TITIK JENUH',
    tagline: 'Tempat Singgah Pas Buat Kamu yang Lagi Lelah Sama Rutinitas.',
    address: 'Jl. Kopi Kenangan No. 44, Kota Bandung, Jawa Barat',
    hours: 'Senin - Minggu | 15.00 - 23.00 WIB',
    phone: '+62 812-0000-4400',
    instagram: 'https://instagram.com/titikjenuh.coffee',
    maps: 'https://www.google.com/maps/search/?api=1&query=coffee+shop',
  },
};
