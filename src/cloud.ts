// Online backup in the user's own Supabase project.
// Sign-in is email + password typed inside the app, so the session lives in the installed iPhone app
// (an email link would open Safari, whose storage is separate) and it needs no custom email templates
// (Supabase only allows editing those after setting up custom SMTP).
// Data access is protected by Row Level Security (see supabase/setup.sql): each account sees only its own row.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Backup } from './store.ts';

// Public by design: the publishable key only works together with the RLS policies.
export const SUPABASE_URL = 'https://beafjictidwkmmwcxqnh.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_jWtTQtwHCwuiKClFzYKdHg_gLIKMAoh';

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'do-it-dip-auth' } });
  }
  return client;
}

export interface CloudMeta { updated_at: string; tx_count: number; device: string | null }

/** Human-readable reason for a Supabase/network error. */
export function cloudError(e: unknown): string {
  const m = String((e as { message?: string })?.message || e || '');
  if (!navigator.onLine || /fetch|network|load failed/i.test(m)) return 'Tidak ada koneksi internet.';
  if (/invalid login credentials/i.test(m)) return 'Email atau kata sandi salah.';
  if (/email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Buka email dari Supabase dan ketuk tautan konfirmasinya, lalu masuk lagi.';
  if (/already registered|already exists/i.test(m)) return 'Email ini sudah terdaftar. Pilih "Masuk".';
  if (/signups? not allowed|signup.*disabled/i.test(m)) return 'Pendaftaran akun baru ditutup di Supabase. Pilih "Masuk" dengan akun yang sudah ada.';
  if (/password.*(at least|short|weak)/i.test(m)) return 'Kata sandi terlalu pendek atau lemah. Gunakan minimal 8 karakter.';
  if (/rate limit|too many|security purposes|seconds/i.test(m)) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if (/links|inbox|accept_link/i.test(m) && /does not exist|42P01|PGRST20[0-9]|schema cache|could not find/i.test(m)) return 'Fitur pasangan belum disiapkan di Supabase (jalankan supabase/setup-partner.sql).';
  if (/links_pair|duplicate key/i.test(m)) return 'Undangan ke email itu sudah pernah dikirim.';
  if (/row-level security|violates row/i.test(m)) return 'Akun belum terhubung, atau undangan tidak berlaku.';
  if (/relation .*backups|does not exist|42P01|PGRST205/i.test(m)) return 'Tabel cadangan belum dibuat di Supabase (jalankan supabase/setup.sql).';
  if (/belum punya kunci gemini/i.test(m)) return 'Akun ini belum punya kunci Gemini sendiri';
  if (/same.*(old|previous)|different from the old/i.test(m)) return 'Kata sandi baru harus berbeda dari yang lama.';
  if (/reauthenticat/i.test(m)) return 'Demi keamanan, keluar lalu masuk lagi sebelum mengganti kata sandi.';
  if (/jwt|not authenticated|401/i.test(m)) return 'Sesi login berakhir. Masuk lagi.';
  return m || 'Gagal terhubung ke cadangan online.';
}

export function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad|Macintosh.*Mobile/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'Perangkat lain';
}

export async function currentEmail(): Promise<string | null> {
  const c = await sb();
  const { data } = await c.auth.getSession();
  return data.session?.user?.email ?? null;
}
/** Sign in; returns the account email. */
export async function signIn(email: string, password: string): Promise<string> {
  const c = await sb();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user?.email ?? email;
}
/** Create the account. Returns the email when signed in right away, or null when Supabase first wants the email confirmed. */
export async function signUp(email: string, password: string): Promise<string | null> {
  const c = await sb();
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('User already registered');
  return data.session ? data.user?.email ?? email : null;
}
/** Change the signed-in account's password. */
export async function changePassword(password: string): Promise<void> {
  const c = await sb();
  const { error } = await c.auth.updateUser({ password });
  if (error) throw error;
}
export async function signOut(): Promise<void> { const c = await sb(); await c.auth.signOut(); }

