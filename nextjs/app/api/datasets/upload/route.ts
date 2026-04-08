import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { parseSpreadsheet, baseNameForTable } from "@/lib/csv";
import { ingestParsed } from "@/lib/ingest";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 413 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseSpreadsheet(buf, file.name);
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: "File has no data rows" }, { status: 400 });
    }

    const ws = await getActiveWorkspace();
    const result = await ingestParsed({
      ws,
      parsed,
      desiredName: baseNameForTable(file.name),
      sourceFile: file.name,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[upload] failed:", e);
    return NextResponse.json(
      { error: e?.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}
