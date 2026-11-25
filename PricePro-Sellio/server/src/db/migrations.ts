// Schema migrations. Every private table carries user_id with ON DELETE CASCADE,
// and every query in the services filters by the authenticated user's id.
export const migrations: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  avatar_key TEXT,
  email_verified_at TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro')),
  password_changed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,               -- sha256 of the session token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE email_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('verify','reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_email_tokens_user ON email_tokens(user_id, type);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','uz')),
  notify_inapp INTEGER NOT NULL DEFAULT 1,
  notify_email INTEGER NOT NULL DEFAULT 1,
  notify_generation INTEGER NOT NULL DEFAULT 1,
  notify_forecast INTEGER NOT NULL DEFAULT 1,
  notify_price INTEGER NOT NULL DEFAULT 1,
  notify_account INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('free','pro')),
  status TEXT NOT NULL,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE subscription_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  plan TEXT,
  amount_cents INTEGER,
  currency TEXT,
  provider_ref TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sub_events_user ON subscription_events(user_id, created_at);

CREATE TABLE processed_webhook_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('product','generated','avatar')),
  original_name TEXT,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_uploads_user ON uploads(user_id, kind, created_at);

CREATE TABLE generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  result_upload_id TEXT REFERENCES uploads(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  style TEXT NOT NULL,
  background TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','processing','succeeded','failed')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  error TEXT,
  retry_of TEXT REFERENCES generations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_generations_user ON generations(user_id, created_at);

CREATE TABLE sales_datasets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user_upload','sample')),
  points_count INTEGER NOT NULL,
  first_date TEXT NOT NULL,
  last_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_datasets_user ON sales_datasets(user_id, created_at);

CREATE TABLE sales_points (
  dataset_id TEXT NOT NULL REFERENCES sales_datasets(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  units REAL NOT NULL,
  PRIMARY KEY (dataset_id, date)
);

CREATE TABLE forecasts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dataset_id TEXT REFERENCES sales_datasets(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  market TEXT NOT NULL,
  region TEXT NOT NULL,
  period_days INTEGER NOT NULL,
  data_quality TEXT NOT NULL CHECK (data_quality IN ('user_historical','external_data','sample','insufficient')),
  model TEXT,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_forecasts_user ON forecasts(user_id, created_at);

CREATE TABLE price_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed','partial','failed','no_providers')),
  providers_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  offers_count INTEGER NOT NULL DEFAULT 0,
  best_price REAL,
  best_currency TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_price_searches_user ON price_searches(user_id, created_at);
CREATE INDEX idx_price_searches_query ON price_searches(normalized_query);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('advertisement','forecast','price_comparison')),
  ref_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, type, ref_id)
);
CREATE INDEX idx_projects_user ON projects(user_id, created_at);

CREATE TABLE favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('product','price_comparison','advertisement','forecast')),
  ref_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (user_id, item_type, ref_id)
);
CREATE INDEX idx_favorites_user ON favorites(user_id, created_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);

CREATE TABLE activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('studio','forecast','prices','account','projects','assistant')),
  ref_id TEXT,
  title TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_user ON activity(user_id, created_at);
CREATE INDEX idx_activity_user_type ON activity(user_id, type, created_at);

CREATE TABLE assistant_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  actions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_assistant_user ON assistant_messages(user_id, created_at);
`,
  },
  {
    // Email one-time codes for sign-in/sign-up, and the time resolution of sales datasets.
    version: 2,
    sql: `
CREATE TABLE login_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('login','signup','verify')),
  token_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sends INTEGER NOT NULL DEFAULT 1,
  last_sent_at TEXT NOT NULL,
  code_expires_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_login_challenges_user ON login_challenges(user_id, purpose);

ALTER TABLE sales_datasets ADD COLUMN granularity TEXT NOT NULL DEFAULT 'day' CHECK (granularity IN ('day','week','month'));
`,
  },
  {
    // World / country demand from Google Trends search interest.
    version: 3,
    sql: `
CREATE TABLE market_analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  range TEXT NOT NULL,
  geos_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed','no_data')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_market_user ON market_analyses(user_id, created_at);
`,
  },
  {
    // Russian UI language. SQLite cannot change a CHECK constraint, so the table is rebuilt.
    version: 4,
    sql: `
CREATE TABLE user_settings_new (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','uz','ru')),
  notify_inapp INTEGER NOT NULL DEFAULT 1,
  notify_email INTEGER NOT NULL DEFAULT 1,
  notify_generation INTEGER NOT NULL DEFAULT 1,
  notify_forecast INTEGER NOT NULL DEFAULT 1,
  notify_price INTEGER NOT NULL DEFAULT 1,
  notify_account INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
INSERT INTO user_settings_new (user_id, theme, language, notify_inapp, notify_email, notify_generation, notify_forecast, notify_price, notify_account, updated_at)
  SELECT user_id, theme, language, notify_inapp, notify_email, notify_generation, notify_forecast, notify_price, notify_account, updated_at FROM user_settings;
DROP TABLE user_settings;
ALTER TABLE user_settings_new RENAME TO user_settings;
`,
  },
  {
    // Shared cache for the "top demand now" watchlist (not user data).
    version: 5,
    sql: `
CREATE TABLE trend_cache (
  key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`,
  },
];
