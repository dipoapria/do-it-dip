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
| **Kelola subkategori + tebakan kategori lebih pintar** | permintaan | ✅ tiap sub bisa diganti nama, dipindah ke kategori lain, digabung (transaksi, jadwal, dan kata kunci ikut), dan diberi kata kunci sendiri (kata yang dipakai sub lain dipindah, dengan pemberitahuan). Saat mencatat: chip *Sub baru* (langsung dipakai), *Kelola*, *Kategori baru*, dan tahan lama chip untuk mengatur. Sub diurutkan paling sering dipakai. Kamus bawaan ±1.800 kata (termasuk makanan Palembang); kata/frasa terpanjang menang. Belajar dari riwayat: kata yang ≥2× dan ≥60% disimpan di satu sub menang atas kamus (hanya transaksi sejak fitur ini, 19 Nov 2026). "Makan siang" menjadi "Makan"; sub baru Tol & tiket, Perawatan diri |
| Input manual dengan keypad | mockup v1 | ✅ |
| Ubah, duplikat, hapus + urungkan | tambahan Tahap 1 | ✅ |
| Tekan lama transaksi untuk aksi cepat | mockup v2 | ✅ |
| Tarik layar ke bawah untuk mencatat | mockup v2 | ✅ |
| **Foto struk (AI) → transaksi otomatis** | permintaan | ✅ Gemini 3.5 Flash Lite lewat Supabase Edge Function `read-receipt` (key hanya di Supabase, gratis ±500 struk/hari), pendapat kedua Gemini 3.1 Flash Lite bila jumlah produk ≠ total, otomatis kembali ke OCR saat offline/kuota habis; pilihan mode di Lainnya → Baca struk. Pemasangan: supabase/SETUP-AI.md |
| **Foto struk (OCR di HP) — mode cadangan, dipertahankan untuk dikembangkan lagi** | rencana awal, mockup v1 & v2 | ✅ dibaca di HP (Tesseract): foto dirapikan (potong ke kertas, luruskan, ratakan bayangan, skala huruf), dibaca ulang sampai 4 cara; hanya produk + harga + total, dicek silang dengan total dan uang dibayar − kembalian; struk bernomor 3 baris (Lotte Grosir: nomor, barcode, barang timbangan per kg) digabung per nomor dari semua bacaan; kertas dikenali dari warna (latar berwarna/teduh); tanda cocok/kurang jelas; daftar produk bisa diedit dan ikut tersimpan. Uji 72 struk tiruan (9 jenis): total benar 100% (foto mudah), 83% (sedang), 72% (sulit); tanda "cocok" benar 35/35. Struk asli Lotte: 8/8 produk & harga benar |
| **Impor mutasi bank → dikategorikan otomatis** | rencana awal, mockup v1 & v2 | ✅ **Bank Permata:** PDF Mutasi Transaksi PermataMobile X (diuji dengan file asli) · 🟡 **Bank Sumsel Babel:** belum ada fitur unduh mutasi → impor dari screenshot riwayat transaksi (berfungsi untuk tata letak umum; perlu contoh screenshot asli BSB) · ✅ CSV/.xlsx umum, PDF bersandi, deteksi duplikat |
| **Transaksi berulang (gaji, cicilan, langganan)** | rencana awal | ✅ dari detail transaksi → *Jadikan berulang*; tiap bulan (tanggal, termasuk akhir bulan) atau tiap minggu; *catat otomatis* atau *tanya dulu* (kartu Jatuh tempo di Beranda, nominal bisa diubah, bisa dilewati); daftar di Lainnya; ikut cadangan & sinkron, tidak dobel antar perangkat |

## Mengendalikan

