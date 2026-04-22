"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import {
  DEFAULT_LOCAL_MODEL,
  LOCAL_MODELS,
  type LocalModelId,
  type LoadProgress,
  ensureEngine,
  hasWebGPU,
} from "./webllm-client";

const STORAGE_KEY = "dda_local_model";

export function getStoredLocalModel(): LocalModelId {
  if (typeof window === "undefined") return DEFAULT_LOCAL_MODEL;
  try {
    const v = localStorage.getItem(STORAGE_KEY) as LocalModelId | null;
    if (v && LOCAL_MODELS.find((m) => m.id === v)) return v;
  } catch {}
  return DEFAULT_LOCAL_MODEL;
}

/**
 * First-run download UX. Opens automatically the first time the user picks
 * a local model and triggers a run; can also be invoked manually from
 * settings to switch models or kick off a re-download.
 */
export function WebLLMSetup({
  open,
  onClose,
  onReady,
  initialModel,
}: {
  open: boolean;
  onClose: () => void;
  onReady: (modelId: LocalModelId) => void;
  initialModel?: LocalModelId;
}) {
  const [selected, setSelected] = useState<LocalModelId>(initialModel ?? getStoredLocalModel());
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const webgpu = typeof window !== "undefined" ? hasWebGPU() : true;

  useEffect(() => {
    if (open) {
      setError(null);
      setProgress(null);
      setLoading(false);
    }
  }, [open]);

  async function start() {
    setError(null);
    setProgress({ text: "Initializing…" });
    setLoading(true);
    try {
      await ensureEngine(selected, (p) => setProgress(p));
      try {
        localStorage.setItem(STORAGE_KEY, selected);
      } catch {}
      onReady(selected);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title="Local AI — first-time setup"
      maxWidth={520}
      footer={
        <>
          <button className="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="primary"
            style={{ marginTop: 0 }}
            onClick={start}
            disabled={loading || !webgpu}
          >
            {loading ? "Downloading…" : "Download & start"}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
        {!webgpu ? (
          <p style={{ color: "var(--err)" }}>
            <strong>Your browser doesn't support WebGPU.</strong> Local AI requires Chrome,
            Edge, Brave (desktop), or Safari 18+. You can still use the app's deterministic
            tools without AI, or paste a cloud API key under Workbench → Settings.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 10px" }}>
              Digital Coworker runs the AI right in your browser — no API key, no usage cost,
              your data never leaves this machine. The first time you use it, the model
              weights are downloaded and cached forever after.
            </p>
            <label className="lbl">Pick a model</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {LOCAL_MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`local-model-row ${selected === m.id ? "active" : ""}`}
                >
                  <input
                    type="radio"
                    name="local-model"
                    value={m.id}
                    checked={selected === m.id}
                    onChange={() => setSelected(m.id)}
                    disabled={loading}
                  />
                  <div>
                    <div className="local-model-row-label">
                      {m.label} <span className="muted">· ~{m.approxSizeGb} GB</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {m.notes}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {progress && (
              <div className="webllm-progress">
                <div className="webllm-progress-bar">
                  <div
                    className="webllm-progress-fill"
                    style={{ width: `${Math.round((progress.progress ?? 0) * 100)}%` }}
                  />
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                  {progress.text}
                </div>
              </div>
            )}

            {error && (
              <div className="webllm-err" style={{ marginTop: 10 }}>
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
