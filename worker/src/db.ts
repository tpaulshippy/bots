// Minimal D1 helpers. D1 speaks SQLite; rows come back with INTEGER 0/1 for
// booleans and TEXT for datetimes/JSON — callers convert to API shapes.

export type D1 = D1Database;

export async function first<T>(db: D1, sql: string, ...params: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...params).first()) as T | null;
}

export async function all<T>(db: D1, sql: string, ...params: unknown[]): Promise<T[]> {
  const res = await db.prepare(sql).bind(...params).all();
  return (res.results ?? []) as T[];
}

export async function run(db: D1, sql: string, ...params: unknown[]): Promise<D1Result> {
  return await db.prepare(sql).bind(...params).run();
}

export async function count(db: D1, sql: string, ...params: unknown[]): Promise<number> {
  const row = await first<{ n: number }>(db, sql, ...params);
  return row?.n ?? 0;
}


export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const UUID_HEX_RE = /^[0-9a-f]{32}$/i;
export const isUuid = (v: string): boolean => UUID_RE.test(v) || UUID_HEX_RE.test(v);

const stripDashes = (v: string): string => v.replace(/-/g, "").toLowerCase();
const addDashes = (hex: string): string =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

// Django stores UUIDs as undashed hex (char(32)) while the API speaks
// canonical dashed form — and migrated rows keep whichever form they had.
// Match both spellings so pre-cutover rows stay reachable.
export function uuidForms(raw: string): [string, string] | null {
  const lowered = raw.toLowerCase();
  if (UUID_HEX_RE.test(lowered)) return [addDashes(lowered), lowered];
  if (UUID_RE.test(lowered)) return [lowered, stripDashes(lowered)];
  return null;
}

// WHERE fragment matching a uuid column in either stored spelling.
// Returns null when raw is not UUID-shaped (callers 400 in that case,
// mirroring Django's UUID() parse failure).
export function uuidMatch(col: string, raw: string): { sql: string; params: [string, string] } | null {
  const forms = uuidForms(raw);
  if (!forms) return null;
  return { sql: `(${col} = ? OR ${col} = ?)`, params: forms };
}

export interface Page {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
}

export function pageParams(searchParams: URLSearchParams, defaultSize = 50): Page {
  const raw = parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(raw) && raw > 0 ? raw : 1;
  return { page, pageSize: defaultSize, limit: defaultSize, offset: (page - 1) * defaultSize };
}

// DRF PageNumberPagination parity for `?page=`:
// - missing/invalid handled by callers via resolvePage() returning null
//   (404 {"detail": "Invalid page."}, like DRF), except page 1 of an empty
//   list which stays 200;
// - "last" serves the final page (DRF's page=last);
// - out-of-range numbers 404 (DRF EmptyPage).
export function resolvePage(searchParams: URLSearchParams, total: number, defaultSize = 50): Page | null {
  const raw = searchParams.get("page");
  if (raw !== null && raw !== "last" && (!/^\d+$/.test(raw.trim()) || parseInt(raw, 10) < 1)) return null;
  const pages = Math.max(1, Math.ceil(total / defaultSize));
  if (raw === "last") {
    return { page: pages, pageSize: defaultSize, limit: defaultSize, offset: (pages - 1) * defaultSize };
  }
  const page = raw === null ? 1 : parseInt(raw, 10);
  if (page > pages && !(page === 1 && total === 0)) return null;
  return { page, pageSize: defaultSize, limit: defaultSize, offset: (page - 1) * defaultSize };
}

// DRF PageNumberPagination shape.
export function paginated<T>(baseUrl: string, searchParams: URLSearchParams, p: Page, total: number, results: T[]) {
  const mk = (pg: number): string | null => {
    if (pg < 1) return null;
    const sp = new URLSearchParams(searchParams);
    sp.set("page", String(pg));
    return `${baseUrl}?${sp.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / p.pageSize));
  return {
    count: total,
    next: p.page < pages ? mk(p.page + 1) : null,
    previous: p.page > 1 ? mk(p.page - 1) : null,
    results,
  };
}

export const toBool = (v: number | null | undefined): boolean => (v ?? 0) === 1;
export const fromBool = (v: boolean): number => (v ? 1 : 0);

export function parseJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
