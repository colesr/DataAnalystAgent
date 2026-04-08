import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
  uuid,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ======================================================================
// AUTH TABLES (required by @auth/drizzle-adapter)
// ======================================================================
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    pk: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({ pk: primaryKey({ columns: [vt.identifier, vt.token] }) })
);

// ======================================================================
// DOMAIN TABLES
// ======================================================================

// A "workspace" is a container for everything someone uploads/saves.
// Anonymous workspaces have userId = null and are tracked via cookie.
// When a user signs in, their anonymous workspace can be claimed.
// Each workspace gets a dedicated Postgres schema (ws_<short-id>) where
// uploaded datasets become real tables.
export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  schemaName: text("schema_name").notNull().unique(),
  name: text("name").notNull().default("Default"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One row per uploaded dataset. The actual rows live in a real Postgres
// table named `<workspace.schemaName>.<tableName>` — this row is just
// metadata that links the user-facing name to the physical table.
export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tableName: text("table_name").notNull(),
    sourceFile: text("source_file"),
    columns: jsonb("columns").$type<{ name: string; type: string }[]>().notNull(),
    rowCount: integer("row_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ workspaceIdx: index("datasets_workspace_idx").on(t.workspaceId) })
);

// Saved analyses — name + question + report JSON, can be re-run
export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    question: text("question").notNull(),
    report: jsonb("report").notNull(),
    shareToken: text("share_token").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({ workspaceIdx: index("analyses_workspace_idx").on(t.workspaceId) })
);

// Query history — every SQL run from any source
export const queryHistory = pgTable(
  "query_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sql: text("sql").notNull(),
    source: text("source").notNull(),
    rowCount: integer("row_count"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ workspaceIdx: index("query_history_workspace_idx").on(t.workspaceId) })
);

// Metric glossary — name + definition
export const glossaryEntries = pgTable(
  "glossary_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    definition: text("definition").notNull(),
  },
  (t) => ({ workspaceIdx: index("glossary_workspace_idx").on(t.workspaceId) })
);

// Data assertions — SQL expectations that should return 0 rows
export const assertions = pgTable(
  "assertions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    sql: text("sql").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at"),
    lastResult: text("last_result"),
  },
  (t) => ({ workspaceIdx: index("assertions_workspace_idx").on(t.workspaceId) })
);

// Scheduled re-runs (Phase 4) — cron expression + analysis to re-run
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    cron: text("cron").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
  },
  (t) => ({ workspaceIdx: index("schedules_workspace_idx").on(t.workspaceId) })
);

// Alerts (Phase 4) — SQL + threshold + notification target
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sql: text("sql").notNull(),
    threshold: text("threshold").notNull(),
    notifyEmail: text("notify_email"),
    notifySlack: text("notify_slack"),
    enabled: boolean("enabled").notNull().default(true),
    lastTriggeredAt: timestamp("last_triggered_at"),
  },
  (t) => ({ workspaceIdx: index("alerts_workspace_idx").on(t.workspaceId) })
);
