import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { alerts, workspaces } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/alerts/check
 *
 * CRON_SECRET-protected. Runs every enabled alert's SQL inside the alert's
 * workspace schema and stamps lastTriggeredAt + lastResult when the row
 * count exceeds the threshold. Designed to be hit by external cron.
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await db
    .select({ alert: alerts, workspace: workspaces })
    .from(alerts)
    .innerJoin(workspaces, eq(alerts.workspaceId, workspaces.id))
    .where(eq(alerts.enabled, true));

  const results: { id: string; name: string; rows: number; triggered: boolean; error?: string }[] =
    [];

  for (const row of due) {
    const a = row.alert;
    const ws = row.workspace;
    const threshold = parseInt(a.threshold, 10);
    try {
      const queryResult = (await db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(`SET LOCAL search_path TO "${ws.schemaName}", public`)
        );
        await tx.execute(sql.raw(`SET LOCAL statement_timeout = '15s'`));
        return await tx.execute(sql.raw(a.sql));
      })) as any[];
      const rowCount = Array.isArray(queryResult) ? queryResult.length : 0;
      const triggered = rowCount > threshold;

      await db
        .update(alerts)
        .set({
          lastRunAt: new Date(),
          lastResult: triggered
            ? `triggered: ${rowCount} rows > ${threshold}`
            : `ok: ${rowCount} rows`,
          ...(triggered ? { lastTriggeredAt: new Date() } : {}),
        })
        .where(eq(alerts.id, a.id));

      if (triggered) {
        console.warn(
          `[alert] TRIGGERED: ${a.name} (workspace=${ws.id}) → ${rowCount} rows > ${threshold}`
        );
      }
      results.push({ id: a.id, name: a.name, rows: rowCount, triggered });
    } catch (e: any) {
      const error = e?.message ?? String(e);
      await db
        .update(alerts)
        .set({ lastRunAt: new Date(), lastResult: `error: ${error}` })
        .where(eq(alerts.id, a.id));
      results.push({ id: a.id, name: a.name, rows: 0, triggered: false, error });
    }
  }

  return NextResponse.json({ checked: results.length, results });
}
