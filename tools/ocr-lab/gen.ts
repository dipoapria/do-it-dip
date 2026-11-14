// Synthetic Indonesian receipts with ground truth, for measuring and tuning the receipt reader.
// Every number on a receipt is consistent (qty x unit = line total, items + tax - discount = total,
// cash - change = total), like real ones. Nothing here is a real person's data.

export type Diff = 'easy' | 'medium' | 'hard' | 'extreme';
export interface TruthItem { name: string; qty: number; price: number } // price = printed line total
export interface Truth {
  id: string; template: string; difficulty: Diff;
  items: TruthItem[]; subtotal: number; discount: number; extra: number; total: number; date: string;
}
export interface RLine { text: string; align?: 'l' | 'c'; bold?: boolean; big?: boolean }
export interface Sample { truth: Truth; lines: RLine[]; width: number }

export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
    range: (lo: number, hi: number) => lo + next() * (hi - lo),
  };
}
export type Rng = ReturnType<typeof rng>;

const MINI: [string, number][] = [
  ['INDOMIE GORENG 85G', 3100], ['INDOMIE SOTO 70G', 3000], ['AQUA BTL 600ML', 3500], ['LE MINERALE 1500ML', 5900], ['TEH PUCUK HARUM 350', 4000],
  ['ULTRA MILK COKLAT 250', 6500], ['ROTI TAWAR SARI ROTI', 16500], ['GULAKU GULA PSR 1KG', 17900], ['BIMOLI MINYAK GRG 2L', 38500],
  ['TELUR AYAM NEGERI 10', 27500], ['LIFEBUOY SABUN 85G', 4500], ['PEPSODENT PG 190G', 13900], ['CLEAR SHAMPO 160ML', 27900],
  ['RINSO CAIR ROSE 750ML', 21900], ['PASEO TISU 250S', 15900], ['KAPAL API SP 165G', 14500], ['GOOD DAY CAPPUCINO', 1800],
  ['CHITATO SAPI PGG 68G', 11200], ['OREO VANILA 133G', 9900], ['POCARI SWEAT 500ML', 7900], ['MILO ACTIGEN 300G', 39900],
  ['INDOMILK KENTAL MANIS', 11500], ['SILVERQUEEN 58G', 15900], ['KECAP BANGO 520ML', 23900], ['ABC SAMBAL ASLI 335', 12500],
  ['MAMA LEMON 780ML', 13900], ['BAYGON AEROSOL 600ML', 38900], ['ABC BATERAI AA 2S', 9800], ['SEDAAP MIE GRG 90G', 3200],
  ['FRISIAN FLAG UHT 900', 19900], ['SUNLIGHT JRK NIPIS 755', 15500], ['BEBELAC 3 MADU 800G', 98500], ['SOFTEX DAUN SIRIH 20', 17900],
  ['DOWNY SEGAR 680ML', 22900], ['TARO NET SEAWEED 70G', 8900], ['YAKULT 5X65ML', 10500], ['NU GREEN TEA 330ML', 5500],
];
const CAFE: [string, number][] = [
  ['Kopi Susu Gula Aren', 25000], ['Americano Ice', 22000], ['Matcha Latte', 32000], ['Croissant Butter', 28000], ['Nasi Goreng Spesial', 35000],
  ['Mie Ayam Bakso', 25000], ['Es Teh Manis', 8000], ['Ayam Geprek Level 3', 27000], ['Pisang Goreng Keju', 18000], ['Air Mineral', 6000],
  ['Cappuccino Hot', 28000], ['Red Velvet Latte', 30000], ['Kentang Goreng', 20000], ['Nasi Ayam Bakar', 38000], ['Lemon Tea Ice', 15000],
  ['Roti Bakar Coklat', 22000], ['Soto Ayam Lamongan', 24000], ['Jus Alpukat', 20000],
];
const APOTEK: [string, number][] = [
  ['PARACETAMOL 500MG STRIP', 12500], ['PROMAG 12 TABLET', 9800], ['BETADINE SOL 15ML', 18500], ['VITAMIN C IPI 45', 7500],
  ['MINYAK KAYU PUTIH 60ML', 24900], ['TOLAK ANGIN CAIR 5S', 21000], ['HANSAPLAST PLESTER 10S', 9500], ['OBH COMBI 100ML', 19800],
  ['MASKER SENSI 50S', 32000], ['ANTANGIN JRG 15ML', 4500], ['INSTO TETES MATA 7.5', 16900], ['SANMOL SIRUP 60ML', 23500],
];
const SUPER: [string, number][] = [
  ['APEL FUJI', 42500], ['PISANG CAVENDISH', 24900], ['DAGING SAPI HAS DALAM', 135000], ['AYAM FILLET DADA', 58900], ['BAYAM HIJAU IKAT', 6500],
  ['WORTEL IMPORT', 18900], ['TOMAT MERAH', 12500], ['BAWANG MERAH', 21900], ['KEJU KRAFT CHEDDAR 165', 26900], ['YOGHURT CIMORY 250', 12900],
  ['SOSIS SO NICE 360G', 31500], ['NUGGET FIESTA 500G', 54900], ['BERAS ROJOLELE 5KG', 79900], ['MINYAK SANIA 2L', 39500],
  ['SUSU GREENFIELDS 1L', 24500], ['ROTI GANDUM BREADTALK', 28000], ['ES KRIM WALLS 700ML', 47900], ['TISU NICE 2 PLY', 18900],
];
const ROTI: [string, number][] = [
  ['ROTI TAWAR KUPAS', 15000], ['DONAT GULA', 6000], ['ROTI SOBEK COKLAT', 22000], ['BOLU PANDAN', 45000], ['ROTI ABON SAPI', 12000],
  ['CROISSANT KEJU', 14000], ['BROWNIES PANGGANG', 55000], ['PIZZA MINI SOSIS', 13000], ['ROTI KASUR SUSU', 25000],
];
const NAMES = ['DEWI', 'RINA', 'BUDI', 'SITI', 'ANDI', 'EKA', 'FAJAR', 'YUNI', 'AGUS', 'NOVI'];
const STREETS = ['JL. MERDEKA NO. 45', 'JL. SUDIRMAN NO. 120', 'JL. DEMANG LEBAR DAUN 7', 'JL. KOL. ATMO NO. 9', 'JL. BASUKI RAHMAT 21', 'JL. MAYOR RUSLAN 3'];
const CITIES = ['PALEMBANG', 'PANGKALPINANG', 'JAKARTA SELATAN', 'BANDUNG', 'BEKASI', 'TANGERANG'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmt = (n: number, sep: '.' | ',') => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
const lr = (l: string, r: string, w: number) => (l.length + r.length + 1 > w ? l.slice(0, w - r.length - 1) + ' ' + r : l + ' '.repeat(w - l.length - r.length) + r);
const rjust = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const ljust = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const L = (text: string, o: Partial<RLine> = {}): RLine => ({ text, ...o });
const dash = (w: number, ch = '-') => L(ch.repeat(w));

function basket(r: Rng, cat: [string, number][], lo: number, hi: number, maxQty = 3): TruthItem[] {
  const n = r.int(lo, hi), pool = cat.slice(), out: TruthItem[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const [name, unit] = pool.splice(r.int(0, pool.length - 1), 1)[0];
    const qty = r.chance(0.65) ? 1 : r.int(2, maxQty);
    out.push({ name, qty, price: qty * unit });
  }
  return out;
}
const unitOf = (it: TruthItem) => it.price / it.qty;
function dateParts(r: Rng, today: Date) {
  const d = new Date(today.getTime() - r.int(0, 25) * 86400000);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), hh: r.int(7, 22), mm: r.int(0, 59), ss: r.int(0, 59) };
}
const iso = (p: { y: number; m: number; d: number }) => `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
function cashFor(r: Rng, total: number) {
  const notes = [5000, 10000, 20000, 50000, 100000];
  const exact = r.chance(0.2);
  if (exact) return total;
  let c = 0;
  for (const n of notes) if (n >= total) { c = n; break; }
  if (!c) c = Math.ceil(total / 50000) * 50000;
  if (c === total || r.chance(0.3)) c = Math.ceil((total + 1) / 10000) * 10000;
  return c;
}

/* ---------------- templates ---------------- */
type Built = { lines: RLine[]; width: number; items: TruthItem[]; subtotal: number; discount: number; extra: number; total: number; date: string };

function indomaret(r: Rng, now: Date): Built {
  const W = 40, items = basket(r, MINI, 1, 9), p = dateParts(r, now), total = items.reduce((s, i) => s + i.price, 0);
  const cash = cashFor(r, total), ppn = Math.round(total * 11 / 111), dpp = total - ppn;
  const lines: RLine[] = [
    L('INDOMARET', { align: 'c', bold: true, big: true }), L('PT. INDOMARCO PRISMATAMA', { align: 'c' }),
    L(`${r.pick(STREETS)}`, { align: 'c' }), L(`${r.pick(CITIES)}`, { align: 'c' }),
    L(`NPWP : 01.337.994.6-092.${r.int(100, 999)}`, { align: 'c' }),
    L(`${pad2(p.d)}.${pad2(p.m)}.${String(p.y).slice(2)}-${pad2(p.hh)}:${pad2(p.mm)}/2.0.37/${r.pick(['TMXY', 'K4J7', 'B2QW'])}-${r.int(100000, 999999)}/${r.pick(NAMES)}/0${r.int(1, 4)}`),
  ];
  for (const it of items) lines.push(L(ljust(it.name, 20) + rjust(String(it.qty), 3) + rjust(String(unitOf(it)), 8) + rjust(fmt(it.price, ','), 9)));
  lines.push(L(lr('TOTAL BELANJA :', fmt(total, ','), W)), L(lr('TUNAI :', fmt(cash, ','), W)), L(lr('KEMBALI :', fmt(cash - total, ','), W)));
  lines.push(L(`PPN : DPP= ${fmt(dpp, ',')} PPN= ${fmt(ppn, ',')}`), L(lr('HARGA JUAL :', fmt(dpp, ','), W)));
  lines.push(L('LAYANAN KONSUMEN', { align: 'c' }), L(`SMS/WA 0811.1500.280 CALL 1500280`, { align: 'c' }), L('KONTAK@INDOMARET.CO.ID', { align: 'c' }));
  return { lines, width: W, items, subtotal: total, discount: 0, extra: 0, total, date: iso(p) };
}

function alfamart(r: Rng, now: Date): Built {
  const W = 40, items = basket(r, MINI, 1, 10), p = dateParts(r, now), total = items.reduce((s, i) => s + i.price, 0);
  const cash = cashFor(r, total), ppn = Math.round(total * 11 / 111);
  const store = r.pick(['ALFAMART', 'ALFAMIDI']);
  const lines: RLine[] = [
    L(store, { align: 'c', bold: true, big: true }), L('PT.SUMBER ALFARIA TRIJAYA, TBK', { align: 'c' }),
    L('ALFA TOWER LT.12, ALAM SUTERA, TANGERANG', { align: 'c' }), L(`NPWP : 01.336.238.9-054.${r.int(100, 999)}`, { align: 'c' }),
    L(`${r.pick(STREETS)} ${r.pick(CITIES)}`, { align: 'c' }),
    L(lr(`Bon  ${r.int(1, 9)}-${r.int(1, 9)}-${r.int(10000, 99999)}`, `Kasir : ${r.pick(NAMES)}`, W)),
  ];
  for (const it of items) lines.push(L(ljust(it.name, 21) + rjust(String(it.qty), 3) + rjust(fmt(unitOf(it), '.'), 8) + rjust(fmt(it.price, '.'), 8)));
  lines.push(L(lr(`Total Item         ${items.reduce((s, i) => s + i.qty, 0)}`, fmt(total, '.'), W)), L(lr('Total Belanja', fmt(total, '.'), W)));
  const card = r.chance(0.25);
  if (card) lines.push(L(lr('Kartu Debit BCA', fmt(total, '.'), W)));
  else lines.push(L(lr('Tunai', fmt(cash, '.'), W)), L(lr('Kembalian', fmt(cash - total, '.'), W)));
  lines.push(L(`PPN ( ${fmt(ppn, '.')})  DPP ( ${fmt(total - ppn, '.')})`));
  lines.push(L(`Tgl. ${pad2(p.d)}-${pad2(p.m)}-${p.y} ${pad2(p.hh)}:${pad2(p.mm)}:${pad2(p.ss)} V.2026.11`), L('Kritik&Saran:1500959', { align: 'c' }), L('SMS/WA: 08111500959', { align: 'c' }));
  return { lines, width: W, items, subtotal: total, discount: 0, extra: 0, total, date: iso(p) };
}

function kelontong(r: Rng, now: Date): Built {
  const W = 32, items = basket(r, MINI, 2, 7, 5), p = dateParts(r, now), total = items.reduce((s, i) => s + i.price, 0), cash = cashFor(r, total);
  const name = r.pick(['TOKO BERKAH JAYA', 'TOKO SUMBER REJEKI', 'MINIMARKET AMANAH', 'TOKO SINAR MAS', 'GROSIR BAROKAH']);
  const lines: RLine[] = [L(name, { align: 'c', bold: true }), L(r.pick(STREETS), { align: 'c' }), L(`Telp. 0711-${r.int(300000, 899999)}`, { align: 'c' }),
    L(lr(`${pad2(p.d)}/${pad2(p.m)}/${p.y} ${pad2(p.hh)}:${pad2(p.mm)}`, `Ksr:${r.pick(NAMES)}`, W)), dash(W)];
  for (const it of items) { lines.push(L(it.name)); lines.push(L(lr(`  ${it.qty} x ${fmt(unitOf(it), '.')}`, fmt(it.price, '.'), W))); }
  lines.push(dash(W), L(lr('Subtotal', fmt(total, '.'), W)), L(lr('Total', fmt(total, '.'), W), { bold: true }), L(lr('Bayar', fmt(cash, '.'), W)), L(lr('Kembali', fmt(cash - total, '.'), W)), dash(W));
  lines.push(L('Terima kasih atas kunjungan Anda', { align: 'c' }), L('Barang yg sudah dibeli', { align: 'c' }), L('tidak dapat ditukar/dikembalikan', { align: 'c' }));
  return { lines, width: W, items, subtotal: total, discount: 0, extra: 0, total, date: iso(p) };
}

function kafe(r: Rng, now: Date): Built {
  const W = 32, items = basket(r, CAFE, 1, 6, 3), p = dateParts(r, now), sub = items.reduce((s, i) => s + i.price, 0);
  const svc = r.chance(0.6) ? Math.round(sub * 0.05) : 0, tax = Math.round((sub + svc) * 0.1), total = sub + svc + tax;
  const name = r.pick(['KOPI NUSANTARA', 'KEDAI SENJA', 'RUMAH MAKAN SEDERHANA', 'WARUNG KOPI 88', 'BAKSO PAK KUMIS']);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const lines: RLine[] = [L(name, { align: 'c', bold: true, big: true }), L(r.pick(STREETS), { align: 'c' }), L(r.pick(CITIES), { align: 'c' }),
    L(`No: INV/${p.y}/${pad2(p.m)}/${r.int(1000, 9999)}`), L(`${p.d} ${months[p.m - 1]} ${p.y} ${pad2(p.hh)}:${pad2(p.mm)}`), L(`Meja ${r.int(1, 30)}  Kasir ${r.pick(NAMES)}`), dash(W)];
  for (const it of items) lines.push(L(lr(`${it.qty} ${it.name}`, fmt(it.price, '.'), W)));
  lines.push(dash(W), L(lr('Subtotal', fmt(sub, '.'), W)));
  if (svc) lines.push(L(lr('Service 5%', fmt(svc, '.'), W)));
  lines.push(L(lr('PB1 10%', fmt(tax, '.'), W)), L(lr('TOTAL', fmt(total, '.'), W), { bold: true }), L(lr(r.pick(['QRIS', 'DEBIT BRI', 'TUNAI']), fmt(total, '.'), W)), dash(W));
  lines.push(L('Wifi: kopi2026 / pass: senja123', { align: 'c' }), L('Follow IG @kedaikopi', { align: 'c' }));
  return { lines, width: W, items, subtotal: sub, discount: 0, extra: svc + tax, total, date: iso(p) };
}

function spbu(r: Rng, now: Date): Built {
  const W = 32, p = dateParts(r, now);
  const [prod, harga] = r.pick([['PERTALITE', 10000], ['PERTAMAX', 12500], ['DEXLITE', 13250], ['PERTAMAX TURBO', 13700]] as [string, number][]);
  const total = r.pick([20000, 25000, 30000, 50000, 75000, 100000, 102500, 150000]), liters = (total / harga).toFixed(2).replace('.', ',');
  const cash = r.chance(0.5) ? total : cashFor(r, total);
  const lines: RLine[] = [L('PERTAMINA', { align: 'c', bold: true, big: true }), L(`SPBU ${r.int(24, 34)}.${r.int(100, 399)}.${r.int(10, 99)}`, { align: 'c' }),
    L(`${r.pick(STREETS)}`, { align: 'c' }), L(`Shift : ${r.int(1, 3)}  No.Trans : ${r.int(100000, 999999)}`),
    L(`Waktu : ${pad2(p.d)}/${pad2(p.m)}/${p.y} ${pad2(p.hh)}:${pad2(p.mm)}:${pad2(p.ss)}`), dash(W),
    L(`Pulau/Pompa  : ${r.int(1, 8)}`), L(`Nama Produk  : ${prod}`), L(`Harga/Liter  : Rp. ${fmt(harga, '.')}`), L(`Volume       : (L) ${liters}`),
    L(`Total Harga  : Rp. ${fmt(total, '.')}`), L(`Operator     : ${r.pick(NAMES)}`), dash(W), L(`CASH         : Rp. ${fmt(cash, '.')}`),
    L('TERIMA KASIH DAN SELAMAT JALAN', { align: 'c' })];
  return { lines, width: W, items: [{ name: prod, qty: 1, price: total }], subtotal: total, discount: 0, extra: 0, total, date: iso(p) };
}

function apotek(r: Rng, now: Date): Built {
  const W = 42, items = basket(r, APOTEK, 1, 5), p = dateParts(r, now), total = items.reduce((s, i) => s + i.price, 0), cash = cashFor(r, total);
  const name = r.pick(['APOTEK SEHAT FARMA', 'APOTEK K-24', 'APOTEK KIMIA FARMA', 'APOTEK BUNDA']);
  const lines: RLine[] = [L(name, { align: 'c', bold: true }), L(r.pick(STREETS), { align: 'c' }), L(`SIA: 503/${r.int(100, 999)}/DINKES/${p.y}`, { align: 'c' }),
    L(lr(`No. ${r.int(100000, 999999)}`, `${pad2(p.d)}-${pad2(p.m)}-${p.y}`, W)), dash(W, '=')];
  for (const it of items) lines.push(L(ljust(it.name, 23) + rjust(String(it.qty), 3) + rjust(fmt(unitOf(it), '.'), 8) + rjust(fmt(it.price, '.'), 8)));
  lines.push(dash(W, '='), L(lr('TOTAL', fmt(total, '.'), W), { bold: true }), L(lr('TUNAI', fmt(cash, '.'), W)), L(lr('KEMBALI', fmt(cash - total, '.'), W)));
  lines.push(L('Semoga lekas sembuh', { align: 'c' }), L(`Apoteker: apt. ${r.pick(NAMES)}, S.Farm`, { align: 'c' }));
  return { lines, width: W, items, subtotal: total, discount: 0, extra: 0, total, date: iso(p) };
}

function supermarket(r: Rng, now: Date): Built {
  const W = 42, items = basket(r, SUPER, 4, 13, 2), p = dateParts(r, now), sub = items.reduce((s, i) => s + i.price, 0);
  const lines: RLine[] = [L(r.pick(['SUPERINDO', 'HYPERMART', 'TRANSMART', 'LOTTE MART']), { align: 'c', bold: true, big: true }), L(r.pick(STREETS), { align: 'c' }), L(r.pick(CITIES), { align: 'c' }),
    L(lr(`${pad2(p.d)}/${pad2(p.m)}/${String(p.y).slice(2)} ${pad2(p.hh)}:${pad2(p.mm)}`, `POS${r.int(1, 20)} TRX${r.int(1000, 9999)}`, W)), dash(W)];
  let disc = 0;
  for (const it of items) {
    if (it.qty > 1) { lines.push(L(it.name)); lines.push(L(lr(`   ${it.qty} X ${fmt(unitOf(it), '.')}`, fmt(it.price, '.'), W))); }
    else lines.push(L(lr(it.name, fmt(it.price, '.'), W)));
    if (r.chance(0.2)) { const d = Math.round(it.price * r.pick([0.1, 0.15, 0.2]) / 100) * 100; disc += d; lines.push(L(lr('   DISC', `-${fmt(d, '.')}`, W))); }
  }
  const total = sub - disc, card = r.chance(0.5), cash = cashFor(r, total);
  lines.push(dash(W), L(lr('SUB TOTAL', fmt(sub, '.'), W)));
  if (disc) lines.push(L(lr('TOTAL DISKON', `-${fmt(disc, '.')}`, W)));
  lines.push(L(lr('TOTAL', fmt(total, '.'), W), { bold: true }));
  if (card) lines.push(L(lr('DEBIT MANDIRI', fmt(total, '.'), W)), L(`NO KARTU : ****${r.int(1000, 9999)}`));
  else lines.push(L(lr('TUNAI', fmt(cash, '.'), W)), L(lr('KEMBALI', fmt(cash - total, '.'), W)));
  lines.push(L(lr('JUMLAH ITEM', String(items.reduce((s, i) => s + i.qty, 0)), W)), L(lr('ANDA HEMAT', fmt(disc, '.'), W)), L('TERIMA KASIH SELAMAT BELANJA KEMBALI', { align: 'c' }));
  return { lines, width: W, items, subtotal: sub, discount: disc, extra: 0, total, date: iso(p) };
}

function toko_roti(r: Rng, now: Date): Built {
  const W = 40, items = basket(r, ROTI, 1, 6, 4), p = dateParts(r, now), total = items.reduce((s, i) => s + i.price, 0), cash = cashFor(r, total);
  const lines: RLine[] = [L(r.pick(['TOKO ROTI CITA RASA', 'HOLLAND BAKERY', 'BAKERY MANDIRI']), { align: 'c', bold: true }), L(r.pick(STREETS), { align: 'c' }),
    L(`${pad2(p.d)}-${pad2(p.m)}-${p.y}  ${pad2(p.hh)}.${pad2(p.mm)}`), dash(W)];
  for (const it of items) lines.push(L(lr(`${ljust(it.name, 18)} ${it.qty} @ ${fmt(unitOf(it), '.')}`, fmt(it.price, '.'), W)));
  lines.push(dash(W), L(lr('JUMLAH', fmt(total, '.'), W), { bold: true }), L(lr('DIBAYAR', fmt(cash, '.'), W)), L(lr('KEMBALI', fmt(cash - total, '.'), W)), L('** TERIMA KASIH **', { align: 'c' }));
  return { lines, width: W, items, subtotal: total, discount: 0, extra: 0, total, date: iso(p) };
}

export const TEMPLATES = { indomaret, alfamart, kelontong, kafe, spbu, apotek, supermarket, toko_roti } as const;
export type TemplateName = keyof typeof TEMPLATES;

export function makeSample(seed: number, difficulty: Diff, template?: TemplateName, now = new Date('2026-11-14T12:00:00')): Sample {
  const r = rng(seed * 7919 + 13);
  const name = template ?? (Object.keys(TEMPLATES) as TemplateName[])[seed % Object.keys(TEMPLATES).length];
  const b = TEMPLATES[name](r, now);
  return {
    lines: b.lines, width: b.width,
    truth: { id: `${name}-${seed}-${difficulty}`, template: name, difficulty, items: b.items, subtotal: b.subtotal, discount: b.discount, extra: b.extra, total: b.total, date: b.date },
  };
}
