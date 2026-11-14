# Roadmap Do it Dip

Daftar lengkap fitur yang pernah direncanakan atau tampil di mockup, beserta statusnya.
Acuan: rencana awal, **mockup v1** dan **mockup v2** (folder `mockup/`), dan permintaan setelahnya.
Perbarui file ini setiap ada fitur yang selesai, supaya tidak ada yang terlewat.

**Status:** ✅ ada di aplikasi · ⏳ belum dibuat · 🟡 sebagian

## Mencatat

| Fitur | Sumber | Status |
|---|---|---|
| Catat lewat kalimat, pewarnaan kata, banyak baris sekaligus | mockup v2 | ✅ |
| Belajar dari koreksi kategori | mockup v1 | ✅ |
| Input manual dengan keypad | mockup v1 | ✅ |
| Ubah, duplikat, hapus + urungkan | tambahan Tahap 1 | ✅ |
| Tekan lama transaksi untuk aksi cepat | mockup v2 | ✅ |
| Tarik layar ke bawah untuk mencatat | mockup v2 | ✅ |
| **Foto struk (OCR) → transaksi otomatis** | rencana awal, mockup v1 & v2 | ✅ dibaca di HP (Tesseract), hasil bisa dikoreksi sebelum disimpan |
| **Impor mutasi bank → dikategorikan otomatis** | rencana awal, mockup v1 & v2 | ✅ **Bank Permata:** PDF Mutasi Transaksi PermataMobile X (diuji dengan file asli) · 🟡 **Bank Sumsel Babel:** belum ada fitur unduh mutasi → impor dari screenshot riwayat transaksi (berfungsi untuk tata letak umum; perlu contoh screenshot asli BSB) · ✅ CSV/.xlsx umum, PDF bersandi, deteksi duplikat |
| **Transaksi berulang (gaji, cicilan, langganan)** | rencana awal | ✅ dari detail transaksi → *Jadikan berulang*; tiap bulan (tanggal, termasuk akhir bulan) atau tiap minggu; *catat otomatis* atau *tanya dulu* (kartu Jatuh tempo di Beranda, nominal bisa diubah, bisa dilewati); daftar di Lainnya; ikut cadangan & sinkron, tidak dobel antar perangkat |

## Mengendalikan

| Fitur | Sumber | Status |
|---|---|---|
| Kelola dompet (tambah, ubah, saldo awal) | tambahan Tahap 1 | ✅ |
| **Anggaran per kategori + peringatan** | rencana awal | ✅ batas bulanan per kategori (bisa diisi dari rata-rata 3 bulan), kartu di Rekap dengan penanda posisi hari ini, ringkasan sisa & per hari di Beranda, peringatan sekali saat 80% dan saat terlewati; ikut cadangan & sinkron |
| **Target tabungan (dana darurat, liburan, DP)** | rencana awal | ✅ di Dompet: target + tenggat, sisihkan/ambil (uang tetap di dompet), saldo bebas, perlu disisihkan per bulan, perkiraan tercapai dari laju 3 bulan, saran dana darurat 6× pengeluaran |
| **Utang & piutang** | rencana awal | ✅ di Dompet: pinjaman tunai (tidak dihitung pemasukan/pengeluaran), kredit/paylater (cicilan = pengeluaran Tagihan · Cicilan), piutang; catat pembayaran, sisa & progres, cicilan per bulan, jatuh tempo |
| Buku terpisah Freelance & Usaha | rencana awal, mockup | 🟡 baru tampilan "aktifkan nanti" |
| Buku bersama pasangan/keluarga | rencana awal (jangka panjang) | ⏳ |

## Melihat rekap

| Fitur | Sumber | Status |
|---|---|---|
| Beranda: saldo odometer, masuk/keluar bulan ini, 7 hari terakhir | mockup v2 | ✅ |
| Rekap: donat → kategori → subkategori → transaksi | mockup v1 & v2 | ✅ |
| Grafik harian, tren bulanan, catatan perencana keuangan | mockup v1 & v2 | ✅ |
| Dashboard laptop + mode presentasi | permintaan | ✅ |
| **Rekap kilat (cerita mingguan, transisi kubus)** | mockup v2 | ✅ 6 kartu dari data 7 hari terakhir, muncul di Beranda setelah ada ≥3 pengeluaran minggu ini |
| **Kekayaan bersih (aset − utang)** | rencana awal | ✅ Dompet, catatan perencana di Rekap, dan laptop |
| **Pemeriksaan rasio cicilan terhadap pendapatan** | rencana awal | ✅ catatan perencana di Rekap (batas aman 30%) |

## Keamanan & data

| Fitur | Sumber | Status |
|---|---|---|
| Data di perangkat + bisa offline | rencana awal | ✅ |
| Cadangan manual (ekspor/pulihkan .json) | rencana awal | ✅ |
| Sembunyikan nominal (blur) & intip saldo kartu | mockup v2 | ✅ |
| Tema terang/gelap dengan efek menyebar | mockup v2 | ✅ |
| **Kunci PIN saat aplikasi dibuka** | rencana awal (Tahap 1), mockup v1 & v2 | ✅ PIN 4/6 digit (hash PBKDF2), Face ID/Touch ID, kunci otomatis (langsung/1/5 menit), tampilan tertutup di pengalih aplikasi |
| **Cadangan online otomatis + sinkron HP ↔ laptop** | permintaan awal | ✅ Supabase (proyek milik pengguna), masuk email + kata sandi, unggah otomatis setelah perubahan, ambil otomatis saat dibuka, pilihan saat dua perangkat sama-sama berubah, RLS per akun |
| **Ekspor ke Excel** | mockup v1 & v2 | ✅ .xlsx berisi Ringkasan, Transaksi, Per kategori; periode bulan / tahun / semua (Rekap & Lainnya di HP, tombol Excel di laptop mengikuti periode yang tampil) |

## Catatan teknis untuk fitur berikutnya

- **Foto struk:** Tesseract.js bahasa Indonesia, dijalankan di HP. Pemakaian pertama mengunduh ±5 MB dari CDN lalu disimpan untuk offline. Kode: src/ocr.ts, src/receipt.ts.
- **Impor mutasi:** src/statement.ts mengenali 3 tata letak: tabel berjudul kolom (CSV/Excel), baris bertanggal dengan saldo berjalan (PDF bank umum), dan kartu per tanggal tanpa saldo (PDF PermataMobile X). Screenshot dibaca lewat OCR (src/ocr.ts) lalu masuk ke pembaca baris. Format .xls lama dan PDF hasil scan belum didukung.
- **Cadangan online:** Supabase (gratis). Sekaligus menjadi dasar buku keluarga nanti.
- **Transaksi berulang:** src/recurring.ts (jadwal murni + tes). Id transaksi tetap per aturan dan tanggal (`r-<aturan>-<tanggal>`), dan dijalankan setelah sinkron cloud, jadi dua perangkat tidak mencatat dua kali.
- **Tabungan & utang:** src/plan.ts (hitungan murni + tes). Pinjaman tunai bergerak lewat dompet semu `debt:<id>` sebagai transfer, jadi saldo dompet benar tanpa mengubah pemasukan/pengeluaran.
- **Anggaran:** src/budget.ts (hitungan murni + tes), disimpan di pengaturan `budgets`.
- **Excel:** src/excel.ts membangun isi lembar (dites di Node) lalu ditulis dengan write-excel-file (dimuat hanya saat ekspor).
