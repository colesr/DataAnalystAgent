"use client";

import { useEffect, useState } from "react";

type Me = {
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
  workspace: { id: string; name: string; anonymous: boolean };
};

export function AuthMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then(setMe)
      .catch(() => {});
  }, []);

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
            minWidth: 200,
            zIndex: 200,
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600 }}>{me.user.name ?? me.user.email}</div>
          {me.user.name && me.user.email && (
            <div className="muted" style={{ fontSize: 10 }}>
              {me.user.email}
            </div>
          )}
          <div className="muted" style={{ fontSize: 10, marginTop: 6 }}>
            workspace: {me.workspace.name}
          </div>
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
