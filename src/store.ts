// Local storage on the device (IndexedDB via Dexie). The UI reads the in-memory `data`;
// every change is written to memory first (instant UI) and then persisted.
import Dexie, { type Table } from 'dexie';
import { applyCatEdits, applyDict, BASE_CATS, CATS, DEFAULT_SETTINGS, DICT_NOW, NEW_BASE_SUBS, type CatEdit, type Settings, type Tx, type Wallet } from './model.ts';
import type { Rule } from './recurring.ts';
import { fixedMatch, learnKey } from './parser.ts';
import type { Debt, Goal } from './plan.ts';
import type { Asset } from './invest.ts';

interface Learned { word: string; cat: string; sub: string }
interface SettingRow { key: string; value: unknown }

class DipDB extends Dexie {
  tx!: Table<Tx, string>;
  wallets!: Table<Wallet, string>;
  learned!: Table<Learned, string>;
  settings!: Table<SettingRow, string>;
  rules!: Table<Rule, string>;
  goals!: Table<Goal, string>;
  debts!: Table<Debt, string>;
  assets!: Table<Asset, string>;
  constructor() {
    super('do-it-dip');
    this.version(1).stores({ tx: 'id,date,book,wallet,type', wallets: 'id,order', learned: 'word', settings: 'key' });
    this.version(2).stores({ rules: 'id' });
    this.version(3).stores({ goals: 'id', debts: 'id' });
    this.version(4).stores({ assets: 'id' });
  }
}
export const db = new DipDB();

export const data = {
  txs: [] as Tx[],
  wallets: [] as Wallet[],
  learned: {} as Record<string, { cat: string; sub: string }>,
  settings: { ...DEFAULT_SETTINGS } as Settings,
  rules: [] as Rule[],
  goals: [] as Goal[],
  debts: [] as Debt[],
  assets: [] as Asset[],
};

const fail = (e: unknown) => {
  console.error(e);
  window.dispatchEvent(new CustomEvent('dip-error', { detail: 'Gagal menyimpan ke perangkat. Coba lagi.' }));
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Settings that belong to this device only: never put in backups, never overwritten by a restore. */
export const DEVICE_KEYS: (keyof Settings)[] = ['pinHash', 'pinSalt', 'pinLen', 'bioId', 'lockAfter', 'theme', 'cloudEmail', 'cloudLastSync', 'cloudDirty', 'lpLearned', 'curBook', 'receiptMode', 'showBars'];

/* ---------- books: Pribadi / Freelance / Usaha ---------- */
export const curBook = (): string => (data.settings.books || ['pribadi']).includes(data.settings.curBook) ? data.settings.curBook : 'pribadi';
/** Transactions of the book on screen. Balances always use all books (a wallet holds one amount). */
export const bookTxs = (): Tx[] => { const b = curBook(); return data.txs.filter((t) => (t.book || 'pribadi') === b); };
/** Wallets shown in the book on screen: shared wallets (book 'pribadi') plus the book's own. */
export const bookWallets = (): Wallet[] => { const b = curBook(); return data.wallets.filter((w) => !w.book || w.book === 'pribadi' || w.book === b); };

/* ---------- change signal (drives automatic online backup) ---------- */
let changeListener: (() => void) | null = null;
export function onChange(fn: () => void): void { changeListener = fn; }
let revision = 0;
/** Goes up on every change of the data (lets screens cache what they derive from it). */
export const rev = (): number => revision;
function changed(): void { revision++; if (changeListener) changeListener(); }

export async function load(): Promise<void> {
  const [t, w, l, s, r, g, d] = await Promise.all([db.tx.toArray(), db.wallets.toArray(), db.learned.toArray(), db.settings.toArray(), db.rules.toArray(), db.goals.toArray(), db.debts.toArray()]);
  data.txs = t;
  data.wallets = w;
  data.rules = r;
  data.goals = g;
  data.debts = d;
  data.assets = await db.assets.toArray();
  data.learned = Object.fromEntries(l.map((x) => [x.word, { cat: x.cat, sub: x.sub }]));
  data.settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries(s.map((x) => [x.key, x.value])) } as Settings;
  if (!s.some((x) => x.key === 'subMap')) migrateSubs();
  applyCatEdits(data.settings.catEdits);
  applyDict(data.settings.subMap, data.settings.kwOff);
  revision++;
}

