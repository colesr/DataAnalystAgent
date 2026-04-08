#!/usr/bin/env node
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }
const sql = postgres(url, { max: 1 });
try {
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces'
    ORDER BY ordinal_position
  `;
  console.log("workspaces columns:");
  for (const c of cols) console.log(`  ${c.column_name} ${c.data_type} ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
  const idx = await sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'workspaces'
  `;
  console.log("\nworkspaces indexes:");
  for (const i of idx) console.log(`  ${i.indexname}`);

  const schemas = await sql`
    SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'ws\\_%' ESCAPE '\\'
  `;
  console.log("\nws_ schemas:");
  for (const s of schemas) console.log(`  ${s.schema_name}`);
  console.log(`(${schemas.length} total)`);

  const wsRows = await sql`SELECT id, user_id, schema_name, created_at FROM workspaces ORDER BY created_at DESC LIMIT 10`;
  console.log("\nrecent workspaces:");
  for (const w of wsRows) console.log(`  ${w.id} userId=${w.user_id ?? '<null>'} schema=${w.schema_name}`);
} finally {
  await sql.end();
}
