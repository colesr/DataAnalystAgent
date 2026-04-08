"use client";

import { useEffect, useState } from "react";

type Me = {
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
  workspace: { id: string; name: string; anonymous: boolean };
};

type WorkspaceListItem = {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
};

export function AuthMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [wsList, setWsList] = useState<WorkspaceListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then(setMe)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!me?.user) return;
    fetch("/api/workspaces", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setWsList(d.workspaces ?? []))
      .catch(() => {});
  }, [me]);

  async function switchWorkspace(id: string) {
    if (id === me?.workspace.id) {
      setOpen(false);
      return;
    }
    try {
      const res = await fetch(`/api/workspaces/${id}/switch`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      window.location.reload();
    } catch (e: any) {
      alert(`Switch failed: ${e?.message ?? e}`);
    }
  }

  async function createWorkspace() {
    const name = window.prompt("New workspace name:");
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Switch to the new one straight away.
      await fetch(`/api/workspaces/${data.id}/switch`, { method: "POST" });
      window.location.reload();
    } catch (e: any) {
      alert(`Create failed: ${e?.message ?? e}`);
    } finally {
      setCreating(false);
    }
  }

  if (!me) return null;

  if (!me.user) {
    return (
      <a
        className="icon-btn"
        href="/api/auth/signin?callbackUrl=/"
        title="Sign in"
        style={{ width: "auto", padding: "0 8px" }}
      >
        Sign in
      </a>
    );
  }

  const initial = (me.user.name ?? me.user.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <div style={{ position: "relative" }}>
      <button
        className="icon-btn"
        title={me.user.email ?? me.user.name ?? "account"}
        onClick={() => setOpen((v) => !v)}
        style={{ width: "auto", padding: "0 6px", gap: 6, display: "inline-flex" }}
      >
        {me.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.user.image}
            alt=""
            style={{ width: 20, height: 20, borderRadius: "50%" }}
          />
        ) : (
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--accent)",
              color: "#000",
              display: "grid",
              placeItems: "center",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {initial}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: 32,
            right: 0,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 10,
            minWidth: 240,
            zIndex: 200,
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            {me.user.name ?? me.user.email}
          </div>
          {me.user.name && me.user.email && (
            <div className="muted" style={{ fontSize: 10 }}>
              {me.user.email}
            </div>
          )}

          <div
            className="muted"
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginTop: 10,
              marginBottom: 4,
            }}
          >
            Workspaces
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {wsList.map((w) => {
              const isActive = w.id === me.workspace.id;
              return (
                <button
                  key={w.id}
                  className="ghost"
                  onClick={() => switchWorkspace(w.id)}
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    borderColor: isActive ? "var(--accent)" : "var(--border)",
                    color: isActive ? "var(--accent)" : "var(--text)",
                    margin: 0,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 11 }}>
                    {isActive && "✓ "}
                    {w.name}
                  </div>
                  <div className="muted" style={{ fontSize: 9 }}>
                    {w.role}
                  </div>
                </button>
              );
            })}
          </div>
          <button
            className="ghost"
            onClick={createWorkspace}
            disabled={creating}
            style={{ display: "block", marginTop: 6, width: "100%", textAlign: "center" }}
          >
            + New workspace
          </button>
          <a
            href={`/workspaces/${me.workspace.id}/settings`}
            className="ghost"
            style={{
              display: "block",
              marginTop: 4,
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            Manage workspace
          </a>

          <a
            href="/api/auth/signout?callbackUrl=/"
            className="ghost"
            style={{
              display: "block",
              marginTop: 8,
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            Sign out
          </a>
        </div>
      )}
    </div>
  );
}
