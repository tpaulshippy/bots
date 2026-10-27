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
