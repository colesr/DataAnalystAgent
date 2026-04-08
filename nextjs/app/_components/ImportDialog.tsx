"use client";

import { useState } from "react";
import { Modal } from "./Modal";

type ImportSource = "url" | "gsheet" | "postgres";

export type ImportResult = {
  id: string;
  name: string;
  tableName: string;
  rowCount: number;
};

export function ImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (result: ImportResult, source: ImportSource) => void;
}) {
  const [source, setSource] = useState<ImportSource>("url");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL / Sheet shared
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  // Postgres only
  const [dsn, setDsn] = useState("");
  const [query, setQuery] = useState("");

  function reset() {
    setUrl("");
    setName("");
    setDsn("");
    setQuery("");
    setError(null);
    setBusy(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let endpoint: string;
      let body: object;
      if (source === "url") {
        if (!url.trim()) throw new Error("URL is required");
        endpoint = "/api/datasets/import-url";
        body = { url: url.trim(), name: name.trim() || undefined };
      } else if (source === "gsheet") {
        if (!url.trim()) throw new Error("Sheet URL is required");
        endpoint = "/api/datasets/import-gsheet";
        body = { url: url.trim(), name: name.trim() || undefined };
      } else {
        if (!dsn.trim()) throw new Error("DSN is required");
        if (!query.trim()) throw new Error("Query is required");
        endpoint = "/api/datasets/import-postgres";
        body = {
          dsn: dsn.trim(),
          query: query.trim(),
          name: name.trim() || undefined,
        };
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onImported(data, source);
      reset();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import data"
      maxWidth={520}
      footer={
        <>
          <button className="ghost" onClick={handleClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={submit} disabled={busy} style={{ marginTop: 0 }}>
            {busy ? "Importing…" : "Import"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["url", "gsheet", "postgres"] as ImportSource[]).map((s) => (
          <button
            key={s}
            className={`chip ${source === s ? "active" : ""}`}
            onClick={() => setSource(s)}
            disabled={busy}
          >
            {s === "url" ? "URL" : s === "gsheet" ? "Google Sheet" : "Postgres"}
          </button>
        ))}
      </div>

      {(source === "url" || source === "gsheet") && (
        <>
          <label className="lbl">
            {source === "url" ? "CSV / XLSX URL" : "Google Sheet URL (must be public)"}
          </label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={
              source === "url"
                ? "https://example.com/data.csv"
                : "https://docs.google.com/spreadsheets/d/…"
            }
            disabled={busy}
          />
        </>
      )}

      {source === "postgres" && (
        <>
          <label className="lbl" style={{ marginTop: 0 }}>
            Connection string
          </label>
          <input
            value={dsn}
            onChange={(e) => setDsn(e.target.value)}
            placeholder="postgres://user:pass@host:5432/db"
            disabled={busy}
            type="password"
          />
          <label className="lbl" style={{ marginTop: 8 }}>
            SELECT query
          </label>
          <textarea
            className="code"
            rows={4}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SELECT * FROM public.orders LIMIT 1000"
            disabled={busy}
          />
          <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
            DSN is held only for this request, never stored.
          </div>
        </>
      )}

      <label className="lbl" style={{ marginTop: 8 }}>
        Name for the imported table (optional)
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="auto-detected from source"
        disabled={busy}
      />

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            border: "1px solid var(--err)",
            borderRadius: 4,
            color: "var(--err)",
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}
    </Modal>
  );
}
