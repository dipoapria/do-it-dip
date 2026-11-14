// Data model, default categories and default wallets for Do it Dip.

export type TxType = 'in' | 'out' | 'tf';
export type WalletGroup = 'Bank' | 'E-wallet' | 'Tunai';

export interface Tx {
  id: string;
  date: string;            // YYYY-MM-DD (local date)
  type: TxType;
  cat: string | null;      // null for transfers
  sub: string | null;
  amount: number;          // always positive, whole rupiah
  wallet: string;          // source wallet (or receiving wallet for income)
  to: string | null;       // destination wallet for transfers
  note: string;
  book: string;            // 'pribadi' now; 'freelance' / 'usaha' / 'keluarga' later
  /** Id of the recurring rule that created it, if any. */
  rec?: string;
  /** Debt (utang/piutang) this transaction belongs to; debtInit marks the opening loan itself. */
  debt?: string;
  debtInit?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Wallet {
  id: string;
  name: string;
  short: string;           // 2–3 letters shown on the card
  group: WalletGroup;
  color: string;
  no?: string;             // last 4 digits (banks)
  init: number;            // opening balance
  order: number;
  aliases: string[];       // words the sentence parser recognises for this wallet
  book: string;
}

export interface Settings {
  name: string;
  onboarded: boolean;
  theme: 'system' | 'light' | 'dark';
  lpLearned: boolean;
  /** PIN lock: only a salted PBKDF2 hash is stored, never the PIN itself. */
  pinHash: string;
  pinSalt: string;
  pinLen: number;
  /** WebAuthn credential id (base64) for Face ID / Touch ID unlock on this device, or ''. */
  bioId: string;
  /** Lock again after the app was in the background this many seconds. */
  lockAfter: number;
  /** Online backup: signed-in email ('' = not connected), server time of the last copy this device has, unsent changes. */
  cloudEmail: string;
  cloudLastSync: string;
  cloudDirty: boolean;
  /** Monthly spending limit per expense category (rupiah); missing or 0 = no limit. */
  budgets: Record<string, number>;
  /** Budgets of the other books, by book id. */
  bookBudgets: Record<string, Record<string, number>>;
  /** Books in use (pribadi always), and the one shown on this device. */
  books: string[];
  curBook: string;
}

export const DEFAULT_SETTINGS: Settings = { name: '', onboarded: false, theme: 'system', lpLearned: false, pinHash: '', pinSalt: '', pinLen: 4, bioId: '', lockAfter: 60, cloudEmail: '', cloudLastSync: '', cloudDirty: false, budgets: {}, bookBudgets: {}, books: ['pribadi'], curBook: 'pribadi' };

export interface Category { n: string; c: string; i: string; subs: string[]; inc?: boolean; /** only offered in this book */ book?: string }

export const CATS: Record<string, Category> = {
  makan: { n: 'Makan & Minum', c: '#FF7A45', i: 'utensils', subs: ['Makan siang', 'Kopi & minuman', 'Pesan antar', 'Jajan'] },
  transport: { n: 'Transportasi', c: '#3D8BFF', i: 'fuel', subs: ['Bensin', 'Parkir', 'Ojek online', 'Servis'] },
  belanja: { n: 'Belanja', c: '#E04BB5', i: 'shopping-bag', subs: ['Kebutuhan harian', 'Belanja online', 'Pakaian'] },
  tagihan: { n: 'Tagihan', c: '#F0A010', i: 'zap', subs: ['Listrik', 'Internet & pulsa', 'Air', 'Cicilan & paylater'] },
  hiburan: { n: 'Hiburan', c: '#8B5CF6', i: 'clapperboard', subs: ['Nonton', 'Langganan', 'Jalan-jalan'] },
  kesehatan: { n: 'Kesehatan', c: '#F43F5E', i: 'heart-pulse', subs: ['Obat', 'Dokter'] },
  pendidikan: { n: 'Pendidikan', c: '#14B8A6', i: 'graduation-cap', subs: ['Buku', 'Kursus'] },
  sosial: { n: 'Sosial & Ibadah', c: '#22C55E', i: 'hand-heart', subs: ['Infaq & sedekah', 'Arisan', 'Kondangan'] },
  lain: { n: 'Lainnya', c: '#94A3B8', i: 'layout-grid', subs: ['Lainnya', 'Biaya bank'] },
  gaji: { n: 'Gaji', c: '#10B981', i: 'briefcase', subs: ['Gaji bulanan'], inc: true },
  bonus: { n: 'Bonus & Honor', c: '#F59E0B', i: 'gift', subs: ['Honor', 'Bonus'], inc: true },
  masuk_lain: { n: 'Pemasukan lain', c: '#06B6D4', i: 'coins', subs: ['Cashback', 'Bunga', 'Lainnya'], inc: true },
  // Freelance book
  proyek: { n: 'Honor proyek', c: '#0EA5E9', i: 'briefcase-business', subs: ['Proyek', 'DP proyek', 'Pelunasan'], inc: true, book: 'freelance' },
  alat: { n: 'Alat & software', c: '#6366F1', i: 'laptop', subs: ['Software & langganan', 'Perangkat', 'Internet kerja', 'Pajak & biaya'], book: 'freelance' },
  // Usaha book
  penjualan: { n: 'Penjualan', c: '#16A34A', i: 'store', subs: ['Penjualan tunai', 'Penjualan online', 'Pesanan'], inc: true, book: 'usaha' },
  modal: { n: 'Bahan & stok', c: '#B45309', i: 'package', subs: ['Bahan baku', 'Stok barang', 'Kemasan'], book: 'usaha' },
  operasional: { n: 'Operasional', c: '#64748B', i: 'wrench', subs: ['Sewa tempat', 'Gaji karyawan', 'Listrik & air', 'Promosi', 'Ongkir'], book: 'usaha' },
};
export const OUT_CATS = Object.keys(CATS).filter((k) => !CATS[k].inc && !CATS[k].book);
export const IN_CATS = Object.keys(CATS).filter((k) => CATS[k].inc && !CATS[k].book);
/** Categories offered in a book: its own first, then the general ones. */
export function catsFor(book: string, inc: boolean): string[] {
  const own = Object.keys(CATS).filter((k) => CATS[k].book === book && !!CATS[k].inc === inc);
  return own.concat(inc ? IN_CATS : OUT_CATS);
}

export interface Book { n: string; c: string; i: string; d: string }
export const BOOKS: Record<string, Book> = {
  pribadi: { n: 'Pribadi', c: '#13A894', i: 'user', d: 'Gaji dan pengeluaran harian' },
  freelance: { n: 'Freelance', c: '#0EA5E9', i: 'laptop', d: 'Proyek, klien, dan alat kerja' },
  usaha: { n: 'Usaha', c: '#F0A010', i: 'store', d: 'Penjualan, modal, dan operasional' },
};
/** Keyword rules that only apply inside a book (checked before the general ones). */
export const BOOK_KW: Record<string, [RegExp, string, string][]> = {
  freelance: [
    [/\b(dp|uang muka)\b/, 'proyek', 'DP proyek'],
    [/\b(pelunasan|lunas|invoice)\b/, 'proyek', 'Pelunasan'],
    [/\b(proyek|project|klien|client|honor|fee|bayaran)\b/, 'proyek', 'Proyek'],
    [/\b(software|domain|hosting|canva|adobe|figma|lisensi|plugin|template|chatgpt|claude)\b/, 'alat', 'Software & langganan'],
    [/\b(laptop|mouse|keyboard|monitor|kamera|tripod|mic|headset)\b/, 'alat', 'Perangkat'],
    [/\b(pajak|pph|biaya admin)\b/, 'alat', 'Pajak & biaya'],
  ],
  usaha: [
    [/\b(jual|terjual|penjualan|laku|omzet|omset)\b/, 'penjualan', 'Penjualan tunai'],
    [/\b(pesanan|orderan)\b/, 'penjualan', 'Pesanan'],
    [/\b(shopee|tokopedia|tiktok|marketplace)\b.*\b(cair|pencairan|masuk)\b/, 'penjualan', 'Penjualan online'],
    [/\b(bahan|bahan baku|kulakan|belanja bahan)\b/, 'modal', 'Bahan baku'],
    [/\b(stok|restok|restock|grosir)\b/, 'modal', 'Stok barang'],
    [/\b(kemasan|packing|plastik|box|kardus|stiker|label)\b/, 'modal', 'Kemasan'],
    [/\b(sewa|kontrakan|lapak)\b/, 'operasional', 'Sewa tempat'],
    [/\b(karyawan|pegawai|gaji karyawan|upah)\b/, 'operasional', 'Gaji karyawan'],
    [/\b(promosi|iklan|ads|endorse|brosur)\b/, 'operasional', 'Promosi'],
    [/\b(ongkir|kurir|ekspedisi|jne|jnt|sicepat)\b/, 'operasional', 'Ongkir'],
  ],
};

// Keyword → category rules for the sentence parser. First match wins, so specific rules come first.
export const KW: [RegExp, string, string][] = [
  [/\b(air mineral|aqua|le minerale|galon)\b/, 'belanja', 'Kebutuhan harian'], // before "air" (PDAM) and "minum"
  [/\b(gofood|grabfood|shopeefood|pesan antar|delivery)\b/, 'makan', 'Pesan antar'],
  [/\b(kopi|ngopi|kopsu|latte|teh|boba|jus|minum|es)\b/, 'makan', 'Kopi & minuman'],
  [/\b(jajan|cemilan|snack|gorengan|roti)\b/, 'makan', 'Jajan'],
  [/\b(makan|sarapan|nasi|bakso|mie|mi|pempek|tekwan|model|martabak|ayam|soto|warung|lunch|dinner|padang|celor|pindang)\b/, 'makan', 'Makan siang'],
  [/\b(bensin|pertalite|pertamax|bbm|spbu|solar)\b/, 'transport', 'Bensin'],
  [/\b(parkir)\b/, 'transport', 'Parkir'],
  [/\b(gojek|goride|gocar|grab|maxim|ojek|ojol|taksi|angkot|lrt)\b/, 'transport', 'Ojek online'],
  [/\b(servis|service|oli|bengkel|ban)\b/, 'transport', 'Servis'],
  [/\b(shopee|tokopedia|tokped|lazada|checkout|online)\b/, 'belanja', 'Belanja online'],
  [/\b(baju|celana|sepatu|kaos|jilbab|kemeja|batik|sandal)\b/, 'belanja', 'Pakaian'],
  [/\b(indomaret|alfamart|alfamidi|minimarket|supermarket|sabun|sampo|beras|minyak|galon|telur|gula|belanja|pasar)\b/, 'belanja', 'Kebutuhan harian'],
  [/\b(listrik|pln|token)\b/, 'tagihan', 'Listrik'],
  [/\b(wifi|internet|indihome|pulsa|kuota|paket data)\b/, 'tagihan', 'Internet & pulsa'],
  [/\b(cicilan|angsuran|kredivo|akulaku|paylater|spaylater)\b/, 'tagihan', 'Cicilan & paylater'],
  [/\b(pdam|air)\b/, 'tagihan', 'Air'],
  [/\b(nonton|bioskop|film|xxi|cgv)\b/, 'hiburan', 'Nonton'],
  [/\b(netflix|spotify|youtube|langganan|disney|vidio)\b/, 'hiburan', 'Langganan'],
  [/\b(liburan|wisata|jalan-jalan|tiket|hotel)\b/, 'hiburan', 'Jalan-jalan'],
  [/\b(obat|apotek|vitamin)\b/, 'kesehatan', 'Obat'],
  [/\b(dokter|klinik|rumah sakit|rs|periksa|bpjs)\b/, 'kesehatan', 'Dokter'],
  [/\b(buku|alat tulis|atk)\b/, 'pendidikan', 'Buku'],
  [/\b(kursus|les|kelas|pelatihan|webinar|seminar)\b/, 'pendidikan', 'Kursus'],
  [/\b(infaq|infak|sedekah|zakat|donasi|masjid|amal)\b/, 'sosial', 'Infaq & sedekah'],
  [/\b(arisan)\b/, 'sosial', 'Arisan'],
  [/\b(kondangan|nikahan|kado|sumbangan|takziah|hajatan)\b/, 'sosial', 'Kondangan'],
  [/\b(admin|biaya bank|biaya adm)\b/, 'lain', 'Biaya bank'],
];
export const KW_IN: [RegExp, string, string][] = [
  [/\b(gaji|gajian|salary)\b/, 'gaji', 'Gaji bulanan'],
  [/\b(honor|fee|bonus|thr|insentif|tunjangan|lembur)\b/, 'bonus', 'Honor'],
  [/\b(cashback|refund)\b/, 'masuk_lain', 'Cashback'],
  [/\b(bunga)\b/, 'masuk_lain', 'Bunga'],
];

export const WALLET_COLORS = ['#0F8B8D', '#6D3FD8', '#00A5CF', '#F25A24', '#2F7CF6', '#2E9E58', '#E04BB5', '#C2410C', '#1D1641', '#B45309'];

export const DEFAULT_WALLETS: Omit<Wallet, 'init' | 'book'>[] = [
  { id: 'bsb', name: 'Bank Sumsel Babel', short: 'BSB', group: 'Bank', color: '#0F8B8D', order: 0, aliases: ['bank sumsel babel', 'sumsel babel', 'bank sumsel', 'sumsel', 'bsb'] },
  { id: 'permata', name: 'Bank Permata', short: 'PMT', group: 'Bank', color: '#6D3FD8', order: 1, aliases: ['bank permata', 'permata'] },
  { id: 'gopay', name: 'GoPay', short: 'GP', group: 'E-wallet', color: '#00A5CF', order: 2, aliases: ['gopay', 'go pay'] },
  { id: 'spay', name: 'ShopeePay', short: 'SP', group: 'E-wallet', color: '#F25A24', order: 3, aliases: ['shopeepay', 'shopee pay', 'spay'] },
  { id: 'dana', name: 'DANA', short: 'DN', group: 'E-wallet', color: '#2F7CF6', order: 4, aliases: ['dana'] },
  { id: 'tunai', name: 'Tunai', short: 'Rp', group: 'Tunai', color: '#2E9E58', order: 5, aliases: ['tunai', 'cash', 'kes'] },
];

export const WALLET_ICON: Record<WalletGroup, string> = { Bank: 'landmark', 'E-wallet': 'smartphone', Tunai: 'banknote' };
