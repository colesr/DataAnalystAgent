#!/usr/bin/env node
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  const tables = await sql`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `;
  console.log("Tables:");
  for (const t of tables) console.log(`  ${t.table_schema}.${t.table_name}`);
  if (tables.length === 0) console.log("  (none)");
} finally {
  await sql.end();
}
