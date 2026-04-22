"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import type { Bot, RoomKind } from "./council-bots";

const COLORS = [
  "#a78bfa", "#38bdf8", "#22d3ee", "#4ade80",
  "#facc15", "#f97316", "#f87171", "#fb7185",
];
const EMOJIS = ["🤖", "🎯", "🧠", "📚", "🔥", "🎤", "🛡️", "🌍", "♟️", "🎭", "📊", "∫", "🧮", "🕸️", "🎲", "⚙️", "🧩", "📖", "😈", "💡", "🌟"];

export function CouncilBotEditor({
  open,
  onClose,
  onSave,
  initial,
  roomKind,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (bot: Bot) => void;
  initial?: Bot;
  roomKind: RoomKind;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [shortName, setShortName] = useState(initial?.shortName ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🤖");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [expertise, setExpertise] = useState(initial?.expertise.join(", ") ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");

  useEffect(() => {
    if (open && initial) {
      setName(initial.name);
      setShortName(initial.shortName);
      setTitle(initial.title);
      setEmoji(initial.emoji);
      setColor(initial.color);
      setExpertise(initial.expertise.join(", "));
      setSystemPrompt(initial.systemPrompt);
    } else if (open) {
      setName("");
      setShortName("");
      setTitle("");
      setEmoji("🤖");
      setColor(COLORS[0]);
      setExpertise("");
      setSystemPrompt(
        `You are [name], a [title]. You bring a unique perspective to discussions about ${roomKind === "council" ? "communication and how to land a message" : "data analysis and modeling"}. Describe your background and how you think in 2-3 sentences. Then describe your conversational style — what kinds of questions you ask, what you push back on.`
      );
    }
  }, [open, initial, roomKind]);

  function save() {
    if (!name.trim() || !systemPrompt.trim()) return;
    const id = initial?.id ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const bot: Bot = {
      id,
      name: name.trim(),
      shortName: (shortName.trim() || name.trim().split(/\s+/)[0]).replace(/[^a-zA-Z0-9]/g, ""),
      title: title.trim() || "Custom Expert",
      emoji,
      color,
      expertise: expertise.split(",").map((s) => s.trim()).filter(Boolean),
      style: "balanced",
      systemPrompt: systemPrompt.trim(),
      custom: true,
    };
    onSave(bot);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `Edit ${initial.name}` : "Add a custom bot"}
      maxWidth={560}
      footer={
        <>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button
            className="primary"
            style={{ marginTop: 0 }}
            onClick={save}
            disabled={!name.trim() || !systemPrompt.trim()}
          >
            {initial ? "Save changes" : "Create bot"}
          </button>
        </>
      }
    >
      <div className="model-row">
        <div>
          <label className="lbl">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dr. Jane Doe"
          />
        </div>
        <div>
          <label className="lbl">@ tag (one word, no spaces)</label>
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="Jane"
          />
        </div>
      </div>
      <label className="lbl">Title / role</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Forecasting Expert"
      />
      <label className="lbl" style={{ marginTop: 8 }}>Avatar emoji</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className={`bot-emoji-pick ${emoji === e ? "active" : ""}`}
            onClick={() => setEmoji(e)}
          >
            {e}
          </button>
        ))}
      </div>
      <label className="lbl" style={{ marginTop: 8 }}>Avatar color</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`bot-color-pick ${color === c ? "active" : ""}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`Pick color ${c}`}
          />
        ))}
      </div>
      <label className="lbl" style={{ marginTop: 8 }}>Expertise tags (comma-separated)</label>
      <input
        value={expertise}
        onChange={(e) => setExpertise(e.target.value)}
        placeholder="forecasting, time series, ARIMA"
      />
      <label className="lbl" style={{ marginTop: 8 }}>
        Personality / system prompt
      </label>
      <textarea
        rows={6}
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        placeholder="Describe how this bot thinks, talks, what it pushes back on, what it asks about…"
      />
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
        Tip: include voice ("dry sense of humor", "warm but pointed"), what they ask
        about ("you always ask about sample size"), and what they hate ("vague nouns").
      </div>
    </Modal>
  );
}
