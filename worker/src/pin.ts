// Parent PIN lifecycle — port of back/bots/services/parent_reauth.py.

import { makeDjangoHash, verifyDjangoHash } from "./crypto";
import { first, run } from "./db";

export const MAX_PIN_FAILURES = 5;
export const PIN_LOCKOUT_MINUTES = 15;

// PIN hashes deliberately use a LOW work factor. Rationale: a 4–8 digit PIN
// has at most 10^8 candidates, so no iteration count survives an offline
// attack after a database breach anyway. The real control is server-side
// lockout (5 attempts → 15-minute lock), which caps online guessing no
// matter how fast the hash is. Keeping verification sub-millisecond also
// keeps login/PIN flows inside the Cloudflare free plan's 10ms CPU budget —
// a Django-grade 720k+ iteration hash costs ~200ms and would force paid.
// Legacy high-iteration hashes (pre-cutover Django rows) still verify via
// verifyDjangoHash, which honors the stored count; holders should clear an
// unused PIN before cutover (Settings → remove PIN).
export const PIN_HASH_ITERATIONS = 1_000;

export function validatePin(pin: unknown): pin is string {
  return typeof pin === "string" && /^[0-9]{4,8}$/.test(pin);
}

export const hashPin = (pin: string): Promise<string> => makeDjangoHash(pin, PIN_HASH_ITERATIONS);
export const verifyPin = (hash: string, pin: string): Promise<boolean> => verifyDjangoHash(pin, hash);

export interface PinAccount {
  pin_hash: string | null;
  pin_failed_attempts: number;
  pin_locked_until: string | null;
}

export function isPinLocked(acct: PinAccount, nowMs = Date.now()): boolean {
  if (!acct.pin_locked_until) return false;
  return new Date(acct.pin_locked_until).getTime() > nowMs;
}

export function remainingAttempts(acct: PinAccount): number {
  return Math.max(0, MAX_PIN_FAILURES - (acct.pin_failed_attempts ?? 0));
}

export async function getPinAccount(db: D1Database, userId: number): Promise<PinAccount | null> {
  return await first<PinAccount>(
    db,
    "SELECT pin_hash, pin_failed_attempts, pin_locked_until FROM bots_useraccount WHERE user_id = ?",
    userId,
  );
}

export async function registerPinFailure(db: D1Database, userId: number): Promise<PinAccount> {
  const acct = (await getPinAccount(db, userId))!;
  const attempts = (acct.pin_failed_attempts ?? 0) + 1;
  const locked = attempts >= MAX_PIN_FAILURES
    ? new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60_000).toISOString()
    : acct.pin_locked_until;
  await run(
    db,
    "UPDATE bots_useraccount SET pin_failed_attempts = ?, pin_locked_until = ? WHERE user_id = ?",
    attempts,
    locked,
    userId,
  );
  return { ...acct, pin_failed_attempts: attempts, pin_locked_until: locked };
}

export async function resetPinFailures(db: D1Database, userId: number): Promise<void> {
  await run(
    db,
    "UPDATE bots_useraccount SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE user_id = ?",
    userId,
  );
}

export async function setPinHash(db: D1Database, userId: number, hash: string | null): Promise<void> {
  await run(db, "UPDATE bots_useraccount SET pin_hash = ? WHERE user_id = ?", hash, userId);
  await resetPinFailures(db, userId);
}
