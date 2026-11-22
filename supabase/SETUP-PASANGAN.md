# Menambahkan pengguna kedua (pasangan) — panduan admin

Do it Dip dipakai dari alamat yang sama: https://dipoapria.github.io/do-it-dip/ . Setiap pembaruan yang
diterbitkan otomatis sampai ke semua HP dan laptop yang memasangnya, tanpa langkah tambahan.

Data tiap orang terpisah sepenuhnya:

- catatan tersimpan di perangkat masing-masing;
- cadangan online dikunci per akun (Row Level Security: setiap akun hanya bisa membaca barisnya sendiri);
- baca struk AI memakai kunci Gemini masing-masing, jadi kuotanya juga terpisah.

Lakukan langkah di bawah berurutan. Semua dilakukan di dashboard, bukan di aplikasi.

## 1. Kunci Gemini milik pasangan

Pasangan membuatnya dengan akun Google miliknya sendiri:

1. Buka https://aistudio.google.com → buat project baru (mis. "Do it Dip").
2. **Get API key → Create API key** di project itu. Jangan aktifkan billing (tetap gratis).
3. Kirimkan kuncinya ke Anda lewat jalur pribadi. Jangan ditaruh di grup, di repo, atau di catatan bersama.

## 2. Simpan kunci di Supabase Secrets

Supabase dashboard → project Do it Dip → **Edge Functions → Secrets → Add new secret**. Tambahkan dua secret:

| Name | Value |
|---|---|
| `GEMINI_OWNER_EMAIL` | email akun Do it Dip Anda sendiri |
| `GEMINI_KEYS` | `{"email-pasangan@contoh.com": "KUNCI-GEMINI-PASANGAN"}` |

- `GEMINI_API_KEY` yang sudah ada tetap dipakai, tetapi sekarang **hanya** untuk email di `GEMINI_OWNER_EMAIL`.
- `GEMINI_KEYS` berformat JSON: tanda kutip lurus, titik dua, kurung kurawal. Untuk orang ketiga nanti, tambahkan
  dengan koma: `{"a@contoh.com": "KUNCI-A", "b@contoh.com": "KUNCI-B"}`.
- Email ditulis persis seperti dipakai saat masuk ke aplikasi (huruf besar/kecil tidak berpengaruh).

Isi kedua secret ini **sebelum** langkah 3. Kalau `GEMINI_OWNER_EMAIL` kosong, kunci lama tidak dipakai siapa pun
dan struk Anda dibaca dengan OCR di HP.

## 3. Perbarui fungsi `read-receipt`

Edge Functions → `read-receipt` → **Code** → hapus isinya, tempel seluruh isi
`supabase/functions/read-receipt/index.ts` yang terbaru → **Deploy**. Biarkan **Verify JWT** menyala.

Coba baca satu struk dari HP Anda. Harus tetap terbaca oleh AI.

## 4. Buat akun pasangan

Pendaftaran akun baru tetap ditutup ("Allow new users to sign up" mati), jadi akun dibuat dari dashboard:

1. **Authentication → Users → Add user → Create new user**.
2. Isi email pasangan dan kata sandi sementara (minimal 8 karakter).
3. Centang **Auto Confirm User**, lalu **Create user**.

Berikan kata sandi sementara secara langsung atau lewat pesan terpisah, bukan bersama teks panduan.
Setelah masuk, pasangan menggantinya sendiri di **Lainnya → Cadangan online → Ganti kata sandi**.

## 5. Kirim panduan ke pasangan

Teks siap kirim (WhatsApp):

```
Panduan pasang Do it Dip di iPhone:

1. Buka Safari, masuk ke https://dipoapria.github.io/do-it-dip/
2. Ketuk tombol Bagikan (kotak dengan panah ke atas) → "Tambahkan ke Layar Utama" → Tambah.
3. Buka Do it Dip dari layar utama, isi nama panggilan, lalu pilih bank & e-wallet yang kamu pakai dan isi saldonya.
4. Lainnya → Cadangan online → Hubungkan dengan email → Masuk, pakai email kamu dan kata sandi sementara dari aku.
5. Lainnya → Cadangan online → Ganti kata sandi. Simpan di iCloud Keychain.
6. Lainnya → Keamanan → nyalakan Kunci PIN / Face ID kalau mau.

Di laptop: buka alamat yang sama di Chrome/Edge, pilih "Sudah pakai di perangkat lain? Masuk ke cadangan online", masuk dengan akun yang sama.

Catatanmu cuma tersimpan di HP/laptop kamu dan di akun kamu sendiri. Aku tidak bisa melihatnya, begitu juga sebaliknya.
Aplikasinya otomatis ter-update kalau ada perbaikan atau fitur baru.
```

## Yang perlu diketahui

- **Pembaruan:** setiap "Commit & terbitkan" sampai ke semua pengguna. Biasanya setelah aplikasi dibuka ulang sekali.
- **Laptop bersama:** satu profil browser = satu data. Kalau suatu saat memakai laptop yang sama, gunakan profil
  Chrome/Edge yang terpisah (ikon profil di pojok kanan atas → Tambah).
- **Fungsi Edge lain** (`stock-price`) tidak memakai kunci, jadi otomatis bisa dipakai akun mana pun yang login.
- **Impor mutasi** paling teruji untuk format Bank Sumsel Babel dan Permata. Bank lain mungkin perlu penyesuaian
  setelah ada contoh mutasinya.
- **Buku keluarga bersama** belum dibuat. Akun yang terpisah ini adalah fondasinya. Nanti buku Keluarga bisa
  ditambahkan tanpa mengubah data pribadi masing-masing.

## 6. Menghubungkan dua akun (bayar bersama)

Agar bagian pasangan di struk bersama bisa dikirim langsung ke Do it Dip-nya, jalankan sekali:

1. Supabase dashboard → **SQL Editor → New query** → tempel seluruh isi `supabase/setup-partner.sql` → **Run**.
   Skrip ini membuat tabel `links` (undangan) dan `inbox` (kiriman) dengan Row Level Security: setiap akun hanya
   melihat undangan dan kiriman miliknya sendiri. Aman dijalankan ulang.
2. Perbarui fungsi `read-receipt` (langkah 3 di atas) dengan isi file terbaru. Versi ini juga membaca **harga per pcs**
   (dipakai saat satu baris struk berisi beberapa pcs yang dibagi), jadi deploy ulang meskipun sudah pernah.
3. Di HP Anda: **Lainnya → Pasangan** → ketik email akun pasangan → **Undang**.
4. Pasangan membuka Do it Dip (sudah masuk ke Cadangan online) → muncul undangan → **Terima**.

Setelah terhubung: saat struk bersama, ketuk label item sampai menjadi nama pasangan. Bagiannya muncul di aplikasi
pasangan sebagai **Kiriman**, dan pasangan memilih dompet lalu **Terima** atau **Tolak**. Catatan lain tetap terpisah.

## 7. Kategori per item (foto struk)

Fungsi `read-receipt` versi terbaru juga memberi kategori untuk setiap produk, dengan merujuk ke daftar kategori dan
riwayat Anda. Deploy ulang `read-receipt` dengan isi file terbaru (langkah 3). Sebelum dideploy ulang, kategori per item
tetap jalan, tapi ditebak di HP dari kamus dan kebiasaan Anda.
