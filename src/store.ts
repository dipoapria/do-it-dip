// Local storage on the device (IndexedDB via Dexie). The UI reads the in-memory `data`;
// every change is written to memory first (instant UI) and then persisted.
import Dexie, { type Table } from 'dexie';
import { DEFAULT_SETTINGS, type Settings, type Tx, type Wallet } from './model.ts';

interface Learned { word: string; cat: string; sub: string }
interface SettingRow { key: string; value: unknown }

class DipDB extends Dexie {
  tx!: Table<Tx, string>;
  wallets!: Table<Wallet, string>;
  learned!: Table<Learned, string>;
  settings!: Table<SettingRow, string>;
  constructor() {
    super('do-it-dip');
    this.version(1).stores({ tx: 'id,date,book,wallet,type', wallets: 'id,order', learned: 'word', settings: 'key' });
  }
}
export const db = new DipDB();

export const data = {
  txs: [] as Tx[],
  wallets: [] as Wallet[],
  learned: {} as Record<string, { cat: string; sub: string }>,
  settings: { ...DEFAULT_SETTINGS } as Settings,
};

const fail = (e: unknown) => {
  console.error(e);
  window.dispatchEvent(new CustomEvent('dip-error', { detail: 'Gagal menyimpan ke perangkat. Coba lagi.' }));
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Settings that belong to this device only: never put in backups, never overwritten by a restore. */
export const DEVICE_KEYS: (keyof Settings)[] = ['pinHash', 'pinSalt', 'pinLen', 'bioId', 'lockAfter', 'theme', 'cloudEmail', 'cloudLastSync', 'cloudDirty', 'lpLearned'];

/* ---------- change signal (drives automatic online backup) ---------- */
let changeListener: (() => void) | null = null;
export function onChange(fn: () => void): void { changeListener = fn; }
function changed(): void { if (changeListener) changeListener(); }

export async function load(): Promise<void> {
  const [t, w, l, s] = await Promise.all([db.tx.toArray(), db.wallets.toArray(), db.learned.toArray(), db.settings.toArray()]);
  data.txs = t;
  data.wallets = w;
  data.learned = Object.fromEntries(l.map((x) => [x.word, { cat: x.cat, sub: x.sub }]));
  data.settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries(s.map((x) => [x.key, x.value])) } as Settings;
}

/** Ask the browser not to evict our data (important on iPhone). */
export async function requestPersist(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export type NewTx = Omit<Tx, 'id' | 'createdAt' | 'updatedAt' | 'book'> & { book?: string };
export function addTx(o: NewTx): Tx {
  const now = Date.now();
  const t: Tx = { book: 'pribadi', ...o, id: uid(), createdAt: now, updatedAt: now };
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

/* ---------- backup ---------- */
export interface Backup {
  app: 'do-it-dip'; version: 1; exportedAt: string;
  data: { tx: Tx[]; wallets: Wallet[]; learned: Learned[]; settings: Partial<Settings> };
}
export function exportAll(): Backup {
  return {
    app: 'do-it-dip', version: 1, exportedAt: new Date().toISOString(),
    data: {
      tx: data.txs, wallets: data.wallets,
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
  await db.transaction('rw', [db.tx, db.wallets, db.learned, db.settings], async () => {
    await Promise.all([db.tx.clear(), db.wallets.clear(), db.learned.clear(), db.settings.clear()]);
    await db.tx.bulkPut(b.data.tx);
    await db.wallets.bulkPut(b.data.wallets);
    await db.learned.bulkPut(b.data.learned || []);
    await db.settings.bulkPut(Object.entries({ ...incoming, ...local, onboarded: true }).map(([key, value]) => ({ key, value })));
  });
  await load();
}
export async function wipe(): Promise<void> {
  await db.transaction('rw', [db.tx, db.wallets, db.learned, db.settings], async () => {
    await Promise.all([db.tx.clear(), db.wallets.clear(), db.learned.clear(), db.settings.clear()]);
  });
  await load();
}
