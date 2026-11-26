# Vendora

AI-powered product intelligence platform with two core services:

1. **AI Product Studio** — turns product photos into professional advertising images (OpenAI Images API).
2. **Demand Forecast** — world and country demand for a product from 5 years of Google Trends search interest (via SerpApi): seasons (e.g. back-to-school, New Year), when demand rises and falls, a 12-month outlook, a ranking of countries, and a comparison of up to 5 products (which is growing, which is falling).

   The analysis runs inside Vercel/Node with no paid AI service: STL decomposition (periodic, robust) of the monthly series, then a Prophet-style regression (piecewise-linear trend with regularised changepoints + yearly Fourier terms), an STL + damped-trend model and a seasonal-naive model compete on a 12-month back-test; the best one makes the forecast. Seasonal strength, per-month effects and their year-to-year consistency are reported with every result.

Plus: Dashboard, My Projects, Analytics, Favorites, Notifications, Profile, Settings (light/dark, Uzbek/Russian/English), Free/Pro/Max plans paid by bank card (receipt + administrator approval) and authentication with email sign-in codes.

## Data integrity rules (enforced in code)

- **No fake AI generation.** Without `OPENAI_API_KEY` the Studio returns `SERVICE_NOT_CONFIGURED` and stores nothing. Provider output is validated as a real image before it is saved.
- **Demand is search interest, labelled as such.** The Demand Forecast page uses Google Trends (0–100 relative search interest per area), never presented as units sold. Areas with too little data are shown as "no data", not filled in.
- **Statistics are real.** Dashboard and analytics numbers are computed from the user's own stored activity.
- **No fake payments.** A paid plan starts only when an administrator approves the uploaded payment receipt.

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
3. In `.env`: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=your@gmail.com`, `SMTP_PASS=<app password>`, `EMAIL_FROM="Vendora <your@gmail.com>"`.

## Tests

```bash
npm test                  # 34 API, security and engine tests (local SQLite)
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


## Deploy to Vercel

The repository is ready for Vercel: `vercel.json` builds the web app (static files) and the
API (one serverless function, `api/index.js`). Vercel has no persistent disk, so the database
lives in **Turso** and images in **Vercel Blob** (both have free plans).

1. **Database — Turso.** Create an account at turso.tech, create a database, then copy its URL
   (`libsql://…turso.io`) and create an auth token (dashboard → database → "Create token").
2. **Import the repository in Vercel** (Add New → Project → choose the GitHub repository).
   Leave Framework Preset as **Other**; the build settings come from `vercel.json`.
3. **Storage — Vercel Blob.** In the project: Storage → Create → Blob → connect it to the
   project. Vercel adds `BLOB_STORE_ID` (private stores, authenticated with Vercel OIDC) or
   `BLOB_READ_WRITE_TOKEN` automatically; either works. Redeploy afterwards.
4. **Environment variables** (Settings → Environment Variables):
   - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (required)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (required: sign-in codes are emailed; Gmail example above)
   - optional: `SERPAPI_API_KEY` (demand forecast), `OPENAI_API_KEY` (AI Studio)
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
| Demand forecast, Market Radar, opportunities, regions, seasons | `SERPAPI_API_KEY` (Google Trends engine) | Pages show "not connected"; nothing is estimated |
| Economic statistics (Uzbekistan, country comparison) | none — World Bank Open Data is free (`WORLD_BANK_ENABLED=false` turns it off) | — |
| Import / export by product group | `COMTRADE_API_KEY` (free key, comtradedeveloper.un.org) | Card shows "not connected" |
| AI Business Advisor, AI report summaries | `GEMINI_API_KEY` (free tier, aistudio.google.com) or `OPENAI_API_KEY`; `LLM_PROVIDER` picks one if both are set | Advisor shows "not connected"; reports are still made without the AI summary |
| My Business (sales data analysis, forecast, reports) | none | — |
| Ad Studio templates, banner maker, Creative Score (measured), promo videos, brand kit, campaign planner and results | none (runs in the browser / own database) | — |
| AI ad copy, AI creative review, competitor ad analysis, AI campaign plans | `GEMINI_API_KEY` or `OPENAI_API_KEY` (same as the advisor) | Buttons show "not connected"; manual work still possible |
| Growth Hub (opportunity → AI explanation → direction → ads → campaign → results → learnings) | the same keys as above; learnings need none | Each step says what is missing |
| Daily refresh of shared market data (Vercel Cron, `vercel.json`) | `CRON_SECRET` (any long random text) | Data is refreshed on the first visit instead |
| AI video scenes and voice-over | not integrated (needs a video service) | Promo videos are made in the browser from the user's photos |
