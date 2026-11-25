import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Must be imported before any application module so config sees the test environment.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pricepro-test-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
// TEST_LIBSQL=1 runs the whole suite through the Turso/libSQL driver (against a local libSQL file).
if (process.env.TEST_LIBSQL === "1") process.env.TURSO_DATABASE_URL = `file:${path.join(dir, "libsql.db")}`;
else delete process.env.TURSO_DATABASE_URL;
process.env.STORAGE_DIR = path.join(dir, "storage");
process.env.APP_URL = "http://localhost:5173";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
for (const k of ["BLOB_READ_WRITE_TOKEN", "OPENAI_API_KEY", "SERPAPI_API_KEY", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "ANTHROPIC_API_KEY", "STRIPE_SECRET_KEY", "SMTP_HOST"]) {
  delete process.env[k];
}

