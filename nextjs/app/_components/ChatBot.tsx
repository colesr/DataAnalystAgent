"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "How do I upload data?",
  "What can the Tools tab do?",
  "How does the agent work?",
  "How do schedules work?",
];

export function ChatBot({ model }: { model: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [history, open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    const userMsg: Msg = { role: "user", text: trimmed };
    const newHistory = [...history, userMsg];
    setHistory([...newHistory, { role: "assistant", text: "" }]);
    setInput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history, model }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        setHistory((prev) => {
          const out = [...prev];
          out[out.length - 1] = {
            role: "assistant",
            text: `(error: ${errText || res.status})`,
          };
          return out;
        });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        // Update the last assistant message in place
        setHistory((prev) => {
          const out = [...prev];
          out[out.length - 1] = { role: "assistant", text: acc };
          return out;
        });
      }
    } catch (e: any) {
      setHistory((prev) => {
        const out = [...prev];
        out[out.length - 1] = { role: "assistant", text: `(error: ${e?.message ?? e})` };
        return out;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      <button
        className={`bot-fab ${open ? "active" : ""}`}
        title="Help"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <div className="bot-panel">
          <div className="bot-header">
            <span className="bot-title">Help · Digital Data Analyst</span>
            <button className="close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="bot-msgs" ref={msgsRef}>
            {history.length === 0 && (
              <div className="bot-msg bot">
                Hi! Ask me anything about how to use this app — uploading data, the tools tab,
                schedules, sharing reports, etc.
              </div>
            )}
            {history.map((m, i) => (
              <div key={i} className={`bot-msg ${m.role === "user" ? "user" : "bot"}`}>
                {m.text || (streaming && i === history.length - 1 ? "…" : "")}
              </div>
            ))}
          </div>
          {history.length === 0 && (
            <div className="bot-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="bot-input-row">
            <input
              type="text"
              placeholder="Ask anything about the app…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              disabled={streaming}
            />
            <button onClick={() => send(input)} disabled={streaming || !input.trim()}>
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
