// PIN hashing and Face ID / Touch ID (WebAuthn platform authenticator) helpers.
// The PIN lock is a privacy screen for this device: it keeps others from opening the app,
// it does not encrypt the data stored in the browser.

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function newSalt(): string { return b64(rand(16)); }

/** PBKDF2-SHA256, 120k iterations: slow enough that guessing a 4–6 digit PIN from a copied database takes effort. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: 120_000, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}

/** Constant-time comparison of two hashes. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function bioAvailable(): Promise<boolean> {
  try { return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch { return false; }
}

/** Register Face ID / Touch ID for this app on this device. Returns the credential id. */
export async function bioRegister(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'Do it Dip' },
      user: { id: rand(16), name: 'do-it-dip', displayName: 'Do it Dip' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Face ID dibatalkan');
  return b64(cred.rawId);
}

/** Ask for Face ID / Touch ID. Resolves true when the device confirmed the owner. */
export async function bioVerify(id: string): Promise<boolean> {
  const res = await navigator.credentials.get({
    publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: unb64(id) }], userVerification: 'required', timeout: 60_000 },
  });
  return !!res;
}
