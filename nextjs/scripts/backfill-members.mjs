#!/usr/bin/env node
/**
 * One-shot backfill: insert workspace_members rows for every existing
 * workspace that has a userId set, so Phase 9's permission model has
 * a consistent starting state. Idempotent — uses ON CONFLICT DO NOTHING.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const sql = postgres(url, { max: 1 });
try {
  const result = await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    SELECT id, user_id, 'owner'
    FROM workspaces
    WHERE user_id IS NOT NULL
    ON CONFLICT (workspace_id, user_id) DO NOTHING
  `;
  console.log(`[backfill] inserted owner rows for ${result.count} workspace(s)`);
} finally {
  await sql.end();
}