/**
 * Once, when subcategory management arrives: "Makan siang" becomes "Makan" (transactions, schedules, remembered
 * words, the user's own list), new built-in subcategories are added to lists the user had already edited, and
 * learning from history starts now.
 */
function migrateSubs(): void {
  const st = data.settings, edits: Record<string, CatEdit> = JSON.parse(JSON.stringify(st.catEdits || {}));
  for (const [k, x] of Object.entries(edits)) {
    if (!BASE_CATS[k] || !x.subs) continue;
    x.subs = x.subs.map((v) => (k === 'makan' && v === 'Makan siang' ? 'Makan' : v));
    for (const n of NEW_BASE_SUBS[k] || []) if (!x.subs.includes(n)) x.subs.push(n);
  }
  const txs = data.txs.filter((t) => t.cat === 'makan' && t.sub === 'Makan siang');
  txs.forEach((t) => { t.sub = 'Makan'; });
  if (txs.length) db.tx.bulkPut(txs).catch(fail);
  for (const r of data.rules) if (r.cat === 'makan' && r.sub === 'Makan siang') { r.sub = 'Makan'; db.rules.put(r).catch(fail); }
  for (const [w, v] of Object.entries(data.learned)) if (v.cat === 'makan' && v.sub === 'Makan siang') { v.sub = 'Makan'; db.learned.put({ word: w, ...v }).catch(fail); }
  const put = (key: keyof Settings, value: unknown) => { (st as unknown as Record<string, unknown>)[key] = value; db.settings.put({ key, value }).catch(fail); };
  put('catEdits', edits);
  put('subMap', { 'makan|Makan siang': 'makan|Makan' });
  put('kwOff', st.kwOff || []);
  put('histFrom', Date.now());
}

/** Ask the browser not to evict our data (important on iPhone). */
export async function requestPersist(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export type NewTx = Omit<Tx, 'id' | 'createdAt' | 'updatedAt' | 'book'> & { book?: string };
export function addTx(o: NewTx): Tx {
  const now = Date.now();
  const t: Tx = { book: curBook(), ...o, id: uid(), createdAt: now, updatedAt: now };
  // remembered fixed expenses ("sewa kos") are marked by themselves
  if (t.fixed === undefined && t.type === 'out' && !t.debt && !t.inv && fixedMatch(t.note, data.settings.fixedKeys)) t.fixed = true;
  data.txs.push(t);
  db.tx.put(t).catch(fail);
  changed();
  return t;
}
export function updateTx(id: string, patch: Partial<Tx>): Tx | undefined {
  const t = data.txs.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, patch, { updatedAt: Date.now() });
  db.tx.put(t).catch(fail);
  changed();
  return t;
}
export function deleteTx(id: string): Tx | undefined {
  const i = data.txs.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [t] = data.txs.splice(i, 1);
  db.tx.delete(id).catch(fail);
  changed();
  return t;
}
export function restoreTx(t: Tx): void {
  data.txs.push(t);
  db.tx.put(t).catch(fail);
  changed();
}

export function newWalletId(): string { return 'w-' + uid().slice(0, 8); }
export function saveWallet(w: Wallet): void {
  const i = data.wallets.findIndex((x) => x.id === w.id);
  if (i >= 0) data.wallets[i] = w; else data.wallets.push(w);
  db.wallets.put(w).catch(fail);
  changed();
}
export function deleteWallet(id: string): void {
  data.wallets = data.wallets.filter((w) => w.id !== id);
  db.wallets.delete(id).catch(fail);
  changed();
}
export async function saveWallets(ws: Wallet[]): Promise<void> {
  data.wallets = ws;
  await db.transaction('rw', db.wallets, async () => { await db.wallets.clear(); await db.wallets.bulkPut(ws); });
  changed();
}

/** Add a transaction with a fixed id (recurring occurrences); false when it already exists. */
export function addTxWithId(t: Tx): boolean {
  if (data.txs.some((x) => x.id === t.id)) return false;
  data.txs.push(t);
  db.tx.put(t).catch(fail);
  changed();
  return true;
}

export function saveRule(r: Rule): void {
  const i = data.rules.findIndex((x) => x.id === r.id);
  if (i >= 0) data.rules[i] = r; else data.rules.push(r);
  db.rules.put(r).catch(fail);
  changed();
}
export function deleteRule(id: string): void {
  data.rules = data.rules.filter((r) => r.id !== id);
  db.rules.delete(id).catch(fail);
  changed();
}
export const newRuleId = () => uid().slice(0, 8);

