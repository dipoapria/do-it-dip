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
}

export const DEFAULT_SETTINGS: Settings = { name: '', onboarded: false, theme: 'system', lpLearned: false };

export interface Category { n: string; c: string; i: string; subs: string[]; inc?: boolean }

export const CATS: Record<string, Category> = {
  makan: { n: 'Makan & Minum', c: '#FF7A45', i: 'utensils', subs: ['Makan siang', 'Kopi & minuman', 'Pesan antar', 'Jajan'] },
  transport: { n: 'Transportasi', c: '#3D8BFF', i: 'fuel', subs: ['Bensin', 'Parkir', 'Ojek online', 'Servis'] },
  belanja: { n: 'Belanja', c: '#E04BB5', i: 'shopping-bag', subs: ['Kebutuhan harian', 'Belanja online', 'Pakaian'] },
  tagihan: { n: 'Tagihan', c: '#F0A010', i: 'zap', subs: ['Listrik', 'Internet & pulsa', 'Air'] },
  hiburan: { n: 'Hiburan', c: '#8B5CF6', i: 'clapperboard', subs: ['Nonton', 'Langganan', 'Jalan-jalan'] },
  kesehatan: { n: 'Kesehatan', c: '#F43F5E', i: 'heart-pulse', subs: ['Obat', 'Dokter'] },
  pendidikan: { n: 'Pendidikan', c: '#14B8A6', i: 'graduation-cap', subs: ['Buku', 'Kursus'] },
  sosial: { n: 'Sosial & Ibadah', c: '#22C55E', i: 'hand-heart', subs: ['Infaq & sedekah', 'Arisan', 'Kondangan'] },
  lain: { n: 'Lainnya', c: '#94A3B8', i: 'layout-grid', subs: ['Lainnya', 'Biaya bank'] },
  gaji: { n: 'Gaji', c: '#10B981', i: 'briefcase', subs: ['Gaji bulanan'], inc: true },
  bonus: { n: 'Bonus & Honor', c: '#F59E0B', i: 'gift', subs: ['Honor', 'Bonus'], inc: true },
  masuk_lain: { n: 'Pemasukan lain', c: '#06B6D4', i: 'coins', subs: ['Cashback', 'Bunga', 'Lainnya'], inc: true },
};
export const OUT_CATS = Object.keys(CATS).filter((k) => !CATS[k].inc);
export const IN_CATS = Object.keys(CATS).filter((k) => CATS[k].inc);

// Keyword → category rules for the sentence parser. First match wins, so specific rules come first.
export const KW: [RegExp, string, string][] = [
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
