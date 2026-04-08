#!/usr/bin/env node
/**
 * Dump the configured Postgres to a timestamped .sql file in ./backups.
 * Used by .github/workflows/backup.yml and runnable locally.
 */
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[backup] DATABASE_URL is not set");
  process.exit(1);
}

const outDir = process.env.BACKUP_DIR ?? "backups";
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = `${outDir}/backup-${stamp}.sql`;
console.log(`[backup] dumping to ${out}`);

// Use --no-owner --no-acl so the dump can be restored into any cluster.
const args = ["--no-owner", "--no-acl", "--format=plain", url];
const child = spawn("pg_dump", args, { stdio: ["ignore", "pipe", "inherit"] });

const fs = await import("node:fs");
const sink = fs.createWriteStream(out);
child.stdout.pipe(sink);

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`[backup] done (${out})`);
    process.exit(0);
  } else {
    console.error(`[backup] pg_dump exited ${code}`);
    process.exit(code ?? 1);
  }
});