export function saveGoal(g: Goal): void {
  const i = data.goals.findIndex((x) => x.id === g.id);
  if (i >= 0) data.goals[i] = g; else data.goals.push(g);
  db.goals.put(g).catch(fail);
  changed();
}
export function deleteGoal(id: string): void {
  data.goals = data.goals.filter((g) => g.id !== id);
  db.goals.delete(id).catch(fail);
  changed();
}
export function saveDebt(d: Debt): void {
  const i = data.debts.findIndex((x) => x.id === d.id);
  if (i >= 0) data.debts[i] = d; else data.debts.push(d);
  db.debts.put(d).catch(fail);
  changed();
}
export function saveAsset(a: Asset): void {
  const i = data.assets.findIndex((x) => x.id === a.id);
  if (i >= 0) data.assets[i] = a; else data.assets.push(a);
  db.assets.put(a).catch(fail);
  changed();
}
/** Removes the asset and its transactions (buys, sells, dividends); wallet balances follow. */
export function deleteAsset(id: string): void {
  data.assets = data.assets.filter((a) => a.id !== id);
  const gone = data.txs.filter((t) => t.inv === id).map((t) => t.id);
  data.txs = data.txs.filter((t) => t.inv !== id);
  db.transaction('rw', db.assets, db.tx, async () => { await db.assets.delete(id); await db.tx.bulkDelete(gone); }).catch(fail);
  changed();
}
/** Removes the debt and its linked transactions (the loan and its payments). */
export function deleteDebt(id: string): void {
  data.debts = data.debts.filter((d) => d.id !== id);
  const gone = data.txs.filter((t) => t.debt === id).map((t) => t.id);
  data.txs = data.txs.filter((t) => t.debt !== id);
  db.transaction('rw', db.debts, db.tx, async () => { await db.debts.delete(id); await db.tx.bulkDelete(gone); }).catch(fail);
  changed();
}

export function learn(word: string, cat: string, sub: string): void {
  data.learned[word] = { cat, sub };
  db.learned.put({ word, cat, sub }).catch(fail);
  changed();
}
export function unlearn(word: string): void {
  delete data.learned[word];
  db.learned.delete(word).catch(fail);
  changed();
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  data.settings[key] = value;
  db.settings.put({ key, value }).catch(fail);
  if (!DEVICE_KEYS.includes(key) && key !== 'onboarded') changed();
}

/**
 * Mark or unmark a transaction as a fixed expense. Marking remembers its note phrase so later ones are marked
 * by themselves; unmarking forgets it. A transaction from a recurring schedule carries the choice to the schedule.
 * Returns the phrase remembered or forgotten ('' if the note has none).
 */
export function setFixed(id: string, on: boolean): string {
  const t = data.txs.find((x) => x.id === id); if (!t) return '';
  updateTx(id, { fixed: on });
  const r = t.rec ? data.rules.find((x) => x.id === t.rec) : null;
  if (r && !!r.fixed !== on) saveRule({ ...r, fixed: on });
  const key = learnKey(t.note), keys = data.settings.fixedKeys || [];
  if (key) setSetting('fixedKeys', on ? Array.from(new Set([...keys, key])) : keys.filter((k) => k !== key));
  return key;
}
export function forgetFixedKey(key: string): void {
  setSetting('fixedKeys', (data.settings.fixedKeys || []).filter((k) => k !== key));
}

/** Save the user's category changes and rebuild the category list from them. */
export function setCatEdits(edits: Settings['catEdits']): void {
  setSetting('catEdits', edits);
  applyCatEdits(edits);
}

