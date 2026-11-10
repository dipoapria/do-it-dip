// Dates (local, YYYY-MM-DD strings) and Indonesian number formatting.

export const pad = (n: number) => String(n).padStart(2, '0');
export const ds = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const toD = (s: string) => new Date(s + 'T00:00:00');
export function todayStr(now = new Date()): string {
  return ds(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
export function addDays(s: string, n: number): string {
  const d = toD(s);
  d.setDate(d.getDate() + n);
  return ds(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
export const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const HARI_P = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function dayLabel(s: string, today: string): string {
  if (s === today) return 'Hari ini';
  if (s === addDays(today, -1)) return 'Kemarin';
  const d = toD(s);
  const base = `${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]}`;
  return s.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.getFullYear()}`;
}
export function longDate(s: string): string {
  const d = toD(s);
  return `${HARI_P[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}
export const fmtN = (n: number) => Math.round(Math.abs(n)).toLocaleString('id-ID');
/** Rupiah with a minus sign for negatives (e.g. an overdrawn wallet): −Rp1.831.000 */
export const rp = (n: number) => (Math.round(n) < 0 ? '−' : '') + 'Rp' + fmtN(n);
export function shortTxt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (a / 1e9).toFixed(1).replace('.', ',') + ' M';
  if (a >= 1e6) return (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' jt';
  if (a >= 1e3) return Math.round(a / 1e3) + ' rb';
  return String(Math.round(a));
}
export const pct = (x: number) => Math.round(x * 100) + '%';
export function daysIn(mk: string): number {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export function monthName(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return `${BULAN[m - 1]} ${y}`;
}
export function addMonths(mk: string, n: number): string {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const digitsOnly = (s: string) => +(s.replace(/[^\d]/g, '')) || 0;
export const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
