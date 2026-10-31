// Cryptography for the Worker port.
//
// JWTs are HS256 and claim-compatible with djangorestframework-simplejwt so
// tokens issued by Django keep working after cutover (and vice versa during
// a transition window), provided JWT_SECRET equals Django's SECRET_KEY.
//
// Passwords/PINs use Django's default pbkdf2_sha256$<iter>$<salt>$<b64> hash
// format so migrated hashes verify as-is. New hashes use the same format.

const te = new TextEncoder();

export function b64urlEncode(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === "string" ? te.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecodeToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlDecodeJson(s: string): Record<string, unknown> {
  const bytes = b64urlDecodeToBytes(s);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function hmacSha256(key: string, msg: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    te.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, te.encode(msg)));
}

export interface JwtClaims {
  [k: string]: unknown;
}

export async function signJwt(payload: JwtClaims, secret: string): Promise<string> {
  const header = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(await hmacSha256(secret, `${header}.${body}`));
  return `${header}.${body}.${sig}`;
}

// Returns the payload on success, null on bad signature/expiry/shape.
export async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const expected = b64urlEncode(await hmacSha256(secret, `${header}.${body}`));
  if (sig.length !== expected.length) return null;
  // Constant-time compare on the ASCII signature.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  let payload: Record<string, unknown>;
  try {
    payload = b64urlDecodeJson(body);
  } catch {
    return null;
  }
  if (typeof payload["exp"] === "number" && payload["exp"] * 1000 <= Date.now()) return null;
  return payload;
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64urlEncode(buf);
}

export function newUuid(): string {
  return crypto.randomUUID();
}

// --- Django password/PIN hashing (pbkdf2_sha256) ---------------------------

const DJANGO_HASH_RE = /^pbkdf2_(sha256|sha1)\$(\d+)\$([^$]+)\$(.+)$/;

async function pbkdf2(
  password: string,
  salt: string,
  iterations: number,
  hash: "SHA-256" | "SHA-1",
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  // Output length matches the hash: Django's pbkdf2_sha1 rows store 160-bit
  // digests, and verifying with 256 bits would never match.
  const length = hash === "SHA-256" ? 256 : 160;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash, salt: te.encode(salt), iterations },
    key,
    length,
  );
  return new Uint8Array(bits);
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// Thrown when the KDF itself fails (unsupported parameters, platform
// limits) as opposed to a clean password mismatch. Callers must surface
// this as a 500, never as an authentication failure: mapping it to `false`
// would turn an outage into silent 401s (and burn PIN attempts).
export class KdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KdfError";
  }
}
// Verifies a Django-format password/PIN hash. Unknown formats and clean
// mismatches -> false; KDF operational failures -> throws KdfError.
export async function verifyDjangoHash(password: string, encoded: string): Promise<boolean> {
  const m = DJANGO_HASH_RE.exec(encoded) as unknown as [string, string, string, string, string] | null;
  if (!m) return false;
  const [, algo, iterStr, salt, hashB64] = m;
  const iterations = parseInt(iterStr!, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  let derived: Uint8Array;
  try {
    derived = await pbkdf2(password, salt!, iterations, algo === "sha256" ? "SHA-256" : "SHA-1");
  } catch (e) {
    throw new KdfError(`PBKDF2 failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return constantTimeEqual(derived, b64ToBytes(hashB64!));
}

// New hashes use the same Django format. The default work factor stays at
// Django parity for compatibility; callers with cheap-hash policies (PINs —
// see pin.ts PIN_HASH_ITERATIONS) pass explicit iterations. Verification is
// iteration-agnostic: any Django-produced hash verifies regardless of count.
export async function makeDjangoHash(password: string, iterations = 720_000): Promise<string> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = bytesToB64(saltBytes).replace(/\+/g, "").replace(/\//g, "").replace(/=+$/, "").slice(0, 22) || "salt";
  const derived = await pbkdf2(password, salt, iterations, "SHA-256");
  return `pbkdf2_sha256$${iterations}$${salt}$${bytesToB64(derived)}`;
}