/* ---------- subcategories ---------- */
const subKey = (cat: string, sub: string) => cat + '|' + sub;
/** How many transactions and schedules use a subcategory. */
export function subUse(cat: string, sub: string): { tx: number; rules: number } {
  return { tx: data.txs.filter((t) => t.cat === cat && t.sub === sub).length, rules: data.rules.filter((r) => r.cat === cat && r.sub === sub).length };
}
/** Write a category's subcategory list into the edits (dropping the entry when it equals the built-in list). */
function putSubs(e: Record<string, CatEdit>, k: string, subs: string[]): void {
  const base = BASE_CATS[k], x = { ...(e[k] || {}) };
  if (base && subs.join('|') === base.subs.join('|')) delete x.subs; else x.subs = subs;
  if (Object.keys(x).length) e[k] = x; else delete e[k];
}
function saveSubs(e: Record<string, CatEdit>, map: Record<string, string>): void {
  data.settings.subMap = map;
  db.settings.put({ key: 'subMap', value: map }).catch(fail);
  setCatEdits(e);
  applyDict(map, data.settings.kwOff);
}
/** Add a subcategory at the end of a category's list. */
export function addSub(cat: string, name: string): void {
  const e = { ...(data.settings.catEdits || {}) }, map = { ...(data.settings.subMap || {}) };
  if (!CATS[cat] || CATS[cat].subs.includes(name)) return;
  delete map[subKey(cat, name)]; // a name that was moved away earlier lives here again
  putSubs(e, cat, [...CATS[cat].subs, name]);
  saveSubs(e, map);
}
/**
 * Move everything of one subcategory to another and remove the old one: its transactions, schedules and
 * remembered words; built-in words follow it too. Covers rename (same category, new name, `at` keeps its place),
 * move to another category, and merge into an existing subcategory. Returns the number of transactions moved.
 */
export function moveSub(fromCat: string, fromSub: string, toCat: string, toSub: string, at?: number): number {
  if (!CATS[fromCat] || !CATS[toCat] || (fromCat === toCat && fromSub === toSub)) return 0;
  const now = Date.now(), txs = data.txs.filter((t) => t.cat === fromCat && t.sub === fromSub);
  const type = CATS[toCat].inc ? 'in' : 'out';
  for (const t of txs) { t.cat = toCat; t.sub = toSub; if (t.type !== 'tf') t.type = type; t.updatedAt = now; }
  if (txs.length) db.tx.bulkPut(txs).catch(fail);
  for (const r of data.rules) if (r.cat === fromCat && r.sub === fromSub) { r.cat = toCat; r.sub = toSub; db.rules.put(r).catch(fail); }
  for (const [w, v] of Object.entries(data.learned)) if (v.cat === fromCat && v.sub === fromSub) { v.cat = toCat; v.sub = toSub; db.learned.put({ word: w, ...v }).catch(fail); }
  const e = { ...(data.settings.catEdits || {}) }, map = { ...(data.settings.subMap || {}) }, from = subKey(fromCat, fromSub), to = subKey(toCat, toSub);
  for (const k of Object.keys(map)) if (map[k] === from) map[k] = to;
  map[from] = to; delete map[to];
  const src = CATS[fromCat].subs.filter((x) => x !== fromSub);
  if (fromCat === toCat) {
    if (!src.includes(toSub)) src.splice(at === undefined ? src.length : Math.min(at, src.length), 0, toSub);
    putSubs(e, fromCat, src);
  } else {
    putSubs(e, fromCat, src.length ? src : ['Lainnya']);
    if (!CATS[toCat].subs.includes(toSub)) putSubs(e, toCat, [...CATS[toCat].subs, toSub]);
  }
  saveSubs(e, map);
  return txs.length;
}
/** Remove an unused subcategory (nothing points to it). Its built-in words fall back to the category's first one. */
export function removeSub(cat: string, sub: string): void {
  const e = { ...(data.settings.catEdits || {}) }, map = { ...(data.settings.subMap || {}) };
  const rest = CATS[cat].subs.filter((x) => x !== sub);
  if (!rest.length) return;
  for (const [w, v] of Object.entries(data.learned)) if (v.cat === cat && v.sub === sub) unlearn(w);
  map[subKey(cat, sub)] = subKey(cat, rest[0]);
  putSubs(e, cat, rest);
  saveSubs(e, map);
}

/* ---------- keywords of a subcategory ---------- */
/** Who a word points to now: the user's own words first, then the built-in list. */
export function wordOwner(word: string): { cat: string; sub: string; own: boolean } | null {
  const l = data.learned[word]; if (l) return { ...l, own: true };
  const d = DICT_NOW.find((x) => x.words.includes(word));
  return d ? { cat: d.cat, sub: d.sub, own: false } : null;
}
/** Words of a subcategory: the user's own, and the built-in ones still pointing here. */
export function subWords(cat: string, sub: string): { own: string[]; builtIn: string[] } {
  const own = Object.keys(data.learned).filter((w) => data.learned[w].cat === cat && data.learned[w].sub === sub).sort();
  const builtIn = DICT_NOW.filter((x) => x.cat === cat && x.sub === sub).flatMap((x) => x.words).filter((w) => !data.learned[w]);
  return { own, builtIn: Array.from(new Set(builtIn)) };
}
/** Point a word at a subcategory. Returns where it pointed before, if somewhere else. */
export function addWord(word: string, cat: string, sub: string): { cat: string; sub: string } | null {
  const before = wordOwner(word);
  const off = data.settings.kwOff || [];
  if (off.includes(word)) { setSetting('kwOff', off.filter((w) => w !== word)); applyDict(data.settings.subMap, data.settings.kwOff); }
  learn(word, cat, sub);
  return before && (before.cat !== cat || before.sub !== sub) ? { cat: before.cat, sub: before.sub } : null;
}
/** Take a word away from a subcategory: forget the user's own word, or switch a built-in word off. */
export function dropWord(word: string, cat: string, sub: string): void {
  const l = data.learned[word];
  if (l && l.cat === cat && l.sub === sub) { unlearn(word); return; }
  const off = data.settings.kwOff || [];
  if (!off.includes(word)) setSetting('kwOff', [...off, word]);
  applyDict(data.settings.subMap, data.settings.kwOff);
}

