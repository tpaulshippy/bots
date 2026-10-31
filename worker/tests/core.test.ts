import { describe, expect, it } from "vitest";
import { applySm2, isRating } from "../src/srs";
import { htmlToText, isSingleFileHtml, validateHtmlDoc } from "../src/html";
import { makeDjangoHash, signJwt, verifyDjangoHash, verifyJwt } from "../src/crypto";
import { canonicalPath } from "../src/sigv4";
import { hashPin, PIN_HASH_ITERATIONS, validatePin, verifyPin } from "../src/pin";

describe("sm2", () => {
  const fresh = { interval_days: 0, ease: 2.5, reps: 0, lapses: 0 };
  const now = new Date("2026-01-01T00:00:00Z");

  it("again resets reps and schedules ~4h", () => {
    const r = applySm2({ ...fresh, interval_days: 6, reps: 3 }, "again", now);
    expect(r.reps).toBe(0);
    expect(r.lapses).toBe(1);
    expect(r.interval_days).toBeCloseTo(1 / 6);
  });

  it("good progresses 0 -> 1 -> 6 days", () => {
    const first = applySm2(fresh, "good", now);
    expect(first.interval_days).toBe(1);
    const second = applySm2({ ...fresh, interval_days: 1, ease: 2.5, reps: 1 }, "good", now);
    expect(second.interval_days).toBe(6);
  });

  it("easy multiplies every step by the bonus (new cards: 1.3 days)", () => {
    const first = applySm2(fresh, "easy", now);
    expect(first.interval_days).toBeCloseTo(1.3);
    expect(first.reps).toBe(1);
  });

  it("good after a lapse restarts at 1 day (reps reset)", () => {
    const lapsed = applySm2(fresh, "again", now);
    expect(lapsed.reps).toBe(0);
    const next = applySm2({ ...fresh, interval_days: lapsed.interval_days, ease: lapsed.ease, reps: 0, lapses: 1 }, "good", now);
    expect(next.interval_days).toBe(1);
  });

  it("floors ease at 1.3", () => {
    const r = applySm2({ ...fresh, ease: 1.35 }, "again", now);
    expect(r.ease).toBe(1.3);
  });

  it("validates ratings", () => {
    expect(isRating("easy")).toBe(true);
    expect(isRating("bogus")).toBe(false);
  });
});

describe("html validation", () => {
  const good = "<html><head><title>t</title><style>p{}</style></head><body><p>hi</p></body></html>";

  it("accepts single-file pages", () => {
    expect(isSingleFileHtml(good)).toBe(true);
    expect(validateHtmlDoc(good)).toEqual({ ok: true, html: good });
  });

  it("rejects remote resources", () => {
    expect(isSingleFileHtml('<html><body><img src="https://evil/x.png"></body></html>')).toBe(false);
    expect(isSingleFileHtml('<html><body><a href="/local">x</a></body></html>')).toBe(true);
  });

  it("allows data: images and fragment links", () => {
    expect(isSingleFileHtml('<html><body><img src="data:image/png;base64,AAA"><a href="#s">x</a></body></html>')).toBe(true);
    expect(isSingleFileHtml('<html><body><img src="data:text/html;base64,AAA"></body></html>')).toBe(false);
  });

  it("requires a closing tag (rejects truncated drafts)", () => {
    expect(isSingleFileHtml("<html><body><p>half")).toBe(false);
  });

  it("decodes entities before safety checks", () => {
    expect(htmlToText("<p>p&#111;rn</p>")).toContain("porn");
  });
});

describe("sigv4 canonical paths (botocore-compatible)", () => {
  it("single-encodes non-S3 paths, leaves S3 verbatim", () => {
    expect(
      canonicalPath("bedrock", new URL("https://bedrock-runtime.us-east-1.amazonaws.com/model/us.amazon.nova-micro-v1:0/converse")),
    ).toBe("/model/us.amazon.nova-micro-v1%3A0/converse");
    expect(canonicalPath("s3", new URL("https://b.s3.us-east-1.amazonaws.com/k/a%20b"))).toBe("/k/a%20b");
  });
});