async function userId(): Promise<string> {
  const c = await sb();
  const { data } = await c.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('not authenticated');
  return id;
}
export async function meta(): Promise<CloudMeta | null> {
  const c = await sb();
  const { data, error } = await c.from('backups').select('updated_at,tx_count,device').eq('user_id', await userId()).maybeSingle();
  if (error) throw error;
  return data as CloudMeta | null;
}
export async function pull(): Promise<{ backup: Backup; updated_at: string } | null> {
  const c = await sb();
  const { data, error } = await c.from('backups').select('data,updated_at').eq('user_id', await userId()).maybeSingle();
  if (error) throw error;
  return data ? { backup: data.data as Backup, updated_at: data.updated_at as string } : null;
}
/** Upload the full backup; returns the server time of the saved copy. */
export async function push(backup: Backup): Promise<string> {
  const c = await sb();
  const row = { user_id: await userId(), data: backup, tx_count: backup.data.tx.length, device: deviceName() };
  const { data, error } = await c.from('backups').upsert(row, { onConflict: 'user_id' }).select('updated_at').single();
  if (error) throw error;
  return data.updated_at as string;
}

/** Read a receipt photo with Gemini through the read-receipt Edge Function (the API key stays on the server). */
export async function readReceipt(image: string, mime: string, model?: string, extra?: { cats?: string; hints?: string }): Promise<{ model: string; receipt: unknown; usage: unknown }> {
  const c = await sb();
  const { data, error } = await c.functions.invoke('read-receipt', { body: { image, mime, ...(model ? { model } : {}), ...(extra || {}) } });
  if (error) {
    // the function's own message (quota, missing key) is in the response body
    let msg = error.message;
    try { const ctx = (error as { context?: Response }).context; if (ctx) { const b = await ctx.json(); if (b?.error) msg = b.error; } } catch { /* keep message */ }
    throw new Error(msg);
  }
  return data as { model: string; receipt: unknown; usage: unknown };
}

/** Latest prices of Indonesian shares by ticker ("BBCA" → 5600), through the stock-price Edge Function. */
export async function stockPrices(codes: string[]): Promise<Record<string, number>> {
  const c = await sb();
  const { data, error } = await c.functions.invoke('stock-price', { body: { codes } });
  if (error) throw error;
  return ((data as { prices?: Record<string, number> })?.prices) ?? {};
}

/* ---------- partner: linked accounts and their inbox (see supabase/setup-partner.sql) ---------- */
export interface Link { id: string; from_id: string; from_email: string; from_name: string | null; to_email: string; to_id: string | null; to_name: string | null; status: 'pending' | 'active'; created_at: string }
export interface InboxRow { id: string; from_id: string; from_name: string | null; to_id: string; payload: unknown; status: 'new' | 'done' | 'declined'; created_at: string }

/** My invitations (sent and received) and links, with my own id and email. */
export async function partnerLinks(): Promise<{ me: string; email: string; links: Link[] }> {
  const c = await sb(), me = await userId(), email = (await currentEmail()) || '';
  const { data, error } = await c.from('links').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return { me, email, links: (data || []) as Link[] };
}
export async function invitePartner(toEmail: string, myName: string): Promise<void> {
  const c = await sb(), email = (await currentEmail()) || '';
  const { error } = await c.from('links').insert({ from_id: await userId(), from_email: email, from_name: myName || null, to_email: toEmail.trim().toLowerCase() });
  if (error) throw error;
}
export async function acceptPartner(id: string, myName: string): Promise<void> {
  const c = await sb();
  const { error } = await c.rpc('accept_link', { link: id, my_name: myName || null });
  if (error) throw error;
}
export async function removeLink(id: string): Promise<void> {
  const c = await sb();
  const { error } = await c.from('links').delete().eq('id', id);
  if (error) throw error;
}
/** Send my partner their part of a bill. */
export async function sendToPartner(toId: string, myName: string, payload: unknown): Promise<string> {
  const c = await sb();
  const { data, error } = await c.from('inbox').insert({ from_id: await userId(), from_name: myName || null, to_id: toId, payload }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
/** Items waiting for me, and the latest ones I sent (to show whether they were accepted). */
export async function inboxRows(): Promise<{ waiting: InboxRow[]; sent: InboxRow[] }> {
  const c = await sb(), me = await userId();
  const [a, b] = await Promise.all([
    c.from('inbox').select('*').eq('to_id', me).eq('status', 'new').order('created_at'),
    c.from('inbox').select('*').eq('from_id', me).order('created_at', { ascending: false }).limit(20),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  return { waiting: (a.data || []) as InboxRow[], sent: (b.data || []) as InboxRow[] };
}
export async function answerInbox(id: string, status: 'done' | 'declined'): Promise<void> {
  const c = await sb();
  const { error } = await c.from('inbox').update({ status }).eq('id', id);
  if (error) throw error;
}
