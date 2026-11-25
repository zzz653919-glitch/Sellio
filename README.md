# PricePro

AI-powered product intelligence platform with three core services:

1. **AI Product Studio** — turns product photos into professional advertising images (OpenAI Images API).
2. **Demand Forecast** — world and country demand for a product from Google Trends search interest (via SerpApi), with a back-tested outlook per area and a ranking of countries.
3. **Smart Price Finder** — compares live store prices and finds the cheapest offer (SerpApi Google Shopping, eBay Browse API).

Plus: Dashboard, My Projects, Analytics, Favorites, Notifications, Profile, Settings (light/dark, Uzbek/Russian/English), Free/Pro subscriptions (Stripe) and authentication with email sign-in codes.

## Data integrity rules (enforced in code)

- **No fake AI generation.** Without `OPENAI_API_KEY` the Studio returns `SERVICE_NOT_CONFIGURED` and stores nothing. Provider output is validated as a real image before it is saved.
- **No invented prices, stores, availability or links.** Offers come only from configured providers; incomplete records are discarded. Availability and condition are shown as "not verified/not stated" unless the provider states them.
- **Demand is search interest, labelled as such.** The Demand Forecast page uses Google Trends (0–100 relative search interest per area), never presented as units sold. Areas with too little data are shown as "no data", not filled in.
- **Statistics are real.** Dashboard and analytics numbers are computed from the user's own stored activity.
- **No fake payments.** The plan changes only when a signed Stripe webhook confirms payment.

## Architecture

```
server/   Node 22 + Express 5 + TypeScript
  src/config.ts          validated environment configuration
  src/db/                SQLite (node:sqlite) + migrations; every private table has user_id
  src/middleware/        sessions, CSRF header check, rate limits, error handling
  src/services/          storage, email, notifications, activity log, plan limits
  src/modules/
    auth/                two-step sign-up/sign-in (password + 6-digit email code), logout, forgot/reset password
    user/                profile, avatar, password, sessions, settings, account deletion
    studio/              uploads, image provider adapter, generation job queue, retry, history
    forecast/            Google Trends adapter, forecasting engine (back-tested models), world/country demand analyses
    prices/              provider adapters (SerpApi, eBay), product matching, history, export
    projects/ favorites/ analytics/ notifications/ dashboard/ subscription/ files/
  test/                  API + security + engine tests (node:test)
web/      React 19 + TypeScript + Vite + Tailwind CSS 4 + Framer Motion + Lucide + Recharts
  src/lib/               API client, auth, i18n (en/uz), theme, types
  src/components/        layout, UI kit, shared widgets
  src/pages/             one page per module
```

**Security:** two-step sign-in (password, then a 6-digit email code: valid 10 minutes, 5 attempts, 60-second resend cooldown, only its hash is stored), bcrypt password hashing, opaque session tokens (only their SHA-256 is stored) in HttpOnly SameSite cookies, CSRF protection via a required custom header, ownership checks on every query (foreign records return 404), byte-level image validation, upload size limits, Helmet security headers with a strict CSP, per-IP and per-user rate limits, monthly plan limits, CSV formula-injection protection, account-enumeration-safe password reset. API keys stay on the server.

**Database and files:** the database layer (`src/db`) has two drivers — Turso/libSQL when `TURSO_DATABASE_URL` is set (Vercel), otherwise a local SQLite file via `node:sqlite`. File storage (`src/services/storage.ts`) uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise the local disk. The same schema and queries run on both.

## Requirements

- Node.js **22.13+** (uses the built-in `node:sqlite`)

## Run locally

```bash
npm install
cp .env.example .env     # fill in the keys you have
npm run dev:server       # API on http://localhost:4000
npm run dev:web          # web on http://localhost:5173 (proxies /api)
```

Without SMTP in development, emails are printed to the server log and the sign-in page shows the code (labelled "development mode"). In production without SMTP, sign-up and sign-in are refused with a clear error, because codes could not be delivered.

### Email (Gmail)

1. Turn on 2-Step Verification for the Google account.
2. Create an App password: Google Account → Security → App passwords.
3. In `.env`: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=your@gmail.com`, `SMTP_PASS=<app password>`, `EMAIL_FROM="PricePro <your@gmail.com>"`.

## Tests

```bash
npm test                  # 35 API, security and engine tests (local SQLite)
TEST_LIBSQL=1 npm test    # the same suite through the Turso/libSQL driver
npm run typecheck
```

## Production

```bash
npm install
npm run build
NODE_ENV=production APP_URL=https://your-domain npm start
```

The server serves the built web app and the API on one port. Put it behind HTTPS (set `TRUST_PROXY=1` behind a proxy), keep `server/data/` on a persistent disk, and configure SMTP (required: sign-in codes are sent by email).

Stripe: create a recurring Price for Pro and set `STRIPE_PRICE_PRO`. Add a webhook endpoint `https://your-domain/api/webhooks/stripe` for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` and `invoice.paid`, and set `STRIPE_WEBHOOK_SECRET`.

## Deploy to Vercel

The repository is ready for Vercel: `vercel.json` builds the web app (static files) and the
API (one serverless function, `api/index.js`). Vercel has no persistent disk, so the database
lives in **Turso** and images in **Vercel Blob** (both have free plans).

1. **Database — Turso.** Create an account at turso.tech, create a database, then copy its URL
   (`libsql://…turso.io`) and create an auth token (dashboard → database → "Create token").
2. **Import the repository in Vercel** (Add New → Project → choose the GitHub repository).
   Leave Framework Preset as **Other**; the build settings come from `vercel.json`.
3. **Storage — Vercel Blob.** In the project: Storage → Create → Blob → connect it to the
   project. Vercel adds `BLOB_READ_WRITE_TOKEN` automatically.
4. **Environment variables** (Settings → Environment Variables):
   - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (required)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (required: sign-in codes are emailed; Gmail example above)
   - optional: `SERPAPI_API_KEY` (prices + world demand), `OPENAI_API_KEY` (AI Studio), `EBAY_*`, `STRIPE_*`
   - `APP_URL` only if you use a custom domain (otherwise the Vercel production domain is used)
5. **Deploy**, then open `https://<your-domain>/api/health`. It lists anything still missing
   (database, storage, email) without showing secret values.

The database tables are created automatically on the first request. Limits on Vercel: uploaded
images up to 4 MB (Vercel's request size limit); AI image generation continues after the
response for up to 5 minutes (`maxDuration` in `vercel.json`). Rate limits are counted per
function instance.

## Integrations

| Feature | Variable(s) | Without it |
| --- | --- | --- |
| Email | `SMTP_*` | dev: code shown on screen and in the log; prod: sign-up/sign-in refused |
| AI images | `OPENAI_API_KEY`, `IMAGE_MODEL` | Studio shows "not connected"; generation refused |
| Prices | `SERPAPI_API_KEY` and/or `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` | Price search refused |
| Demand forecast | `SERPAPI_API_KEY` (Google Trends engine) | Page shows "not connected"; nothing is estimated |
| Payments | `STRIPE_*` | Upgrades disabled |
