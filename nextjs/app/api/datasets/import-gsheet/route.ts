import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/datasets/import-gsheet { url, name? }
 *
 * Accepts the user-friendly Google Sheets URL
 *   https://docs.google.com/spreadsheets/d/<id>/edit#gid=<gid>
 * and rewrites it to the public CSV export endpoint
 *   https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>
 * then forwards to /api/datasets/import-url which does the actual fetch +
 * parse + ingest. The sheet must be shared "anyone with the link can view".
 */
export async function POST(req: Request) {
  let body: { url?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const raw = (body.url ?? "").trim();
  if (!raw) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const match = raw.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    return NextResponse.json(
      { error: "URL doesn't look like a Google Sheet" },
      { status: 400 }
    );
  }
  const sheetId = match[1];
  const gidMatch = raw.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  // Forward to the URL importer (server → server, no client involvement).
  const forwardRes = await fetch(new URL("/api/datasets/import-url", req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ url: exportUrl, name: body.name }),
  });
  const forwardBody = await forwardRes.text();
  return new NextResponse(forwardBody, {
    status: forwardRes.status,
    headers: { "Content-Type": forwardRes.headers.get("content-type") ?? "application/json" },
  });
}
