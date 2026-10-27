// AWS Signature V4 (header auth) for Bedrock + S3, using WebCrypto.

const te = new TextEncoder();

async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const bytes = typeof data === "string" ? te.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<Uint8Array> {
  const ck = await crypto.subtle.importKey("raw", key as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", ck, te.encode(msg)));
}

export interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: string;
}

// Canonical request path, mirroring botocore: S3 uses the path verbatim,
// every other service single-encodes each segment (e.g. Bedrock model IDs
// like `us.amazon.nova-micro-v1:0` canonicalize with `%3A`). The request
// line the client sends must be built from the same form, or the service
// computes a different signature.
export function canonicalPath(service: string, url: URL): string {
  const path = url.pathname || "/";
  if (service === "s3") return path;
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function amzDates(now = new Date()): { amzDate: string; dateStamp: string } {
  const p = (n: number): string => String(n).padStart(2, "0");
  const amzDate =
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`;
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export async function signRequest(
  creds: AwsCreds,
  method: string,
  url: string,
  headers: Record<string, string>,
  payload: string | ArrayBuffer,
): Promise<Record<string, string>> {
  const u = new URL(url);
  const { amzDate, dateStamp } = amzDates();
  const payloadHash = await sha256Hex(payload);

  const signed: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) signed[k.toLowerCase()] = v.trim();
  signed["host"] = u.host;
  signed["x-amz-date"] = amzDate;
  if (creds.sessionToken) signed["x-amz-security-token"] = creds.sessionToken;

  const signedHeaderNames = Object.keys(signed).sort();
  const canonicalHeaders = signedHeaderNames.map((k) => `${k}:${signed[k]}\n`).join("");
  const query = [...u.searchParams.entries()]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join("&");
  const canonicalRequest = [method.toUpperCase(), canonicalPath(creds.service, u), query, canonicalHeaders, signedHeaderNames.join(";"), payloadHash].join("\n");

  const scope = `${dateStamp}/${creds.region}/${creds.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

  const kDate = await hmac(te.encode(`AWS4${creds.secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, creds.region);
  const kService = await hmac(kRegion, creds.service);
  const kSigning = await hmac(kService, "aws4_request");
  const sigBytes = await hmac(kSigning, stringToSign);
  const signature = [...sigBytes].map((b) => b.toString(16).padStart(2, "0")).join("");

  return {
    ...signed,
    Authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`,
  };
}
