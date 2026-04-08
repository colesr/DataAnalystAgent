"use client";

import { useState } from "react";

export function AcceptInviteButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    try {
      const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      window.location.href = "/";
    } catch (e: any) {
      alert(`Accept failed: ${e?.message ?? e}`);
      setBusy(false);
    }
  }

  return (
    <button className="primary" onClick={accept} disabled={busy}>
      {busy ? "Accepting…" : "Accept invite"}
    </button>
  );
}
