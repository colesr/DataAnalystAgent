import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { parseSpreadsheet, baseNameForTable } from "@/lib/csv";
import { ingestParsed } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Block obvious internal targets so server-side fetch can't be turned into
 * an SSRF probe. This isn't bulletproof against DNS rebinding — if you
 * deploy this to a network with sensitive internal services, layer in a
 * proper allowlist.
 */
function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return false;
  if (h.endsWith(".internal")) return false;
  if (h.endsWith(".local")) return false;
  // Reject IPv4 literals in private / link-local / loopback ranges.
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 0) return false;
  }
  // Reject IPv6 loopback / link-local literals.
  if (h.includes("::1")) return false;
  if (h.startsWith("fe80:")) return false;
  if (h.startsWith("fc") || h.startsWith("fd")) return false;
  return true;
}

/** POST /api/datasets/import-url { url: string, name?: string } */
export async function POST(req: Request) {
  let body: { url?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rawUrl = (body.url ?? "").trim();
  if (!rawUrl) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) URLs allowed" }, { status: 400 });
  }
  if (!isAllowedHost(parsedUrl.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 400 });
  }

  // Fetch with timeout + size cap.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(parsedUrl.toString(), { signal: ctrl.signal, redirect: "follow" });
  } catch (e: any) {
    clearTimeout(timer);
    return NextResponse.json(
      { error: `Fetch failed: ${e?.message ?? e}` },
      { status: 502 }
    );
  }
  clearTimeout(timer);
  if (!res.ok) {
    return NextResponse.json(
      { error: `Upstream returned ${res.status}` },
      { status: 502 }
    );
  }
  const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `Response too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
      { status: 413 }
    );
  }

  const arrayBuf = await res.arrayBuffer();
  if (arrayBuf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Response too large" }, { status: 413 });
  }
  if (arrayBuf.byteLength === 0) {
    return NextResponse.json({ error: "Empty response" }, { status: 400 });
  }
  const buf = Buffer.from(arrayBuf);

  // Use the URL's filename (or last path segment) for naming.
  const filename = decodeURIComponent(parsedUrl.pathname.split("/").pop() || "import.csv");

  let parsed;
  try {
    parsed = parseSpreadsheet(buf, filename);
  } catch (e: any) {
    return NextResponse.json(
      { error: `Parse failed: ${e?.message ?? e}` },
      { status: 400 }
    );
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: "No data rows" }, { status: 400 });
  }

  const ws = await getActiveWorkspace();
  const desiredName = (body.name ?? baseNameForTable(filename)).trim() || baseNameForTable(filename);
  try {
    const result = await ingestParsed({
      ws,
      parsed,
      desiredName,
      sourceFile: parsedUrl.toString(),
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Ingest failed" },
      { status: 500 }
    );
  }
}
