# Digital Coworker

A free, in-browser data analyst workbench. Upload data, explore it through a step-by-step
workflow (Define → Acquire → Clean → EDA → Model → Communicate → Deploy), get help from
an AI agent that runs **entirely on your machine** — no API keys, no cloud inference, no
usage cost.

Originally a single-file vanilla HTML demo (`index.html` at the repo root). Now a Next.js 16
app that deploys for free to Vercel + Neon, with all AI inference handled in-browser by
[WebLLM](https://github.com/mlc-ai/web-llm).

## What's new in Phase 15

- **Workflow-step IA** — primary nav reorganized around the 7 steps of the analyst
  workflow. Each step has a hero header, dedicated sub-tabs, and a "Coach me through this"
  button.
- **⌘K command palette** — searchable launcher for any feature, action, or step.
- **WebLLM by default** — agent inference moved into the browser via WebGPU. First use
  downloads a model (~1.8 GB for the recommended Hermes-3 3B); cached forever after.
  No API keys required. Cloud Claude / Gemini still available as a "legacy" picker option.
- **In-app Coach** — floating button that opens a step-aware chat. Powered by the same
  WebLLM engine, with action-card buttons that drive the UI for you.
- **Vercel + Neon deploy** — Railway is gone. Free tier on both services covers typical use.

## Features

- **Upload anything**: CSV, TSV, XLSX. Drag-drop, paste a URL, pull from a Google Sheet, or
  ingest from an external Postgres SELECT.
- **Per-workspace Postgres schema**: every uploaded file becomes a real Postgres table inside
  an isolated `ws_<id>` schema. Query with raw SQL, the 28+ tool cards, or the AI agent.
- **In-browser AI agent** with tool use: `list_tables`, `query_sql`, `render_chart`,
  `save_note`. Runs locally via WebLLM (default) or via cloud BYOK for higher quality.
- **7-step IA + sub-tabs**: every existing panel is re-homed under a workflow step.
  Workbench menu keeps SQL + Glossary always one click away.
- **Coach** (bottom-right): conversational guide that knows the feature catalog and emits
  clickable action cards. Free, runs in the browser.
- **Dashboards** of SQL-backed tiles (bar / line / pie / doughnut / scatter / treemap /
  sankey / leaflet map / big number / table).
- **Sharing**: save an analysis, generate a public read-only link at `/a/<token>`.
- **Schedules** (hourly / daily / weekly) re-run a saved analysis on the latest data.
- **Alerts**: SQL + threshold; email via Resend or Slack via webhook.
- **Multi-workspace + invites**: owner / editor / viewer roles, token-based invite links.
- **Anonymous-first auth**: anyone can use the app via a cookie-tracked workspace.

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Hosting**: Vercel (Hobby tier — free)
- **DB**: Neon Postgres (free tier) + Drizzle ORM (one shared `public` schema for metadata,
  one `ws_<id>` per workspace for user data)
- **In-browser AI**: `@mlc-ai/web-llm` (WebGPU, models: Llama 3.2 3B, Hermes-3 3B, Llama 3.1 8B)
- **Cloud AI (optional)**: `@anthropic-ai/sdk`, `@google/generative-ai`
- **Auth**: Auth.js v5 (NextAuth) with Drizzle adapter, optional Google OAuth
- **Charts**: Chart.js + react-chartjs-2 (+ chartjs-chart-sankey, chartjs-chart-treemap)
- **Maps**: Leaflet
- **Markdown**: react-markdown + remark-gfm
- **Email**: Resend
- **Tests**: Vitest (unit) + Playwright (e2e smoke)
- **Crons**: GitHub Actions hitting `/api/schedules/run` and `/api/alerts/check` every ~5 min

## Local development

```bash
cd nextjs
npm install --legacy-peer-deps
cp .env.example .env.local        # fill in DATABASE_URL + AUTH_SECRET at minimum
npm run db:migrate                # apply migrations to DATABASE_URL
npm run dev
```

App runs at http://localhost:3000.

The first time you click "Run analysis" with a local model, the WebLLM model downloads
(~1.8 GB, cached in IndexedDB). Requires a browser with WebGPU — Chrome / Edge / Brave on
desktop, or Safari 18+. Firefox needs `dom.webgpu.enabled` set in `about:config`.

## Environment variables

| Variable | Required | What it does |
|----------|----------|--------------|
| `DATABASE_URL` | yes | Postgres connection string. **Use Neon's direct URL, not the pooled one** — the agent's `SET LOCAL search_path` queries need transaction support that PgBouncer doesn't reliably provide. |
| `AUTH_SECRET` | yes | Auth.js signing secret. Generate with `openssl rand -base64 32`. |
| `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` | optional | Google sign-in. Without these the app stays in anonymous mode. |
| `ANTHROPIC_API_KEY` | optional | Required only for the legacy `claude:*` cloud models. |
| `GEMINI_API_KEY` | optional | Required only for the legacy `gemini:*` cloud models. |
| `CRON_SECRET` | optional | Required to call `/api/schedules/run` and `/api/alerts/check`. Set the same value as a GitHub Actions secret. |
| `RESEND_API_KEY` + `RESEND_FROM` | optional | Email alerts via Resend. |
| `ADMIN_EMAILS` | optional | Comma-separated emails allowed to view `/admin`. |

`AUTH_URL` and `NEXTAUTH_URL` are intentionally **not used** — `trustHost: true` on
NextAuth lets it derive the canonical origin from proxy headers (Vercel sets these).

## Deploy to Vercel + Neon (free)

### 1. Create a Neon project

- Sign up at https://neon.tech (free tier — 0.5 GB storage, autosuspend after inactivity).
- Create a project. Copy the **direct connection string** from the dashboard
  (it looks like `postgres://USER:PASS@ep-xxxx.REGION.aws.neon.tech/DB?sslmode=require`).
  Don't use the "Pooled connection" — see the env var note above.

### 2. Push to GitHub

Make sure your fork lives at a GitHub repo. Vercel imports projects from there.

### 3. Import on Vercel

- Go to https://vercel.com/new and import the repo.
- **Root Directory**: `nextjs`
- **Framework Preset**: Next.js (auto-detected)
- **Build Command**: leave default — `vercel.json` already points it at `npm run vercel-build`,
  which runs migrations + builds.
- **Environment variables**: paste from the table above. At minimum `DATABASE_URL` and
  `AUTH_SECRET`.

Click Deploy. The first build runs `node scripts/migrate.mjs` (applies migrations to your
Neon DB) then `next build`.

### 4. Set up the cron (optional, for schedules + alerts)

If you use schedules or alerts, the GitHub Actions cron at `.github/workflows/cron.yml`
hits two endpoints every ~5 minutes. Add two repo secrets in GitHub:

- `APP_URL` → your Vercel deployment URL (no trailing slash)
- `CRON_SECRET` → same value you set in Vercel env

The workflow `curl`s both endpoints with `Authorization: Bearer $CRON_SECRET`.

## Data model

```
public.users / accounts / sessions / verification_tokens   ← Auth.js
public.workspaces                                          ← one row per workspace, has schema_name
public.workspace_members                                   ← (workspace_id, user_id) → role
public.workspace_invites                                   ← token-based pending invites
public.datasets                                            ← metadata pointing at ws_xxx.<table>
public.analyses + analysis share tokens
public.glossary_entries                                    ← injected into agent system prompt
public.workspace_memory                                    ← agent's save_note tool writes here
public.dashboards + dashboard_tiles
public.schedules + alerts
public.query_history + agent_runs                          ← telemetry

ws_<short id>.<user_table>                                 ← actual uploaded data, per workspace
```

Each `ws_<short id>` schema is created lazily on first use and dropped CASCADE when its
workspace is deleted.

## API surface

```
/api/health                              public, returns db connectivity
/api/me                                  current user + active workspace
/api/auth/[...nextauth]                  Auth.js
/api/workspaces                          list + create
/api/workspaces/[id]                     PATCH rename, DELETE
/api/workspaces/[id]/switch              POST sets active cookie
/api/workspaces/[id]/members             list, remove
/api/workspaces/[id]/invites             list, create, revoke
/api/invites/[token]/accept              POST joins
/api/datasets                            list
/api/datasets/upload                     multipart upload
/api/datasets/import-url                 fetch + ingest CSV/XLSX from URL
/api/datasets/import-gsheet              public Google Sheet → CSV ingest
/api/datasets/import-postgres            DSN + SELECT → ingest
/api/datasets/seed                       demo data
/api/datasets/[id]                       DELETE
/api/datasets/[id]/rows                  paginated row browser
/api/datasets/[id]/profile               column statistics
/api/datasets/[id]/clean                 dedupe / parse_dates / add_column / drop
/api/sql                                 user SQL against the workspace schema
/api/agent                               POST → SSE stream of AgentEvents (cloud BYOK path)
/api/agent/tool                          POST one tool call (used by the in-browser agent)
/api/agent/context                       GET glossary + memory for the in-browser agent prompt
/api/chat                                in-app helper, plain text streaming
/api/analyses                            list / save
/api/analyses/[id]                       GET / DELETE
/api/analyses/[id]/share                 POST generate, DELETE revoke
/api/glossary                            GET / PUT
/api/dashboards                          list + create
/api/dashboards/[id]                     GET / DELETE / PATCH
/api/dashboards/[id]/tiles               POST add
/api/dashboards/tiles/[id]               DELETE
/api/schedules                           CRUD
/api/schedules/run                       cron-secret-protected runner
/api/alerts                              CRUD
/api/alerts/check                        cron-secret-protected checker
```

## Database migrations

```bash
npm run db:generate        # drizzle-kit generate, after editing lib/schema.ts
npm run db:migrate         # apply pending migrations (production-safe runtime migrator)
npm run db:migrate:kit     # same but via drizzle-kit (dev)
```

Migrations live in `nextjs/drizzle/` and run automatically as part of `vercel-build` on
every deploy.

## Tests

```bash
npm test                   # vitest unit tests
npm run test:e2e           # playwright smoke tests (boots next start)
```

CI: `.github/workflows/test.yml` runs the unit suite on every PR.
`.github/workflows/e2e.yml` runs the Playwright suite against a Postgres service container.

## Phase changelog (highlights)

- **Phase 1** — Ported the static `index.html` UI to React.
- **Phase 2** — Per-workspace Postgres schemas; uploaded CSVs become real tables; Data browser; SQL editor.
- **Phase 3** — Streaming AI agent with Claude + Gemini, three tools, 12-turn cap.
- **Phase 4** — Saved analyses, public share links, glossary persistence, schedules, alerts.
- **Phase 5** — Tools tab + Schema tab wired to real SQL, real Chart.js, dashboards, auth UI, conversation continuation, Resend email, rate limiting, token telemetry.
- **Phase 6** — Clean tab + Pivot tab + 21 more tool cards.
- **Phase 7** — Markdown rendering, in-app chatbot helper, demo data seed, MD/PNG export.
- **Phase 8** — `/admin` page, daily Postgres backup, Playwright smoke tests, Slack alert webhook.
- **Phase 9** — Multi-workspace, member roles, token invites, workspace settings page.
- **Phase 10** — URL / Google Sheets / external Postgres importers (shared `ingestParsed` helper).
- **Phase 11** — Real Sankey + Treemap (Chart.js plugins), Leaflet basemap for the Map tool, top-values bars on Schema cards.
- **Phase 12** — Self-correcting agent prompt, plan-first prompt, `save_note` tool + `workspace_memory` table.
- **Phase 13** — Dialog-based UX (no more `window.prompt`), first-run welcome, mobile responsive sweep.
- **Phase 14** — Vitest unit tests + this README.
- **Phase 15a** — Workflow-step IA, ⌘K command palette, Coach button placeholder.
- **Phase 15b** — `@mlc-ai/web-llm` integration, browser-local agent with tool use,
  per-model download UX. Cloud models become an opt-in "legacy" path.
- **Phase 15c** — Coach agent backed by WebLLM, action cards that drive the UI,
  step-aware system prompt with full feature catalog.
- **Phase 15d** — Cut over from Railway to Vercel + Neon. `vercel-build` script wires
  migrations into deploys; agent route `maxDuration` lowered to 60 (Vercel Hobby cap).

## Troubleshooting

**Local AI says "WebGPU not available"** — your browser lacks WebGPU. Use Chrome / Edge /
Brave on desktop, Safari 18+, or enable `dom.webgpu.enabled` in Firefox `about:config`.
Without WebGPU you can still use every deterministic feature (cleaners, profilers,
dashboards, SQL editor) and fall back to a cloud model with a server-side API key.

**Vercel deploy fails on `vercel-build`** — usually means migrations couldn't reach the
DB. Confirm `DATABASE_URL` is set in Vercel project env, and that you used the **direct**
Neon connection string (not the pooled one).

**`SET LOCAL` errors** — check that `DATABASE_URL` points at Neon's direct endpoint
(not `-pooler` or `?pgbouncer=true`). PgBouncer's transaction mode breaks `SET LOCAL`.

**`npm test` works locally but CI fails** — `nextjs/.npmrc` has `legacy-peer-deps=true`
to make `npm ci` accept the next@16 / next-auth@5-beta peer conflict. CI uses
`npm ci --legacy-peer-deps` for the same reason.

**Charts don't render in the share page** — saved analyses only persist the spec, not the
data. The share page is a snapshot.
