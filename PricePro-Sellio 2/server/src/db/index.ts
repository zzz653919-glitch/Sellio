/**
 * Database access. Two drivers behind one async API:
 *  - Turso / libSQL (`TURSO_DATABASE_URL`): used on Vercel and other serverless hosts,
 *    where the local filesystem is not persistent. SQLite-compatible, so the schema and
 *    queries are the same.
 *  - Built-in node:sqlite file (`DATABASE_PATH`): local development, tests and single servers.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { migrations } from "./migrations.js";

export type Row = Record<string, unknown>;
type Param = string | number | bigint | null | Uint8Array;
export type Statement = [sql: string, ...params: Param[]];

interface Driver {
  all(sql: string, params: Param[]): Promise<Row[]>;
  run(sql: string, params: Param[]): Promise<{ changes: number }>;
  /** Run write statements atomically. */
  batch(stmts: Statement[]): Promise<void>;
  /** Run a multi-statement script atomically, together with extra statements. */
  script(sql: string, extra: Statement[]): Promise<void>;
  close(): Promise<void>;
}

async function nodeSqliteDriver(file: string): Promise<Driver> {
  const { DatabaseSync } = await import("node:sqlite");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  // node:sqlite is synchronous, so BEGIN..COMMIT below cannot interleave with other queries.
  const atomic = (fn: () => void) => {
    db.exec("BEGIN");
    try {
      fn();
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
  return {
    all: async (sql, params) => db.prepare(sql).all(...params) as Row[],
    run: async (sql, params) => ({ changes: Number(db.prepare(sql).run(...params).changes) }),
    batch: async (stmts) => atomic(() => { for (const [sql, ...p] of stmts) db.prepare(sql).run(...p); }),
    script: async (sql, extra) => atomic(() => {
      db.exec(sql);
      for (const [s, ...p] of extra) db.prepare(s).run(...p);
    }),
    close: async () => db.close(),
  };
}

/** Split a migration script into statements (our migrations contain no `;` inside literals). */
const splitSql = (sql: string) => sql.split(";").map((s) => s.trim()).filter(Boolean);

async function libsqlDriver(url: string, authToken?: string): Promise<Driver> {
  // Remote Turso URLs use the pure-JS HTTP client (no native binary needed on Vercel);
  // `file:` URLs (local libSQL files, used in tests) need the full Node client.
  const { createClient } = url.startsWith("file:") ? await import("@libsql/client") : await import("@libsql/client/http");
  const client = createClient({ url, authToken, intMode: "number" });
  await client.execute("PRAGMA foreign_keys = ON");
  const toRows = (rs: { columns: string[]; rows: ArrayLike<unknown>[] }) =>
    rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, (r as unknown[])[i]])) as Row);
  const args = (p: Param[]) => p.map((v) => (typeof v === "bigint" ? Number(v) : v)) as (string | number | null | Uint8Array)[];
  return {
    all: async (sql, params) => toRows(await client.execute({ sql, args: args(params) })),
    run: async (sql, params) => ({ changes: (await client.execute({ sql, args: args(params) })).rowsAffected }),
    batch: async (stmts) => {
      await client.batch(stmts.map(([sql, ...p]) => ({ sql, args: args(p) })), "write");
    },
    script: async (sql, extra) => {
      await client.batch([...splitSql(sql), ...extra.map(([s, ...p]) => ({ sql: s, args: args(p) }))], "write");
    },
    close: async () => client.close(),
  };
}

let ready: Promise<Driver> | null = null;

/** Open the database once per process (or serverless instance) and apply pending migrations. */
export function getDb(): Promise<Driver> {
  ready ??= (async () => {
    if (process.env.VERCEL && !config.TURSO_DATABASE_URL) {
      throw new Error("TURSO_DATABASE_URL is not set. On Vercel the filesystem is not persistent, so Vendora needs a Turso database (see README → Deploy to Vercel).");
    }
    const driver = config.TURSO_DATABASE_URL
      ? await libsqlDriver(config.TURSO_DATABASE_URL, config.TURSO_AUTH_TOKEN)
      : await nodeSqliteDriver(config.DATABASE_PATH);
    await migrate(driver);
    return driver;
  })().catch((err) => {
    ready = null; // allow a retry on the next request
    throw err;
  });
  return ready;
}

async function migrate(d: Driver) {
  await d.run("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)", []);
  const appliedNow = async () => new Set((await d.all("SELECT version FROM schema_migrations", [])).map((r) => Number(r.version)));
  let applied = await appliedNow();
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    try {
      await d.script(m.sql, [["INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", m.version, new Date().toISOString()]]);
    } catch (err) {
      // Another serverless instance may have applied it at the same moment.
      applied = await appliedNow();
      if (!applied.has(m.version)) throw err;
    }
  }
}

let queries = 0;
/** Number of database round trips so far (used by tests to catch N+1 query patterns). */
export const queryCount = () => queries;

export async function all<T = Row>(sql: string, ...params: Param[]): Promise<T[]> {
  queries++;
  return (await (await getDb()).all(sql, params)) as T[];
}

export async function get<T = Row>(sql: string, ...params: Param[]): Promise<T | undefined> {
  queries++;
  return (await (await getDb()).all(sql, params))[0] as T | undefined;
}

export async function run(sql: string, ...params: Param[]): Promise<{ changes: number }> {
  queries++;
  return (await getDb()).run(sql, params);
}

/** Execute write statements atomically (all or nothing). */
export async function transaction(stmts: Statement[]): Promise<void> {
  queries++;
  await (await getDb()).batch(stmts);
}

export async function closeDb() {
  if (!ready) return;
  const d = await ready.catch(() => null);
  ready = null;
  await d?.close();
}
