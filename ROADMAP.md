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
| Transaksi berulang (gaji, cicilan, langganan) | rencana awal | ⏳ |

## Mengendalikan

| Fitur | Sumber | Status |
|---|---|---|
| Kelola dompet (tambah, ubah, saldo awal) | tambahan Tahap 1 | ✅ |
| Anggaran per kategori + peringatan | rencana awal (ditunda atas permintaan) | ⏳ |
| Target tabungan (dana darurat, liburan, DP) | rencana awal | ⏳ |
| Utang & piutang | rencana awal | ⏳ |
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
| Kekayaan bersih (aset − utang) | rencana awal | ⏳ (butuh fitur utang) |
| Pemeriksaan rasio cicilan terhadap pendapatan | rencana awal | ⏳ (butuh fitur utang) |

## Keamanan & data

| Fitur | Sumber | Status |
|---|---|---|
| Data di perangkat + bisa offline | rencana awal | ✅ |
| Cadangan manual (ekspor/pulihkan .json) | rencana awal | ✅ |
| Sembunyikan nominal (blur) & intip saldo kartu | mockup v2 | ✅ |
| Tema terang/gelap dengan efek menyebar | mockup v2 | ✅ |
| **Kunci PIN saat aplikasi dibuka** | rencana awal (Tahap 1), mockup v1 & v2 | ✅ PIN 4/6 digit (hash PBKDF2), Face ID/Touch ID, kunci otomatis (langsung/1/5 menit), tampilan tertutup di pengalih aplikasi |
| **Cadangan online otomatis + sinkron HP ↔ laptop** | permintaan awal | ⏳ |
| Ekspor ke Excel | mockup v1 & v2 | ⏳ |

## Catatan teknis untuk fitur berikutnya

- **Foto struk:** Tesseract.js bahasa Indonesia, dijalankan di HP. Pemakaian pertama mengunduh ±5 MB dari CDN lalu disimpan untuk offline. Kode: src/ocr.ts, src/receipt.ts.
- **Impor mutasi:** src/statement.ts mengenali 3 tata letak: tabel berjudul kolom (CSV/Excel), baris bertanggal dengan saldo berjalan (PDF bank umum), dan kartu per tanggal tanpa saldo (PDF PermataMobile X). Screenshot dibaca lewat OCR (src/ocr.ts) lalu masuk ke pembaca baris. Format .xls lama dan PDF hasil scan belum didukung.
- **Cadangan online:** Supabase (gratis). Sekaligus menjadi dasar buku keluarga nanti.
