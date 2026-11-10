# Do it Dip

Pencatat keuangan pribadi berbentuk PWA (Progressive Web App): dipasang di iPhone dan dibuka di PC tanpa biaya App Store.

**Tahap 1 (versi ini):** catat lewat kalimat (dengan pewarnaan kata dan belajar dari koreksi), input manual, ubah/hapus/duplikat transaksi dengan urungkan, Beranda dengan saldo odometer, Rekap bertingkat (donat → kategori → subkategori → transaksi), tumpukan kartu Dompet dengan intip saldo, tambah/ubah dompet, tema terang/gelap, cadangan manual (ekspor/pulihkan `.json`), dan bisa dipakai offline.

**Tampilan laptop:** di layar lebar (≥ 1024 px), aplikasi otomatis menjadi dashboard rekap: ringkasan, arus kas, komposisi pengeluaran (klik untuk detail kategori), kategori teratas, pengeluaran terbesar, catatan perencana keuangan, dan saldo per dompet, dalam mode Bulan atau Tahun. Tombol **Presentasi** membuka 5 slide layar penuh (← → untuk pindah, Esc untuk keluar). Tombol **Catat** membuka aplikasi versi HP sebagai panel di samping.

**Foto struk & impor mutasi:** di layar Catat ada mode **Struk** (foto struk dibaca langsung di HP, total/toko/tanggal terisi otomatis) dan **Impor** (file mutasi CSV, Excel .xlsx, atau PDF, termasuk PDF bersandi; transaksi dikategorikan dan bisa diperiksa sebelum disimpan, yang sudah pernah tercatat ditandai). Status semua fitur ada di ROADMAP.md.

**Berikutnya:** cadangan online otomatis, kunci PIN, rekap kilat, anggaran, transaksi berulang, buku Freelance/Usaha/Keluarga.

## Menjalankan di laptop

```bash
npm install
npm run dev        # buka alamat yang muncul; "Network" bisa dibuka dari HP di Wi-Fi yang sama
npm test           # tes parser kalimat
npm run build      # hasil siap terbit di folder dist/
```

## Menerbitkan gratis (GitHub Pages)

1. Buat repo baru di GitHub (misalnya `do-it-dip`), lalu hubungkan dan push folder ini ke branch `main`.
2. Di GitHub: **Settings → Pages → Source: GitHub Actions**.
3. Setiap push ke `main` otomatis menjalankan tes, build, dan terbit ke `https://<username>.github.io/do-it-dip/`.

## Memasang di iPhone

1. Buka alamat aplikasi di **Safari**.
2. Ketuk tombol **Bagikan** → **Tambah ke Layar Utama**.
3. Buka dari ikon di layar utama. Aplikasi tampil layar penuh dan tetap jalan tanpa internet.

## Data

Semua data tersimpan di perangkat (IndexedDB). Sampai cadangan online hadir, ekspor cadangan secara rutin dari **Lainnya → Ekspor cadangan** dan simpan di Files atau Google Drive. File yang sama bisa dipulihkan di HP atau PC lain.

## Struktur

| File | Isi |
|---|---|
| `src/model.ts` | Tipe data, kategori, kata kunci, dompet bawaan |
| `src/parser.ts` | Pembaca kalimat bahasa Indonesia + pewarnaan kata |
| `src/receipt.ts`, `src/ocr.ts` | Foto struk: pembacaan teks di HP dan pengambilan total/toko/tanggal |
| `src/statement.ts`, `src/filetext.ts`, `src/money-text.ts` | Impor mutasi: baca CSV/Excel/PDF, tebak jenis & kategori |
| `src/store.ts` | Penyimpanan IndexedDB, cadangan ekspor/impor |
| `src/stats.ts` | Rekap bulanan dan saldo |
| `src/app.ts` | Seluruh tampilan dan animasi versi HP (dari mockup v2) |
| `src/desk.ts` | Dashboard rekap laptop + mode presentasi |
| `mockup/` | Mockup v1 dan v2 sebagai acuan desain |
