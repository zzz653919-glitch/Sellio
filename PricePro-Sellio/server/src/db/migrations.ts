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
  {
    // Market Intelligence: competitors, the user's own business data, reports and the AI advisor.
    version: 6,
    sql: `
CREATE TABLE competitors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  category TEXT,
  price_note TEXT,
  positioning TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_competitors_user ON competitors(user_id, created_at);

CREATE TABLE business_datasets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('csv','xlsx','manual')),
  currency TEXT NOT NULL DEFAULT 'UZS',
  rows_json TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  period_start TEXT,
  period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_business_datasets_user ON business_datasets(user_id, created_at);

CREATE TABLE business_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('week','month')),
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_business_reports_user ON business_reports(user_id, created_at);

CREATE TABLE advisor_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_advisor_user ON advisor_messages(user_id, created_at);
`,
  },
  {
    // Advertising & Design Studio: brand kit, ad copy, competitor ads, campaigns and their results.
    version: 7,
    sql: `
CREATE TABLE brand_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT,
  slogan TEXT,
  logo_upload_id TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  accent_color TEXT,
  heading_font TEXT,
  body_font TEXT,
  tone TEXT,
  styles_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ai_requests_user ON ai_requests(user_id, created_at);

CREATE TABLE ad_copies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  language TEXT NOT NULL,
  input_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ad_copies_user ON ad_copies(user_id, created_at);

CREATE TABLE competitor_ads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  ad_text TEXT,
  had_image INTEGER NOT NULL DEFAULT 0,
  analysis_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_competitor_ads_user ON competitor_ads(user_id, created_at);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  product TEXT,
  audience TEXT,
  budget REAL,
  currency TEXT NOT NULL DEFAULT 'UZS',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  channels_json TEXT NOT NULL,
  plan_json TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','finished')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_campaigns_user ON campaigns(user_id, created_at);

CREATE TABLE campaign_items (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_campaign_items ON campaign_items(campaign_id, date);

CREATE TABLE campaign_stats (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  creative TEXT NOT NULL,
  channel TEXT,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  spend REAL NOT NULL DEFAULT 0,
  revenue REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_campaign_stats ON campaign_stats(campaign_id, date);
`,
  },
  {
    // Growth workflow: one opportunity followed through explanation, ads, campaign and results.
    version: 8,
    sql: `
CREATE TABLE initiatives (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  query TEXT,
  source TEXT NOT NULL CHECK (source IN ('opportunity','forecast','manual')),
  evidence_json TEXT,
  explanation TEXT,
  directions_json TEXT,
  direction_json TEXT,
  campaign_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_initiatives_user ON initiatives(user_id, updated_at);

CREATE TABLE initiative_assets (
  id TEXT PRIMARY KEY,
  initiative_id TEXT NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('banner','copy')),
  ref_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_initiative_assets ON initiative_assets(initiative_id);
`,
  },
  {
    // Admin panel: roles, account status, audit and login logs, settings, support, announcements, API usage.
    version: 9,
    sql: `
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended'));
ALTER TABLE users ADD COLUMN suspended_reason TEXT;
ALTER TABLE users ADD COLUMN plan_source TEXT;
ALTER TABLE sessions ADD COLUMN admin_mfa_at TEXT;
ALTER TABLE notifications ADD COLUMN announcement_id TEXT;

CREATE TABLE admin_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin','admin','moderator')),
  totp_secret TEXT,
  totp_enabled_at TEXT,
  granted_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  summary TEXT NOT NULL,
  details_json TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_admin ON audit_logs(admin_id, created_at);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  user_id TEXT,
  success INTEGER NOT NULL,
  reason TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_login_attempts_created ON login_attempts(created_at);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);

CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved')),
  assigned_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL
);
CREATE INDEX idx_support_user ON support_tickets(user_id, updated_at);
CREATE INDEX idx_support_status ON support_tickets(status, updated_at);

CREATE TABLE support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id TEXT,
  author_role TEXT NOT NULL CHECK (author_role IN ('user','staff')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_support_messages ON support_messages(ticket_id, created_at);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  audience TEXT NOT NULL CHECK (audience IN ('all','selected')),
  user_ids_json TEXT NOT NULL DEFAULT '[]',
  publish_at TEXT NOT NULL,
  delivered_at TEXT,
  recipients INTEGER,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_announcements_due ON announcements(delivered_at, publish_at);

CREATE TABLE user_flags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  flagged_by TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE INDEX idx_user_flags_open ON user_flags(resolved_at, created_at);

CREATE TABLE api_calls (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  ok INTEGER NOT NULL,
  status INTEGER,
  duration_ms INTEGER,
  error TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_api_calls_created ON api_calls(created_at);
CREATE INDEX idx_api_calls_provider ON api_calls(provider, created_at);
`,
  },
  {
    // Max plan: allow 'max' in users.plan and subscriptions.plan (SQLite cannot change a CHECK in place,
    // so the column is renamed, re-added with the new CHECK, copied and the old one dropped). Billing interval for yearly plans.
    version: 10,
    sql: `
ALTER TABLE users RENAME COLUMN plan TO plan_legacy;
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','max'));
UPDATE users SET plan = plan_legacy;
ALTER TABLE users DROP COLUMN plan_legacy;

ALTER TABLE subscriptions RENAME COLUMN plan TO plan_legacy;
ALTER TABLE subscriptions ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','max'));
UPDATE subscriptions SET plan = plan_legacy;
ALTER TABLE subscriptions DROP COLUMN plan_legacy;
ALTER TABLE subscriptions ADD COLUMN billing_interval TEXT;
`,
  },
  {
    // The AI Advisor was removed from the product: drop its chat history and its activity log lines.
    version: 11,
    sql: `
DROP INDEX IF EXISTS idx_advisor_user;
DROP TABLE IF EXISTS advisor_messages;
DELETE FROM activity WHERE service = 'assistant' AND title LIKE 'Advisor: %';
`,
  },
  {
    // Request limits: every AI advertisement and demand forecast is tracked here (reserve → consume / release),
    // and each user can set the time zone used for daily and monthly resets.
    version: 12,
    sql: `
CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL CHECK (service IN ('generation','forecast')),
  ref_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved','consumed')),
  plan TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('day','month')),
  period_start TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_usage_ref ON usage_events(service, ref_id);
CREATE INDEX idx_usage_user ON usage_events(user_id, created_at);
CREATE INDEX idx_usage_created ON usage_events(created_at);
ALTER TABLE user_settings ADD COLUMN timezone TEXT;
`,
  },
  {
    // Manual card payments: a user pays by bank transfer, uploads the receipt, an administrator approves or rejects.
    // A paid plan is activated only by an approval. At most one open request per user.
    version: 13,
    sql: `
CREATE TABLE payment_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('pro','max')),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month','year')),
  amount_usd REAL NOT NULL,
  amount_uzs INTEGER NOT NULL,
  card_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','cancelled')),
  receipt_key TEXT,
  receipt_mime TEXT,
  receipt_name TEXT,
  receipt_size INTEGER,
  submitted_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  reject_reason TEXT,
  period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_payment_open ON payment_requests(user_id) WHERE status = 'pending';
CREATE INDEX idx_payment_user ON payment_requests(user_id, created_at);
CREATE INDEX idx_payment_status ON payment_requests(status, submitted_at);
`,
  },
  {
    // Ad template studio: templates a user marked as favourite.
    version: 14,
    sql: `
CREATE TABLE template_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, template_id)
);
`,
  },
  {
    // "My Business" (sales data uploads and weekly/monthly reports) was removed from the product.
    version: 15,
    sql: `
DROP TABLE IF EXISTS business_reports;
DROP TABLE IF EXISTS business_datasets;
DELETE FROM activity WHERE service = 'business';
`,
  },
];
