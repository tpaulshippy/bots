// Image pipeline — R2-backed port of back/bots/services/images.py.
//
// Django stored originals in S3 and served 1h presigned URLs. The Worker
// stores originals in the IMAGES R2 bucket and serves them through
// GET /api/media/:key?sig=... with an HMAC-signed, 7-day URL (chat history
// refetches fresh URLs per response, so expiry only bounds stale caches).
// Pillow thumbnailing has no Workers equivalent — originals are stored as-is
// under the same 20MB / extension gate.

import { b64urlEncode, verifyJwt } from "./crypto";
import { jwtSecret } from "./auth";
import type { Env } from "./types";

export const ALLOWED_PHOTO_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export function allowedFile(filename: string): boolean {
  const parts = (filename ?? "").split(".");
  if (parts.length < 2) return false;
  return ALLOWED_PHOTO_EXTENSIONS.includes(parts[parts.length - 1]!.toLowerCase());
}

export function extOf(filename: string): string {
  const parts = (filename ?? "").split(".");
  const ext = parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : "";
  if (ALLOWED_PHOTO_EXTENSIONS.includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  return "jpg";
}

// Stored bytes are images validated by extension at upload time; the served
// MIME type is derived from that validated extension, NEVER from the
// client-supplied Content-Type (which would let `x.png` + `type: text/html`
// store XSS on the API origin). Served with nosniff (see media route).
const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export async function storeUpload(env: Env, data: ArrayBuffer, filename: string): Promise<string> {
  const ext = extOf(filename);
  const key = `${crypto.randomUUID()}.${ext}`;
  await env.IMAGES.put(key, data, { httpMetadata: { contentType: EXT_MIME[ext] ?? "image/jpeg" } });
  return key;
}

const MEDIA_SIG_LIFETIME_S = 7 * 24 * 3600;

async function mediaSecret(env: Env): Promise<string> {
  return env.MEDIA_SIGNING_SECRET ?? jwtSecret(env);
}

export async function signMediaUrl(env: Env, key: string, baseUrl: string): Promise<string> {
  const { signJwt } = await import("./crypto");
  const now = Math.floor(Date.now() / 1000);
  const sig = await signJwt({ k: key, exp: now + MEDIA_SIG_LIFETIME_S, iat: now }, await mediaSecret(env));
  return `${baseUrl}/api/media/${encodeURIComponent(key)}?sig=${encodeURIComponent(sig)}`;
}

export async function verifyMediaSig(env: Env, key: string, sig: string): Promise<boolean> {
  const payload = await verifyJwt(sig, await mediaSecret(env));
  return !!payload && payload["k"] === key;
}

export async function getObjectBytes(env: Env, key: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  // Prefer R2 (new uploads). Fall back to legacy S3 for pre-cutover rows so
  // migrated chats keep their pictures without a bulk copy.
  const obj = await env.IMAGES.get(key);
  if (obj) {
    return {
      bytes: await obj.arrayBuffer(),
      contentType: obj.httpMetadata?.contentType ?? "image/jpeg",
    };
  }
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_STORAGE_BUCKET_NAME) {
    const { s3GetObject } = await import("./s3");
    try {
      return await s3GetObject(env, key);
    } catch {
      return null;
    }
  }
  return null;
}
