"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runCoach, type CoachAction, type CoachActionCard, type CoachMessage } from "./coach-agent";
import { hasWebGPU, isLoaded as isLocalLoaded, type LocalModelId } from "./webllm-client";

export type CoachHandlers = {
  onAction: (action: CoachAction) => void;
  onRequestModelSetup: () => void;
};

const SUGGESTED_OPENERS = [
  "Where do I start?",
  "What can this app do?",
  "How do I clean my data?",
  "Walk me through making a dashboard",
];

export function CoachButton({
  open,
  onOpenChange,
  currentStepLabel,
  datasetCount,
  hasSavedAnalyses,
  modelId,
  handlers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStepLabel: string;
  datasetCount: number;
  hasSavedAnalyses: boolean;
  /** Local model id to use. If null, the coach prompts the user to set up local AI. */
  modelId: LocalModelId | null;
  handlers: CoachHandlers;
}) {
  const [history, setHistory] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Close on Escape (only when input isn't focused on an in-flight request).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !running) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, running]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, running]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || running) return;
      if (!hasWebGPU()) {
        setError(
          "WebGPU isn't available in this browser. Try Chrome / Edge / Brave on desktop."
        );
        return;
      }
      if (!modelId) {
        handlers.onRequestModelSetup();
        return;
      }
      if (!isLocalLoaded(modelId)) {
        handlers.onRequestModelSetup();
        return;
      }
      setError(null);
      const next = [...history, { role: "user" as const, text: trimmed }];
      setHistory(next);
      setInput("");
      setRunning(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      let assistantText = "";
      let actions: CoachActionCard[] = [];
      // Reserve an empty assistant slot so streaming text appends in place.
      setHistory((h) => [...h, { role: "assistant", text: "" }]);

      try {
        for await (const chunk of runCoach({
          modelId,
          history,
          userMessage: trimmed,
          ctx: { currentStepLabel, datasetCount, hasSavedAnalyses },
          signal: ctrl.signal,
        })) {
          if (chunk.kind === "text") {
            assistantText += chunk.delta;
            setHistory((h) => {
              const copy = h.slice();
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = { role: "assistant", text: assistantText, actions };
              }
              return copy;
            });
          } else if (chunk.kind === "actions") {
            actions = chunk.cards;
            setHistory((h) => {
              const copy = h.slice();
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") {
                copy[copy.length - 1] = { role: "assistant", text: assistantText, actions };
              }
              return copy;
            });
          } else if (chunk.kind === "error") {
            setError(chunk.message);
          }
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message ?? String(e));
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    [running, modelId, history, currentStepLabel, datasetCount, hasSavedAnalyses, handlers]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => {
    setHistory([]);
    setError(null);
  }, []);

  const onActionClick = useCallback(
    (a: CoachAction) => {
      handlers.onAction(a);
      // Close the panel for navigation actions so the user sees the result.
      if (a.kind !== "open_palette") onOpenChange(false);
    },
    [handlers, onOpenChange]
  );

  return (
    <>
      <button
        type="button"
        className={`coach-fab ${open ? "open" : ""}`}
        title="Coach — ask anything about how to use the app"
        aria-label="Open coach"
        onClick={() => onOpenChange(!open)}
      >
        ◉
        <span className="coach-fab-label">Coach</span>
      </button>
      {open && (
        <aside className="coach-panel" role="dialog" aria-label="Coach">
          <header className="coach-panel-header">
            <div>
              <div className="coach-panel-title">Coach</div>
              <div className="coach-panel-sub muted">on {currentStepLabel}</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {history.length > 0 && (
                <button className="icon-btn" title="Clear chat" onClick={reset}>
                  ↺
                </button>
              )}
              <button className="icon-btn" onClick={() => onOpenChange(false)} aria-label="Close">
                ×
              </button>
            </div>
          </header>

          <div className="coach-panel-body" ref={scrollRef}>
            {history.length === 0 ? (
              <div className="coach-empty">
                <p className="muted" style={{ marginTop: 0 }}>
                  Hi — I'm your in-app guide. Ask me anything about how to use Digital Coworker
                  or what to do next on whichever step you're on.
                </p>
                {!modelId || !isLocalLoaded(modelId ?? ("" as LocalModelId)) ? (
                  <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                    Local AI hasn't been loaded yet. The first message will prompt the one-time
                    download.
                  </div>
                ) : null}
                <div className="coach-openers">
                  {SUGGESTED_OPENERS.map((q) => (
                    <button key={q} className="coach-opener" onClick={() => send(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              history.map((m, i) => (
                <div key={i} className={`coach-msg ${m.role}`}>
                  <div className="coach-msg-bubble">{m.text || (running && i === history.length - 1 ? "…" : "")}</div>
                  {m.role === "assistant" && m.actions && m.actions.length > 0 && (
                    <div className="coach-actions">
                      {m.actions.map((a, j) => (
                        <button
                          key={j}
                          className="coach-action"
                          onClick={() => onActionClick(a.action)}
                        >
                          {a.label} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            {error && <div className="webllm-err" style={{ marginTop: 8 }}>{error}</div>}
          </div>

          <footer className="coach-panel-footer">
            <textarea
              rows={2}
              placeholder="Ask the coach…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  send(input);
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              disabled={running}
            />
            {running ? (
              <button className="ghost" onClick={stop}>
                Stop
              </button>
            ) : (
              <button
                className="primary"
                style={{ marginTop: 0 }}
                onClick={() => send(input)}
                disabled={!input.trim()}
              >
                Send
              </button>
            )}
          </footer>
        </aside>
      )}
    </>
  );
}
