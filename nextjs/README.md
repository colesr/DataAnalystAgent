# Digital Data Analyst — v2 (Next.js + Postgres + Railway)

This is the **Phase 0 scaffold**. The static HTML version (`../index.html`) is the source of
truth for all features until the port catches up.

## What's in Phase 0

- Next.js 15 (App Router) + React 19 + TypeScript
- Postgres via Drizzle ORM (schema for users, workspaces, datasets, analyses, query history,
  glossary, assertions, schedules, alerts)
- Auth.js (NextAuth v5) with Google OAuth + Drizzle adapter
- Health check endpoint at `/api/health`
- A status page at `/` that shows whether DB / auth / AI keys are configured
- Railway deploy config (Nixpacks + healthcheck)

**No analyst tools are ported yet.** That's Phase 1+.

## Local development

### 1. Install Node deps

```bash
cd nextjs
npm install
```

### 2. Set up a Postgres database

You have three options:

| Option | Best for | How |
|---|---|---|
| **Railway Postgres** (recommended) | Already deploying there | Add Postgres plugin → copy `DATABASE_URL` |
| **Neon** (free tier) | Local dev without installing Postgres | neon.tech → create project → copy connection string |
| **Local Postgres** | Offline dev | `brew install postgres` / Postgres.app / Docker |

### 3. Create `.env.local`

```bash
cp .env.example .env.local
```

Fill in:
- `DATABASE_URL` — from step 2
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `AUTH_URL` — `http://localhost:3000` for local
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — from Google Cloud Console (optional for Phase 0)
- `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` — optional (only needed once Phase 3 ships)

### 4. Push the schema to your database

```bash
npm run db:push
```

This creates all the tables defined in `lib/schema.ts` directly. (For production you'd use
`db:generate` + `db:migrate` to track migration files in git, but `push` is fine for early dev.)

### 5. Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000>. You should see the status page with green/yellow/red dots.

## Deploying to Railway

### 1. Create a new Railway project

- Sign in to [railway.app](https://railway.app)
- New Project → Deploy from GitHub repo → pick the repo containing this `nextjs/` folder
- In project settings, set the **root directory** to `nextjs/` (so Railway knows where the
  Next.js app lives)

### 2. Add Postgres

- In your project → "+ New" → Database → Postgres
- Railway will auto-inject `DATABASE_URL` into your Next.js service

### 3. Set environment variables

In the Next.js service → Variables tab, add:

| Variable | Value |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://your-app.up.railway.app` (from the deployment URL) |
| `AUTH_GOOGLE_ID` | from Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | from Google Cloud Console |
| `ANTHROPIC_API_KEY` | optional, for server-side Claude calls |
| `GEMINI_API_KEY` | optional, for server-side Gemini calls |
| `ALLOW_BYOK` | `true` to keep BYOK as a fallback |

### 4. Set up Google OAuth (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID → Web application
3. Authorized redirect URI: `https://your-app.up.railway.app/api/auth/callback/google`
4. Copy Client ID + Secret into Railway env vars

### 5. Push your schema

After the first deploy succeeds, run the migration once:

```bash
# From local, against the production DB:
DATABASE_URL="<paste from Railway>" npm run db:push
```

Or add a build step to run it automatically (optional, see "Phase 1 plan" below).

### 6. Verify

- Visit `https://your-app.up.railway.app/api/health` → should return JSON with `database: connected`
- Visit `/` → status page should show all green
- Visit `/api/auth/signin` → Google sign-in page

## Project structure

```
nextjs/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # Auth.js route handler
│   │   └── health/route.ts                # Health check JSON endpoint
│   ├── globals.css                        # Theme variables (ported from index.html)
│   ├── layout.tsx                         # Root layout
│   └── page.tsx                           # Status page
├── lib/
│   ├── auth.ts                            # NextAuth config + workspace helper
│   ├── db.ts                              # Drizzle Postgres client
│   └── schema.ts                          # All Drizzle table definitions
├── drizzle/                               # Generated migration files (after db:generate)
├── .env.example                           # Documented env vars
├── drizzle.config.ts                      # Drizzle Kit config
├── next.config.js                         # Next.js config
├── package.json
├── railway.toml                           # Railway build/deploy config
├── README.md                              # ← you are here
└── tsconfig.json
```

## What's next (the migration roadmap)

### Phase 1 — Port the static UI (1 session)

- Create components for: header, tab nav, every card type
- Port theme toggle, sound toggle, keyboard shortcuts
- Render the existing tools layout (no backend wiring yet — everything still uses sql.js
  in the browser, just like the HTML version)
- Visual parity with `../index.html`

### Phase 2 — Move data to Postgres (1-2 sessions)

- Replace browser sql.js with server-side query API
- Upload flow: parse CSV in browser → POST to `/api/datasets` → write to Postgres
- All tool queries go through `/api/query` (per-workspace, RLS-style filtering)
- Migrate localStorage state (saved analyses, glossary, assertions, query history) into
  the corresponding Postgres tables

### Phase 3 — Server-side AI agent (1 session)

- `/api/agent` endpoint with streaming responses
- Tool calls execute server-side with Postgres access
- Move API keys to env vars (BYOK becomes fallback for unauthenticated visitors)
- Stream tool calls back to the client over Server-Sent Events

### Phase 4 — Sharing, scheduling, alerts (1 session)

- `/r/[token]` read-only report viewer
- Scheduled re-runs via Railway cron + the `schedules` table
- Alerts via the `alerts` table — email or Slack webhook when a query crosses a threshold
- Audit log of who viewed what

## Troubleshooting

**`npm run db:push` fails with "ECONNREFUSED"**
→ `DATABASE_URL` is wrong or your Postgres isn't running. Test with `psql $DATABASE_URL`.

**Google sign-in returns "redirect_uri_mismatch"**
→ The redirect URI in Google Cloud Console must exactly match `{AUTH_URL}/api/auth/callback/google`,
including the protocol and any trailing slashes.

**Railway build fails on `npm install`**
→ Check that Railway's root directory is set to `nextjs/`, not the repo root. The HTML file
sits in the parent directory and Railway needs to know to ignore it.

**Health check shows "Database error: column does not exist"**
→ You haven't run `npm run db:push` against the deployed database yet. Do that once after the
first successful deploy.
