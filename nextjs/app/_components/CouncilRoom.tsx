"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_BOARDROOM_BOTS,
  DEFAULT_COUNCIL_BOTS,
  loadBots,
  loadEnabledIds,
  saveCustomBots,
  saveEnabledIds,
  type Bot,
  type RoomKind,
} from "./council-bots";
import { CouncilBotEditor } from "./CouncilBotEditor";
import {
  runCouncilTurn,
  type CouncilMessage,
} from "./council-orchestrator";
import { hasWebGPU, isLoaded as isLocalLoaded, type LocalModelId } from "./webllm-client";

const ROOM_TITLES: Record<RoomKind, string> = {
  council: "AI Council",
  boardroom: "AI Council Boardroom",
};
const ROOM_TAGLINES: Record<RoomKind, string> = {
  council: "Communication, persuasion, and presence experts",
  boardroom: "Statisticians, mathematicians, and analytical thinkers",
};

export function CouncilRoom({
  open,
  onClose,
  kind,
  modelId,
  onRequestModelSetup,
}: {
  open: boolean;
  onClose: () => void;
  kind: RoomKind;
  modelId: LocalModelId | null;
  onRequestModelSetup: () => void;
}) {
  const [allBots, setAllBots] = useState<Bot[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<CouncilMessage[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot | undefined>(undefined);
  const [managePanelOpen, setManagePanelOpen] = useState(false);
  const [showMentionList, setShowMentionList] = useState(false);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate bot list + enabled set from localStorage on mount.
  useEffect(() => {
    const bs = loadBots(kind);
    setAllBots(bs);
    setEnabledIds(loadEnabledIds(kind, bs));
  }, [kind]);

  const enabledBots = useMemo(
    () => allBots.filter((b) => enabledIds.has(b.id)),
    [allBots, enabledIds]
  );

  // Auto-scroll to newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, running]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || running) return;
    if (!hasWebGPU()) {
      setError("WebGPU isn't available — try Chrome / Edge / Brave on desktop.");
      return;
    }
    if (!modelId || !isLocalLoaded(modelId)) {
      onRequestModelSetup();
      return;
    }
    if (enabledBots.length === 0) {
      setError("Add at least one bot in 'Manage bots' to start a conversation.");
      return;
    }
    setError(null);
    const userMsg: CouncilMessage = {
      id: `user-${Date.now()}`,
      authorId: "user",
      authorName: "You",
      text,
      reactions: { heart: 0, lol: 0 },
      createdAt: Date.now(),
    };
    const histAfterUser = [...messages, userMsg];
    setMessages(histAfterUser);
    setInput("");
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      for await (const ev of runCouncilTurn({
        modelId,
        roomTopic: ROOM_TITLES[kind],
        enabledBots,
        history: histAfterUser,
        userText: text,
        appendMessage: (m) => setMessages((prev) => [...prev, m]),
        updateMessage: (id, t) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, text: t } : m))
          ),
        signal: ctrl.signal,
      })) {
        if (ev.kind === "bot_starting") setActiveBotId(ev.bot.id);
        else if (ev.kind === "bot_delta") {
          setMessages((prev) =>
            prev.map((m, i) => {
              if (i === prev.length - 1 && m.authorId === ev.botId) {
                return { ...m, text: m.text + ev.delta };
              }
              return m;
            })
          );
        } else if (ev.kind === "bot_done") {
          setActiveBotId(null);
        } else if (ev.kind === "error") {
          setError(ev.message);
        } else if (ev.kind === "all_done") {
          setActiveBotId(null);
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
      abortRef.current = null;
      setActiveBotId(null);
    }
  }, [input, running, modelId, enabledBots, messages, kind, onRequestModelSetup]);

  function stop() {
    abortRef.current?.abort();
  }

  function react(messageId: string, kind: "heart" | "lol") {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, reactions: { ...m.reactions, [kind]: m.reactions[kind] + 1 } }
          : m
      )
    );
  }

  function clearChat() {
    if (running) return;
    setMessages([]);
    setError(null);
  }

  function toggleEnabled(botId: string) {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(botId)) next.delete(botId);
      else next.add(botId);
      saveEnabledIds(kind, next);
      return next;
    });
  }

  function handleSaveBot(bot: Bot) {
    setAllBots((prev) => {
      const existingIdx = prev.findIndex((b) => b.id === bot.id);
      const next = existingIdx >= 0
        ? prev.map((b) => (b.id === bot.id ? bot : b))
        : [...prev, bot];
      saveCustomBots(kind, next);
      return next;
    });
    // New custom bots default to enabled
    setEnabledIds((prev) => {
      if (prev.has(bot.id)) return prev;
      const next = new Set(prev);
      next.add(bot.id);
      saveEnabledIds(kind, next);
      return next;
    });
  }

  function deleteCustomBot(botId: string) {
    if (!confirm("Delete this custom bot?")) return;
    setAllBots((prev) => {
      const next = prev.filter((b) => b.id !== botId);
      saveCustomBots(kind, next);
      return next;
    });
    setEnabledIds((prev) => {
      if (!prev.has(botId)) return prev;
      const next = new Set(prev);
      next.delete(botId);
      saveEnabledIds(kind, next);
      return next;
    });
  }

  function insertMention(bot: Bot) {
    setInput((prev) => prev + (prev.endsWith(" ") || prev.length === 0 ? "" : " ") + `@${bot.shortName} `);
    setShowMentionList(false);
    inputRef.current?.focus();
  }

  // Build threaded message tree: top-level messages with their replies grouped.
  const threaded = useMemo(() => {
    const top: CouncilMessage[] = messages.filter((m) => !m.parentId);
    const byParent = new Map<string, CouncilMessage[]>();
    for (const m of messages) {
      if (m.parentId) {
        if (!byParent.has(m.parentId)) byParent.set(m.parentId, []);
        byParent.get(m.parentId)!.push(m);
      }
    }
    return top.map((m) => ({ msg: m, replies: byParent.get(m.id) ?? [] }));
  }, [messages]);

  if (!open) return null;
  return (
    <aside className="council-room" role="dialog" aria-label={ROOM_TITLES[kind]}>
      <header className="council-header">
        <div>
          <div className="council-title">
            {kind === "council" ? "🏛️" : "📊"} {ROOM_TITLES[kind]}
          </div>
          <div className="council-sub muted">
            {ROOM_TAGLINES[kind]} · {enabledBots.length}/{allBots.length} active
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className="icon-btn"
            title="Manage bots"
            onClick={() => setManagePanelOpen((v) => !v)}
          >
            ☰
          </button>
          {messages.length > 0 && (
            <button
              className="icon-btn"
              title="Clear conversation"
              onClick={clearChat}
              disabled={running}
            >
              ↺
            </button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
      </header>

      {managePanelOpen && (
        <div className="council-manage">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Bots in this room
            </h4>
            <button
              className="ghost tiny"
              onClick={() => {
                setEditingBot(undefined);
                setEditorOpen(true);
              }}
            >
              + Add custom
            </button>
          </div>
          {allBots.map((b) => (
            <div key={b.id} className="bot-row">
              <input
                type="checkbox"
                checked={enabledIds.has(b.id)}
                onChange={() => toggleEnabled(b.id)}
              />
              <span
                className="bot-avatar"
                style={{ background: b.color }}
                title={b.title}
              >
                {b.emoji}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{b.name}</div>
                <div className="muted" style={{ fontSize: 10 }}>
                  {b.title} · @{b.shortName}
                </div>
              </div>
              {b.custom && (
                <>
                  <button
                    className="ghost tiny"
                    onClick={() => {
                      setEditingBot(b);
                      setEditorOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button className="ghost tiny danger" onClick={() => deleteCustomBot(b.id)}>
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="council-body" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="council-empty muted">
            <p style={{ marginTop: 0 }}>
              Welcome to the {ROOM_TITLES[kind]}. Type a question or topic and your active
              experts will weigh in. Use <kbd>@FirstName</kbd> to direct a question at a
              specific bot.
            </p>
            <p className="muted">
              Active right now: {enabledBots.map((b) => `@${b.shortName}`).join(", ") || "(none)"}
            </p>
          </div>
        ) : (
          threaded.map(({ msg, replies }) => (
            <div key={msg.id}>
              <CouncilMessageView
                msg={msg}
                onReact={react}
                streaming={running && msg.text === "" && msg.id.startsWith("bot-")}
              />
              {replies.map((r) => (
                <div key={r.id} className="council-reply">
                  <CouncilMessageView
                    msg={r}
                    onReact={react}
                    streaming={running && r.text === ""}
                  />
                </div>
              ))}
            </div>
          ))
        )}
        {running && activeBotId && (
          <div className="muted council-typing">
            {(allBots.find((b) => b.id === activeBotId)?.shortName ?? "someone")} is thinking…
          </div>
        )}
        {error && <div className="webllm-err" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      <footer className="council-footer">
        {showMentionList && (
          <div className="mention-list">
            {enabledBots.map((b) => (
              <button key={b.id} className="mention-pick" onClick={() => insertMention(b)}>
                <span className="bot-avatar tiny" style={{ background: b.color }}>{b.emoji}</span>
                @{b.shortName}
                <span className="muted" style={{ marginLeft: 6, fontSize: 10 }}>
                  {b.title}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="council-input-row">
          <button
            className="ghost tiny"
            onClick={() => setShowMentionList((v) => !v)}
            title="Insert @mention"
            style={{ marginTop: 0 }}
          >
            @
          </button>
          <textarea
            ref={inputRef}
            rows={2}
            placeholder={
              enabledBots.length === 0
                ? "Click ☰ to enable bots first…"
                : `Ask the ${kind === "council" ? "council" : "boardroom"}… (use @${enabledBots[0]?.shortName ?? "Name"} to target)`
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={running}
          />
          {running ? (
            <button className="ghost" onClick={stop}>Stop</button>
          ) : (
            <button
              className="primary"
              style={{ marginTop: 0 }}
              onClick={send}
              disabled={!input.trim() || enabledBots.length === 0}
            >
              Send
            </button>
          )}
        </div>
      </footer>

      <CouncilBotEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveBot}
        initial={editingBot}
        roomKind={kind}
      />
    </aside>
  );
}

function CouncilMessageView({
  msg,
  onReact,
  streaming,
}: {
  msg: CouncilMessage;
  onReact: (id: string, kind: "heart" | "lol") => void;
  streaming?: boolean;
}) {
  const isUser = msg.authorId === "user";
  return (
    <div className={`council-msg ${isUser ? "user" : "bot"}`}>
      {!isUser && (
        <div className="bot-avatar" style={{ background: msg.authorColor ?? "#666" }}>
          {msg.authorEmoji ?? "🤖"}
        </div>
      )}
      <div className="council-msg-body">
        {!isUser && (
          <div className="council-msg-author">{msg.authorName}</div>
        )}
        <div className="council-msg-bubble">
          {msg.text || (streaming ? "…" : "")}
        </div>
        <div className="council-msg-actions">
          <button
            type="button"
            className="reaction-btn"
            onClick={() => onReact(msg.id, "heart")}
            aria-label="Like"
          >
            <span className="reaction-emoji">❤️</span>
            {msg.reactions.heart > 0 && <span className="reaction-count">{msg.reactions.heart}</span>}
          </button>
          <button
            type="button"
            className="reaction-btn"
            onClick={() => onReact(msg.id, "lol")}
            aria-label="Funny"
          >
            <span className="reaction-emoji">😂</span>
            {msg.reactions.lol > 0 && <span className="reaction-count">{msg.reactions.lol}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

// Re-export for page.tsx convenience
export { DEFAULT_COUNCIL_BOTS, DEFAULT_BOARDROOM_BOTS };
