# Baca struk dengan AI (Gemini) — pemasangan

Foto struk dikirim ke Supabase Edge Function `read-receipt`, yang memanggil Gemini 3.5 Flash Lite
(cadangan: Gemini 3.1 Flash Lite). API key Gemini hanya tersimpan di Supabase, tidak pernah ada di aplikasi
atau di repo. Hanya akun yang login ke cadangan online yang bisa memakainya.

## 1. API key Gemini (Google AI Studio)

1. Buka https://aistudio.google.com dengan akun Google pribadi.
2. Buat project baru khusus Do it Dip (batas pemakaian dihitung per project).
3. **Get API key → Create API key** di project itu. Salin key-nya. Jangan aktifkan billing (tetap gratis).
4. Di **Rate Limit**, pastikan Gemini 3.5 Flash Lite punya batas harian (RPD) lebih dari 0.

## 2. Edge Function di Supabase

1. Supabase dashboard → project Do it Dip → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nama fungsi: `read-receipt` (persis).
3. Hapus isi contoh, tempel seluruh isi `supabase/functions/read-receipt/index.ts`, lalu **Deploy**.
4. Biarkan **Verify JWT** menyala (hanya pengguna yang login yang boleh memanggil).

## 3. Simpan key sebagai rahasia

Edge Functions → **Secrets** → **Add new secret**:

- Name: `GEMINI_API_KEY`
- Value: API key dari langkah 1

## 4. Di aplikasi

Lainnya → **Baca struk** → **AI (Gemini)** (bawaan). Cadangan online harus tersambung.
Saat offline, kuota habis, atau fungsi bermasalah, aplikasi otomatis memakai OCR di HP.

## Ganti model

Ubah daftar `MODELS` di `supabase/functions/read-receipt/index.ts` (yang pertama = utama), lalu deploy ulang.

## OCR di HP (cadangan, tetap dipelihara)

`src/scan.ts`, `src/imgproc.ts`, `src/receipt.ts` dan lab pengukur `tools/ocr-lab/` tetap ada agar OCR bisa
dikembangkan lagi kapan saja (lihat ROADMAP, bagian catatan teknis).

## Harga saham otomatis (opsional)

Fungsi kedua, `stock-price`, mengambil harga saham Indonesia terbaru untuk fitur Investasi.

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**, nama: `stock-price` (persis).
2. Tempel seluruh isi `supabase/functions/stock-price/index.ts`, lalu **Deploy**. Biarkan **Verify JWT** menyala.
3. Tidak perlu secret apa pun.

Sumber harganya tidak resmi (data publik Yahoo Finance, kode saham + ".JK") dan bisa tertunda atau berhenti.
Kalau gagal, aplikasi tetap memakai harga yang diisi manual di halaman aset.
