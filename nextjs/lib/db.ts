import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Don't crash at import — let pages render and surface the error in /api/health
  console.warn("[db] DATABASE_URL is not set");
}

// Reuse the same connection across hot reloads in dev
const globalForPostgres = global as unknown as { postgres?: ReturnType<typeof postgres> };

const client =
  globalForPostgres.postgres ??
  postgres(connectionString ?? "postgres://invalid", {
    // Vercel serverless functions are short-lived; keep the pool small so we
    // don't blow past Neon's connection limits during traffic spikes.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") globalForPostgres.postgres = client;

export const db = drizzle(client, { schema });
export { schema };
