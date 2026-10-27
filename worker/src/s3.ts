// Legacy S3 reads for pre-cutover image rows (keys copied lazily or via the
// documented S3->R2 sync). Uses SigV4 header auth.
import { signRequest } from "./sigv4";
import type { Env } from "./types";

// SHA-256 of the empty string: S3 requires the payload checksum header on
// SigV4-signed GETs (without it, requests can be rejected).
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export async function s3GetObject(env: Env, key: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const region = env.AWS_REGION ?? "us-east-1";
  const bucket = env.AWS_STORAGE_BUCKET_NAME!;
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`;
  const headers = await signRequest(
    { accessKeyId: env.AWS_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SECRET_ACCESS_KEY!, region, service: "s3" },
    "GET",
    url,
    { "x-amz-content-sha256": EMPTY_SHA256 },
    "",
  );
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`s3 GET ${resp.status}`);
  return { bytes: await resp.arrayBuffer(), contentType: resp.headers.get("content-type") ?? "image/jpeg" };
}