describe("pin hashing policy", () => {
  it("new PIN hashes are cheap (free-plan CPU budget) and verify", async () => {
    expect(validatePin("1234")).toBe(true);
    expect(validatePin("123")).toBe(false);
    const h = await hashPin("1234");
    const iterations = parseInt(h.split("$")[1]!, 10);
    expect(iterations).toBe(PIN_HASH_ITERATIONS);
    expect(iterations).toBeLessThanOrEqual(10000);
    expect(await verifyPin(h, "1234")).toBe(true);
    expect(await verifyPin(h, "0000")).toBe(false);
  });

  it("legacy Django-grade hashes still verify (iteration-agnostic)", async () => {
    const legacy = await makeDjangoHash("1234", 100_000);
    expect(await verifyPin(legacy, "1234")).toBe(true);
    expect(await verifyPin(legacy, "0000")).toBe(false);
  });
});

describe("crypto", () => {
  it("round-trips Django password hashes", async () => {
    const h = await makeDjangoHash("secret123", 1000);
    expect(h.startsWith("pbkdf2_sha256$1000$")).toBe(true);
    expect(await verifyDjangoHash("secret123", h)).toBe(true);
    expect(await verifyDjangoHash("wrong", h)).toBe(false);
    expect(await verifyDjangoHash("x", "argon2$...")).toBe(false);
  });

  it("verifies a real Django-produced hash (not self-made)", async () => {
    // Genuinely Django-produced: back/db.sqlite3 auth_user row, created by
    // Django's make_password (pbkdf2_sha256, 1.2M iterations). Password is
    // the e2e fixture password "testpassword123". ~200ms — run sparingly.
    const djangoHash =
      "pbkdf2_sha256$1200000$B02FcbPHicybZgT9IgqJZe$3WnNR9TKbksH/V+qghsPBloGalm9t+pdY2LVKjnnChI=";
    expect(await verifyDjangoHash("testpassword123", djangoHash)).toBe(true);
    expect(await verifyDjangoHash("wrong password", djangoHash)).toBe(false);
  });

  it("round-trips JWTs and honors expiry", async () => {
    const good = await signJwt({ user_id: 1, exp: Math.floor(Date.now() / 1000) + 60 }, "s");
    const payload = await verifyJwt(good, "s");
    expect(payload?.["user_id"]).toBe(1);
    expect(await verifyJwt(good, "other")).toBeNull();
    const expired = await signJwt({ user_id: 1, exp: 1 }, "s");
    expect(await verifyJwt(expired, "s")).toBeNull();
  });

  it("verifies externally minted HS256 tokens (Django-compat fixture)", async () => {
    // Minted with Python stdlib hmac (independent of this signer):
    // {"token_type":"access","user_id":7,"iat":1893456000,"exp":1893459600,
    //  "jti":"550e8400-e29b-41d4-a716-446655440000"}, secret "fixture-...".
    const djangoStyle =
      "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJ0b2tlbl90eXBlIjogImFjY2VzcyIsICJ1c2VyX2lkIjogNywgImlhdCI6IDE4OTM0NTYwMDAsICJleHAiOiAxODkzNDU5NjAwLCAianRpIjogIjU1MGU4NDAwLWUyOWItNDFkNC1hNzE2LTQ0NjY1NTQ0MDAwMCJ9.2f6OtaWOeULg7eq1mF9mmzn5O1hODmmyWmA4266gPCk";
    const payload = await verifyJwt(djangoStyle, "fixture-secret-for-django-compat-test");
    expect(payload?.["user_id"]).toBe(7);
    expect(payload?.["token_type"]).toBe("access");
    expect(payload?.["exp"]).toBe(1893459600);
    // Wrong secret must fail even for a well-formed external token.
    expect(await verifyJwt(djangoStyle, "wrong-secret")).toBeNull();
  });
});