/* ---------- backup ---------- */
export interface Backup {
  app: 'do-it-dip'; version: 1; exportedAt: string;
  data: { tx: Tx[]; wallets: Wallet[]; learned: Learned[]; settings: Partial<Settings>; rules?: Rule[]; goals?: Goal[]; debts?: Debt[]; assets?: Asset[] };
}
export function exportAll(): Backup {
  return {
    app: 'do-it-dip', version: 1, exportedAt: new Date().toISOString(),
    data: {
      tx: data.txs, wallets: data.wallets, rules: data.rules, goals: data.goals, debts: data.debts, assets: data.assets,
      learned: Object.entries(data.learned).map(([word, v]) => ({ word, ...v })),
      settings: Object.fromEntries(Object.entries(data.settings).filter(([k]) => !DEVICE_KEYS.includes(k as keyof Settings))) as Partial<Settings>,
    },
  };
}
/** Returns an error message, or null when the file looks like a valid backup. */
export function checkBackup(obj: unknown): string | null {
  const b = obj as Backup;
  if (!b || b.app !== 'do-it-dip' || !b.data) return 'File ini bukan cadangan Do it Dip.';
  if (!Array.isArray(b.data.tx) || !Array.isArray(b.data.wallets)) return 'Isi cadangan tidak lengkap.';
  const bad = b.data.tx.find((t) => !t || typeof t.id !== 'string' || typeof t.amount !== 'number' || !/^\d{4}-\d{2}-\d{2}$/.test(String(t.date)));
  if (bad) return 'Ada transaksi yang rusak di dalam file.';
  return null;
}
export async function importAll(b: Backup): Promise<void> {
  // Keep this device's own settings (PIN, Face ID, theme, cloud link); take everything else from the backup.
  const local = Object.fromEntries(DEVICE_KEYS.map((k) => [k, data.settings[k]]));
  const incoming = Object.fromEntries(Object.entries(b.data.settings || {}).filter(([k]) => !DEVICE_KEYS.includes(k as keyof Settings)));
  await db.transaction('rw', [db.tx, db.wallets, db.learned, db.settings, db.rules, db.goals, db.debts, db.assets], async () => {
    await Promise.all([db.tx.clear(), db.wallets.clear(), db.learned.clear(), db.settings.clear(), db.rules.clear(), db.goals.clear(), db.debts.clear(), db.assets.clear()]);
    await db.tx.bulkPut(b.data.tx);
    await db.goals.bulkPut(Array.isArray(b.data.goals) ? b.data.goals : []);
    await db.debts.bulkPut(Array.isArray(b.data.debts) ? b.data.debts : []);
    await db.assets.bulkPut(Array.isArray(b.data.assets) ? b.data.assets : []);
    await db.rules.bulkPut(Array.isArray(b.data.rules) ? b.data.rules : []);
    await db.wallets.bulkPut(b.data.wallets);
    await db.learned.bulkPut(b.data.learned || []);
    await db.settings.bulkPut(Object.entries({ ...incoming, ...local, onboarded: true }).map(([key, value]) => ({ key, value })));
  });
  await load();
}
export async function wipe(): Promise<void> {
  await db.transaction('rw', [db.tx, db.wallets, db.learned, db.settings, db.rules, db.goals, db.debts, db.assets], async () => {
    await Promise.all([db.tx.clear(), db.wallets.clear(), db.learned.clear(), db.settings.clear(), db.rules.clear(), db.goals.clear(), db.debts.clear(), db.assets.clear()]);
  });
  await load();
}
