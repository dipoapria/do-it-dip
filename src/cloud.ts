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
  if (/relation .*backups|does not exist|42P01|PGRST205/i.test(m)) return 'Tabel cadangan belum dibuat di Supabase (jalankan supabase/setup.sql).';
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
