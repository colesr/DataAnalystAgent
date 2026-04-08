#!/usr/bin/env node
/**
 * Reproduce createWorkspace from lib/workspace.ts directly against the
 * configured DATABASE_URL. If this works, the failure is JS-only.
 */
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const sql = postgres(url, { max: 1 });

try {
  const shortId = randomUUID().replace(/-/g, "").slice(0, 12);
  const schemaName = `ws_${shortId}`;
  console.log(`Creating schema "${schemaName}"...`);
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  console.log(`Inserting workspace row...`);
  const [row] = await sql`
    INSERT INTO workspaces (user_id, schema_name, name)
    VALUES (NULL, ${schemaName}, 'Default')
    RETURNING *
  `;
  console.log("OK:", row);
  // clean up so we don't pollute the live db
  await sql`DELETE FROM workspaces WHERE id = ${row.id}`;
  await sql.unsafe(`DROP SCHEMA "${schemaName}"`);
  console.log("Cleaned up.");
} catch (e) {
  console.error("FAILED:", e);
  process.exit(1);
} finally {
  await sql.end();
}
