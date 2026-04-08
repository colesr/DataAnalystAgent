#!/usr/bin/env node
/**
 * Production-safe migration runner.
 *
 * Uses drizzle-orm's runtime migrator (not drizzle-kit) so it works after
 * `npm ci --omit=dev` strips devDependencies. This is what Railway runs as
 * its preDeployCommand.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
const db = drizzle(client);

try {
  console.log("[migrate] running migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] done");
  await client.end();
  process.exit(0);
} catch (err) {
  console.error("[migrate] failed:", err);
  await client.end({ timeout: 5 });
  process.exit(1);
}
