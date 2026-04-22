"use client";

import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import { chatStream, type LocalModelId } from "./webllm-client";
import type { Bot } from "./council-bots";

export type CouncilMessage = {
  id: string;
  authorId: string; // bot id, or "user"
  authorName: string;
  authorEmoji?: string;
  authorColor?: string;
  text: string;
  parentId?: string; // for threaded replies
  reactions: { heart: number; lol: number };
  createdAt: number;
};

export type OrchestratorEvent =
  | { kind: "bot_starting"; bot: Bot }
  | { kind: "bot_delta"; botId: string; delta: string }
  | { kind: "bot_done"; botId: string; messageId: string }
  | { kind: "all_done" }
  | { kind: "error"; message: string };

const MAX_PRIMARY_RESPONDERS = 3;
const HISTORY_FOR_BOT = 10; // messages of context shown to each bot
const PER_BOT_TIMEOUT_MS = 90_000; // hard cap per bot turn — prevents runaway streams
const MAX_TOKENS_PER_TURN = 280; // ~3-4 sentences, keeps replies snappy + bounded

/** Parse "@FirstName" tokens in the user's text and resolve to bot ids. */
export function parseMentions(text: string, bots: Bot[]): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  for (const b of bots) {
    const tag = `@${b.shortName.toLowerCase()}`;
    if (lower.includes(tag)) out.push(b.id);
  }
  return out;
}

/** Score each bot's relevance to a user message via keyword matching. */
function relevanceScore(text: string, bot: Bot): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const tag of bot.expertise) {
    if (lower.includes(tag.toLowerCase())) score += 2;
  }
  // Slight prefer balanced/asker for open questions, challenger for "should/why" prompts
  if (/^(why|should|is|do|does|will|would|could|how)\b/.test(text.trim())) {
    if (bot.style === "asker" || bot.style === "challenger") score += 0.5;
  }
  return score;
}

/** Pick which bots respond. @mentions always respond; otherwise top-N by relevance. */
export function pickResponders(
  userText: string,
  enabledBots: Bot[],
  desired = MAX_PRIMARY_RESPONDERS
): Bot[] {
  if (enabledBots.length === 0) return [];
  const mentioned = new Set(parseMentions(userText, enabledBots));
  if (mentioned.size > 0) {
    return enabledBots.filter((b) => mentioned.has(b.id)).slice(0, desired);
  }
  // Score-rank, with a small random tie-breaker so the same bots don't always lead.
  const scored = enabledBots.map((b) => ({
    b,
    s: relevanceScore(userText, b) + Math.random() * 0.4,
  }));
  scored.sort((a, b) => b.s - a.s);
  // If nothing matched (all scores ≤ random noise), pick 2 at random.
  if (scored[0].s < 1) {
    const shuffled = enabledBots.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(2, desired));
  }
  // Otherwise take top desired, but at least 1, max desired.
  return scored.slice(0, Math.min(desired, scored.length)).map((x) => x.b);
}

/** Build the system prompt for a bot, including who else is in the room. */
function buildSystemPrompt(bot: Bot, otherBots: Bot[], roomTopic: string): string {
  const others = otherBots
    .filter((b) => b.id !== bot.id)
    .map((b) => `- ${b.name} (${b.title}) — referred to as @${b.shortName}`)
    .join("\n");
  return `${bot.systemPrompt}

You are in a live group conversation called the "${roomTopic}". Other participants in the room:
${others || "(no other bots active right now)"}

Conversational rules:
- You can reference other participants by their @ShortName when reacting to what they said.
- The conversation is round-table style, not Q&A. Sometimes you should ask one sharp question instead of answering.
- Keep your turn to 2-4 sentences. The user wants a real meeting, not a wall of text.
- If you genuinely have nothing to add right now, say so briefly — don't filibuster.`;
}

/** Convert message log into LLM-format messages for a specific bot's perspective. */
function buildContextMessages(
  bot: Bot,
  history: CouncilMessage[],
  systemPrompt: string
): ChatCompletionMessageParam[] {
  // Drop any messages with empty text — would round-trip as `{role: ..., content: ""}`
  // and trip WebLLM's "Last message should be from user or tool" validation.
  const recent = history.filter((m) => m.text && m.text.trim().length > 0).slice(-HISTORY_FOR_BOT);
  const msgs: ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt }];
  for (const m of recent) {
    if (m.authorId === "user") {
      msgs.push({ role: "user", content: m.text });
    } else if (m.authorId === bot.id) {
      msgs.push({ role: "assistant", content: m.text });
    } else {
      // Another bot's message — feed it as a user-tagged transcript line so this
      // bot reads it as part of the room's history.
      msgs.push({ role: "user", content: `[${m.authorName} said] ${m.text}` });
    }
  }
  // Belt-and-suspenders: WebLLM requires the last message to be user or tool. If the
  // tail somehow ended up assistant, drop trailing assistants until that's true.
  while (msgs.length > 1 && msgs[msgs.length - 1].role === "assistant") {
    msgs.pop();
  }
  return msgs;
}

/** Stream one bot's reply. Returns the final message text. */
async function* streamBotTurn(
  bot: Bot,
  history: CouncilMessage[],
  otherBots: Bot[],
  roomTopic: string,
  signal?: AbortSignal
): AsyncIterable<{ delta?: string; final?: string }> {
  const systemPrompt = buildSystemPrompt(bot, otherBots, roomTopic);
  const messages = buildContextMessages(bot, history, systemPrompt);
  let acc = "";
  for await (const chunk of chatStream({
    messages,
    signal,
    maxTokens: MAX_TOKENS_PER_TURN,
    temperature: 0.75,
  })) {
    if (chunk.kind === "text") {
      acc += chunk.delta;
      yield { delta: chunk.delta };
    }
  }
  yield { final: acc.trim() };
}

