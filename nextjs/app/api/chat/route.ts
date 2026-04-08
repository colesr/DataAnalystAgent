import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT_PER_MIN = parseInt(process.env.CHAT_RATE_LIMIT_PER_MIN ?? "20", 10);

const SYSTEM = `You are the in-app helper for Digital Data Analyst, a web app where users upload CSV/Excel files and analyze them with SQL + an AI agent.

Tabs the user can see:
- Ask: type a question, the agent runs SQL, returns a markdown report with charts.
- Data: browse uploaded tables row-by-row with sort + filter.
- Tools: ~28 cards (histogram, correlation, group-by, t-test, regression, pareto, forecast, cohort, funnel, sessionize, k-means, etc.) — each one wraps a SQL pattern.
- Dashboard: combine SQL queries into named tile collections.
- Clean: dedupe, parse dates, drop tables, add calculated columns.
- Pivot: pivot table builder with row/column dimensions.
- SQL: a raw SQL editor against the user's workspace schema.
- Glossary: define metric names that get injected into the agent's system prompt.
- Saved: save Ask reports, share via public links, schedule re-runs.
- Schema: per-column data profile (counts, distinct, top values).

Be concise. 1-3 short paragraphs max. Never invent tabs or features that don't exist above.`;

/**
 * POST /api/chat
 * Body: { message: string, history?: { role, text }[], model: string }
 * Streams plain text deltas (no tool calling — this helper doesn't need it).
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`chat:${ip}`, { limit: RATE_LIMIT_PER_MIN, windowSec: 60 });
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: `Rate limit: try again in ${rl.retryAfterSec}s` }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfterSec),
        },
      }
    );
  }

  let body: { message?: string; history?: { role: "user" | "assistant"; text: string }[]; model?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const message = (body.message ?? "").trim();
  const model = (body.model ?? "gemini:gemini-2.5-flash").trim();
  const history = Array.isArray(body.history) ? body.history : [];
  if (!message) return new Response("Missing message", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {}
      };

      try {
        if (model.startsWith("claude:")) {
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            send("Helper is unavailable: ANTHROPIC_API_KEY is not set on the server.");
            controller.close();
            return;
          }
          const client = new Anthropic({ apiKey });
          const messages: Anthropic.MessageParam[] = [];
          for (const h of history) messages.push({ role: h.role, content: h.text });
          messages.push({ role: "user", content: message });
          const s = client.messages.stream(
            {
              model: model.replace(/^claude:/, ""),
              max_tokens: 1024,
              system: SYSTEM,
              messages,
            },
            { signal: req.signal }
          );
          for await (const ev of s) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
              send(ev.delta.text);
            }
          }
        } else {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            send("Helper is unavailable: GEMINI_API_KEY is not set on the server.");
            controller.close();
            return;
          }
          const genAI = new GoogleGenerativeAI(apiKey);
          const m = genAI.getGenerativeModel({
            model: model.replace(/^gemini:/, ""),
            systemInstruction: SYSTEM,
          });
          const contents = [
            ...history.map((h) => ({
              role: h.role === "assistant" ? ("model" as const) : ("user" as const),
              parts: [{ text: h.text }],
            })),
            { role: "user" as const, parts: [{ text: message }] },
          ];
          const result = await m.generateContentStream({ contents });
          for await (const chunk of result.stream) {
            const t = chunk.text();
            if (t) send(t);
          }
        }
      } catch (e: any) {
        send(`\n\n_error: ${e?.message ?? String(e)}_`);
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
