// D1-compatible shim over node:sqlite for worker tests.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// node:sqlite is experimental in Node 22: load it via require so the Vite
// transform pipeline leaves the builtin specifier alone.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

export function makeTestDb(): D1Database {
  const here = dirname(fileURLToPath(import.meta.url));
  const schema = readFileSync(join(here, "..", "migrations", "0001_initial.sql"), "utf8");
  // node:sqlite exec() runs one statement at a time; split the migration.
  const db = new DatabaseSync(":memory:");
  for (const stmt of schema.split(/;\s*\n/)) {
    const trimmed = stmt.trim();
    if (trimmed) db.exec(trimmed);
  }

  const wrapStmt = (prepared: {
    get: (...p: unknown[]) => unknown;
    all: (...p: unknown[]) => unknown[];
    run: (...p: unknown[]) => { lastInsertRowid: number | bigint; changes: number | bigint };
  }) => {
    const bound = (...params: unknown[]) => ({
      async first() {
        return (prepared.get(...params) as Record<string, unknown> | undefined) ?? null;
      },
      async all() {
        return { results: (prepared.all(...params) as Record<string, unknown>[]), success: true, meta: {} };
      },
      async run() {
        const r = prepared.run(...params);
        return {
          success: true,
          meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) },
        };
      },
    });
    return {
      bind(...params: unknown[]) {
        return bound(...params);
      },
      // Real D1 prepared statements also run unbound.
      async first() {
        return bound().first();
      },
      async all() {
        return bound().all();
      },
      async run() {
        return bound().run();
      },
    };
  };

  return {
    prepare(stmt: string) {
      return wrapStmt(db.prepare(stmt) as never);
    },
    async batch(stmts: D1PreparedStatement[]) {
      const out: D1Result[] = [];
      for (const s of stmts) out.push((await (s as unknown as { run: () => Promise<D1Result> }).run()));
      return out;
    },
  } as unknown as D1Database;
}

export function fakeR2(): R2Bucket {
  const store = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
  return {
    async get(key: string) {
      const hit = store.get(key);
      if (!hit) return null;
      return {
        arrayBuffer: async () => hit.bytes,
        body: null,
        httpMetadata: { contentType: hit.contentType },
      };
    },
    async put(key: string, value: ArrayBuffer | string, opts?: { httpMetadata?: { contentType?: string } }) {
      const bytes = typeof value === "string" ? new TextEncoder().encode(value).buffer as ArrayBuffer : value;
      store.set(key, { bytes, contentType: opts?.httpMetadata?.contentType ?? "application/octet-stream" });
    },
  } as unknown as R2Bucket;
}

export function testEnv(db: D1Database, extra?: Record<string, string>): Record<string, unknown> {
  return {
    DB: db,
    IMAGES: fakeR2(),
    JWT_SECRET: "test-secret-key-for-development-only",
    APP_DEEP_URL: "syftlearning://login",
    WEB_APP_LOGIN_URL: "https://example.com/app/login",
    AWS_REGION: "us-east-1",
    ALLOW_E2E_FAKE_STREAM: "true",
    ...(extra ?? {}),
  };
}