/**
 * Combine the caller's signal with a per-turn deadline. If either fires,
 * the returned signal aborts. This prevents a runaway WebLLM stream from
 * stalling the whole conversation indefinitely.
 */
function deadlineSignal(parent?: AbortSignal, ms: number = PER_BOT_TIMEOUT_MS): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("Bot turn timed out — interrupting")), ms);
  if (parent) {
    if (parent.aborted) ctrl.abort(parent.reason);
    else parent.addEventListener("abort", () => ctrl.abort(parent.reason), { once: true });
  }
  return {
    signal: ctrl.signal,
    cancel: () => clearTimeout(timer),
  };
}

export type RunCouncilTurnOptions = {
  modelId: LocalModelId;
  roomTopic: string;
  enabledBots: Bot[];
  history: CouncilMessage[];
  /** The user message just appended to history. */
  userText: string;
  /** Append a finished message to the room (called for each bot reply). */
  appendMessage: (msg: CouncilMessage) => void;
  /** Update an in-progress bot message as text streams in. */
  updateMessage: (id: string, text: string) => void;
  signal?: AbortSignal;
};

/**
 * Drive one full conversational turn:
 *   1) Pick the responders (mentions or relevance)
 *   2) Each responds in sequence, streaming
 *   3) Optionally one extra bot reacts to a peer (50% chance)
 */
export async function* runCouncilTurn(
  opts: RunCouncilTurnOptions
): AsyncIterable<OrchestratorEvent> {
  const responders = pickResponders(opts.userText, opts.enabledBots);
  if (responders.length === 0) {
    yield { kind: "error", message: "No bots are enabled. Add at least one in Manage bots." };
    yield { kind: "all_done" };
    return;
  }

  let history = opts.history.slice();

  for (const bot of responders) {
    if (opts.signal?.aborted) {
      yield { kind: "all_done" };
      return;
    }
    yield { kind: "bot_starting", bot };
    const messageId = `bot-${bot.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const slot: CouncilMessage = {
      id: messageId,
      authorId: bot.id,
      authorName: bot.name,
      authorEmoji: bot.emoji,
      authorColor: bot.color,
      text: "",
      reactions: { heart: 0, lol: 0 },
      createdAt: Date.now(),
    };
    opts.appendMessage(slot);
    // IMPORTANT: do NOT push the empty slot into local `history` yet — buildContextMessages
    // would emit a `{role: "assistant", content: ""}` tail that WebLLM rejects.
    // We append the finalized message after the response completes.

    let finalText = "";
    const dl = deadlineSignal(opts.signal);
    try {
      for await (const chunk of streamBotTurn(bot, history, opts.enabledBots, opts.roomTopic, dl.signal)) {
        if (chunk.delta) {
          yield { kind: "bot_delta", botId: bot.id, delta: chunk.delta };
        }
        if (chunk.final !== undefined) finalText = chunk.final;
      }
    } catch (e: any) {
      finalText = finalText
        ? `${finalText}  …(cut off: ${e?.message ?? e})`
        : `(error: ${e?.message ?? e})`;
    } finally {
      dl.cancel();
    }
    if (!finalText) finalText = "(no response)";
    opts.updateMessage(messageId, finalText);
    // Now record the completed message into local history so subsequent bots see it.
    history = [...history, { ...slot, text: finalText }];
    yield { kind: "bot_done", botId: bot.id, messageId };
  }

  // Optional follow-up: 50% chance a different bot threads a short reaction
  // onto one of the previous responses (max 1 follow-up per turn for speed).
  if (responders.length >= 1 && Math.random() < 0.5) {
    const candidates = opts.enabledBots.filter(
      (b) => !responders.some((r) => r.id === b.id)
    );
    if (candidates.length > 0) {
      const reactor = candidates[Math.floor(Math.random() * candidates.length)];
      const targetMsg = history[history.length - 1];
      yield { kind: "bot_starting", bot: reactor };
      const messageId = `bot-${reactor.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const slot: CouncilMessage = {
        id: messageId,
        authorId: reactor.id,
        authorName: reactor.name,
        authorEmoji: reactor.emoji,
        authorColor: reactor.color,
        text: "",
        parentId: targetMsg.id, // threaded reply
        reactions: { heart: 0, lol: 0 },
        createdAt: Date.now(),
      };
      opts.appendMessage(slot);
      // Build the bot's prompt context from the existing history (no empty slot).
      const reactionPrompt = `${reactor.systemPrompt}

You are jumping into a live conversation as a quick reaction to ${targetMsg.authorName}'s last message. Keep it to 1-2 sentences. Either ask one sharp question or add one small but meaningful comment. Don't restate what was already said. Conversational tone — this is a meeting, not a memo.`;
      const messages = buildContextMessages(reactor, history, reactionPrompt);
      let finalText = "";
      let acc = "";
      const dl = deadlineSignal(opts.signal);
      try {
        for await (const chunk of chatStream({
          messages,
          signal: dl.signal,
          maxTokens: 160,
          temperature: 0.8,
        })) {
          if (chunk.kind === "text") {
            acc += chunk.delta;
            yield { kind: "bot_delta", botId: reactor.id, delta: chunk.delta };
          }
        }
        finalText = acc.trim();
      } catch (e: any) {
        finalText = acc.trim() || `(error: ${e?.message ?? e})`;
      } finally {
        dl.cancel();
      }
      if (!finalText) finalText = "(no response)";
      opts.updateMessage(messageId, finalText);
      yield { kind: "bot_done", botId: reactor.id, messageId };
    }
  }

  yield { kind: "all_done" };
}
