import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrations } from "../src/db/migrations.js";

/** Upgrading an existing database (v9) to the Max plan schema keeps every user's plan and all related rows. */
test("migration v10 keeps plans and data when adding the Max plan", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const m of migrations.filter((x) => x.version < 10)) db.exec(m.sql);
  const fill = (table: string, values: Record<string, string | number>) => {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number; dflt_value: unknown; pk: number }[])
      .filter((c) => values[c.name] !== undefined || (c.notnull && c.dflt_value === null));
    const v = cols.map((c) => values[c.name] ?? "x");
    db.prepare(`INSERT INTO ${table} (${cols.map((c) => c.name).join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...v);
  };
  fill("users", { id: "u1", email: "a@x.uz", plan: "pro" });
  fill("users", { id: "u2", email: "b@x.uz", plan: "free" });
  fill("subscriptions", { user_id: "u1", plan: "pro", status: "active" });
  fill("notifications", { id: "n1", user_id: "u1" });
  db.exec(migrations.find((x) => x.version === 10)!.sql);
  assert.deepEqual(db.prepare("SELECT id, plan FROM users ORDER BY id").all().map((r) => ({ ...r })), [{ id: "u1", plan: "pro" }, { id: "u2", plan: "free" }]);
  assert.equal((db.prepare("SELECT plan FROM subscriptions WHERE user_id = 'u1'").get() as { plan: string }).plan, "pro");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM notifications").get() as { n: number }).n, 1);
  db.exec("UPDATE users SET plan = 'max' WHERE id = 'u2'");
  assert.throws(() => db.exec("UPDATE users SET plan = 'gold' WHERE id = 'u2'"), /CHECK/);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
});
