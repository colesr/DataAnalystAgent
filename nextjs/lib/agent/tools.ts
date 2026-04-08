/**
 * Tools the agent can call. Provider-agnostic — both Claude and Gemini
 * runners pull from this list.
 *
 * Each tool has a JSON schema (`input_schema`) that we translate per-provider
 * and an `execute` function that runs server-side against the user's workspace.
 */
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { datasets, workspaceMemory } from "../schema";
import type { ChartSpec, Tool } from "./types";

/** Hard cap on rows returned to the agent (keeps token usage bounded). */
const MAX_SQL_ROWS = 200;

export const tools: Tool[] = [
  {
    name: "list_tables",
    description:
      "List every table in the user's workspace, including columns, types, and row counts. ALWAYS call this first to understand the schema before writing queries.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async (_input, ctx) => {
      const rows = await db
        .select({
          name: datasets.name,
          tableName: datasets.tableName,
          columns: datasets.columns,
          rowCount: datasets.rowCount,
        })
        .from(datasets)
        .where(eq(datasets.workspaceId, ctx.workspaceId));
      if (rows.length === 0) {
        return { tables: [], note: "No data uploaded yet — ask the user to upload a CSV." };
      }
      return {
        tables: rows.map((r) => ({
          name: r.name,
          table: r.tableName,
          rows: r.rowCount,
          columns: r.columns.map((c) => `${c.name} ${c.type}`),
        })),
      };
    },
  },

  {
    name: "query_sql",
    description:
      "Run a single SQL SELECT statement against the user's workspace. Returns up to 200 rows. Reference tables by their unqualified name. Real Postgres syntax: use date_trunc, EXTRACT, COALESCE, window functions.",
    input_schema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "A single SELECT statement (no DDL, no semicolons mid-statement).",
        },
      },
      required: ["sql"],
    },
    execute: async (input: { sql: string }, ctx) => {
      const userSql = (input?.sql ?? "").trim();
      if (!userSql) throw new Error("Empty SQL");

      const result = (await db.transaction(async (tx) => {
        // schemaName is generated server-side from a UUID hex with a fixed
        // prefix, so it is safe to interpolate. The user query itself is sent
        // raw because the whole purpose of this tool is to run user-authored SQL.
        await tx.execute(
          sql.raw(`SET LOCAL search_path TO "${ctx.schemaName}", public`)
        );
        await tx.execute(sql.raw(`SET LOCAL statement_timeout = '15s'`));
        return await tx.execute(sql.raw(userSql));
      })) as any;

      const rowsAll: Record<string, unknown>[] = Array.isArray(result) ? result : [];
      const truncated = rowsAll.length > MAX_SQL_ROWS;
      const rows = truncated ? rowsAll.slice(0, MAX_SQL_ROWS) : rowsAll;
      const columns = rows[0] ? Object.keys(rows[0]) : [];
      return {
        columns,
        rows,
        rowCount: rowsAll.length,
        truncated,
      };
    },
  },

  {
    name: "save_note",
    description:
      "Persist a short note (max ~500 chars) about something durable you learned about the user's data — schema quirks, unit conventions, data quality caveats, etc. The note is automatically injected into the system prompt on every future run for this workspace. Use sparingly: only for facts that will help next time.",
    input_schema: {
      type: "object",
      properties: {
        note: {
          type: "string",
          description: "The note content. Aim for one or two short sentences.",
        },
      },
      required: ["note"],
    },
    execute: async (input: { note: string }, ctx) => {
      const note = (input?.note ?? "").trim().slice(0, 500);
      if (!note) throw new Error("Empty note");
      await db.insert(workspaceMemory).values({
        workspaceId: ctx.workspaceId,
        note,
      });
      return { ok: true, saved: note };
    },
  },

  {
    name: "render_chart",
    description:
      "Register a chart for the final report. The user's UI renders these client-side with Chart.js. Call this when a visualization helps explain your findings.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["bar", "line", "pie", "doughnut", "scatter"],
        },
        title: { type: "string" },
        labels: {
          type: "array",
          description: "Category labels (x-axis values for bar/line, slice labels for pie).",
          items: {},
        },
        datasets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              data: { type: "array", items: { type: "number" } },
            },
            required: ["label", "data"],
          },
        },
      },
      required: ["type", "title", "labels", "datasets"],
    },
    execute: async (input: ChartSpec, ctx) => {
      ctx.charts.push(input);
      return { ok: true, registered: input.title, chartCount: ctx.charts.length };
    },
  },
];

export function findTool(name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}