| Fitur | Sumber | Status |
|---|---|---|
| Kelola dompet (tambah, ubah, saldo awal) | tambahan Tahap 1 | ✅ |
| **Anggaran per kategori + peringatan** | rencana awal | ✅ batas bulanan per kategori (bisa diisi dari rata-rata 3 bulan), kartu di Rekap dengan penanda posisi hari ini, ringkasan sisa & per hari di Beranda, peringatan sekali saat 80% dan saat terlewati; ikut cadangan & sinkron |
| **Target tabungan (dana darurat, liburan, DP)** | rencana awal | ✅ di Dompet: target + tenggat, sisihkan/ambil (uang tetap di dompet), saldo bebas, perlu disisihkan per bulan, perkiraan tercapai dari laju 3 bulan, saran dana darurat 6× pengeluaran |
| **Utang & piutang** | rencana awal | ✅ di Dompet: pinjaman tunai (tidak dihitung pemasukan/pengeluaran), kredit/paylater (cicilan = pengeluaran Tagihan · Cicilan), piutang; catat pembayaran, sisa & progres, cicilan per bulan, jatuh tempo |
| **Buku terpisah Freelance & Usaha** | rencana awal, mockup | ✅ aktifkan dari pemilih buku atau Dompet; catatan, rekap, anggaran, cerita mingguan, Excel, dan laptop per buku; kategori khusus (Honor proyek, Alat & software / Penjualan, Bahan & stok, Operasional) + kata kunci kalimatnya; dompet dipakai bersama atau khusus satu buku; Beranda buku menampilkan laba bersih bulan ini dengan warna khas |
| Buku bersama pasangan/keluarga | rencana awal (jangka panjang) | ⏳ |
| **Investasi (saham, reksadana, obligasi/SBN, emas, deposito, kripto)** | permintaan | ✅ di Dompet: aset per jenis dengan tombol tampil/sembunyi; beli/jual per transaksi (lot untuk saham, harga rata-rata, untung/rugi berjalan dan dari penjualan), dividen/kupon/bunga sebagai pemasukan; beli tidak dihitung pengeluaran (dana pindah dari dompet), kepemilikan lama bisa dicatat tanpa mengurangi dompet; harga saham otomatis lewat Edge Function `stock-price` (sumber tidak resmi, cadangan isi manual); masuk kekayaan bersih |
| **Kategori bisa diatur + ingatan frasa** | permintaan | ✅ kategori baru Tempat tinggal, Keluarga, Asuransi & pajak; Lainnya → Kelola kategori (tambah, ubah nama/ikon/warna, subkategori, sembunyikan, kembalikan bawaan); koreksi di pratinjau memilih kategori lalu subkategori dan mengingat frasa ("sewa kos"), bukan satu kata; angka hitungan ("3 bulan") tidak diwarnai sebagai nominal |
| **Rincian per hari di Rekap** | permintaan | ✅ kartu di Rekap: pilih hari lewat batang grafik atau panah ‹ ›; ringkasan masuk/keluar/jumlah transaksi, pengeluaran per kategori, dan semua transaksi hari itu (ketuk untuk detail/ubah) |
| **Kalender bulan + lompat ke tanggal** | permintaan | ✅ Rekap HP: kalender bulan dengan keluar/masuk tiap tanggal (makin pekat = makin boros), tanda hari ini, terboros, dan jadwal berulang; total bulan di atasnya; ketuk judul untuk pilih bulan/tahun; tombol Hari ini; grafik batang jadi opsional (tersembunyi bawaan); tombol Lompat di Rincian membuka kalender sebagai lembar. Laptop: kalender besar + rincian hari di sampingnya |
| **Pengeluaran tetap** | permintaan | ✅ sakelar "Pengeluaran tetap" di detail transaksi dan di jadwal berulang (transaksi dari jadwal ikut ditandai); menandai mengingat frasa catatan ("sewa kos") sehingga yang baru otomatis tetap, membatalkan melupakannya; yang tetap tidak dihitung untuk tanda terboros, warna pekat kalender, grafik batang harian, kategori terbesar/kenaikan di catatan, dan daftar pengeluaran terbesar di laptop; tetap terlihat (abu + gembok) dan total dipecah tetap/harian |
| **Pengguna kedua (pasangan)** | permintaan | ✅ akun terpisah (dibuat admin di dashboard, pendaftaran tetap tertutup); ganti kata sandi di aplikasi; kunci Gemini per akun (`GEMINI_KEYS`, kunci pemilik terkunci ke `GEMINI_OWNER_EMAIL`); awal pemakaian memilih bank & e-wallet dari daftar; contoh kalimat memakai dompet sendiri. Panduan: supabase/SETUP-PASANGAN.md |

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
- **Buku:** `Tx.book` dan `Wallet.book` (`pribadi` = dompet bersama). store.bookTxs()/bookWallets() menyaring tampilan; saldo dompet selalu dihitung dari semua buku. Buku terpilih disimpan per perangkat (`curBook`), daftar buku aktif ikut sinkron.
- **Struk:** src/scan.ts (alur), src/imgproc.ts (olah gambar, dites), src/receipt.ts (baca produk/total, dites). Lab pengukur di tools/ocr-lab (jalankan `npx vite --port 5199`, buka /tools/ocr-lab/?n=2&pipe=new): struk tiruan 8 jenis × 4 tingkat kesulitan dengan kunci jawaban.
- **Investasi:** src/invest.ts (hitungan murni + tes). Beli/jual = transfer lewat dompet semu `inv:<id>` (`inv-open` untuk kepemilikan lama); aset di tabel `assets` (Dexie v4), ikut cadangan.
- **Kategori:** `CATS` dibangun ulang dari `BASE_CATS` + `settings.catEdits` oleh `applyCatEdits` (model.ts), dipanggil saat load dan `store.setCatEdits`. Kategori buatan sendiri berkunci `c-…`; yang masih dipakai transaksi hanya boleh disembunyikan, tidak dihapus. Ingatan: kunci `learned` boleh berupa frasa (parser mencocokkan yang terpanjang dulu; `learnKey`).
- **Kata kunci & subkategori:** kamus di src/dict.ts → `applyDict(subMap, kwOff)` (model.ts) membangun `KW`/`KW_IN`; `kwBest` memilih kecocokan terpanjang. `settings.subMap` mencatat ke mana sub yang diganti nama/dipindah/digabung pergi (kata bawaan ikut), `kwOff` = kata bawaan yang dimatikan, kata sendiri = `learned`. Operasi di store.ts (`moveSub`, `addSub`, `removeSub`, `addWord`, `dropWord`). Riwayat: src/smart.ts (`buildHistory` sejak `histFrom`). Migrasi sekali di `load` saat `subMap` belum ada.
- **Kalender:** hitungan di src/calendar.ts (tes), tampilan bersama HP/laptop di src/calview.ts. `showBars` = kunci perangkat.
- **Excel:** src/excel.ts membangun isi lembar (dites di Node) lalu ditulis dengan write-excel-file (dimuat hanya saat ekspor).
