"use client";

import { useCallback, useEffect, useState } from "react";

type Member = {
  userId: string;
  role: "owner" | "editor" | "viewer";
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
};

type Invite = {
  token: string;
  role: string;
  email: string | null;
  createdAt: string;
};

export function WorkspaceSettingsClient({
  workspaceId,
  workspaceName,
  myRole,
}: {
  workspaceId: string;
  workspaceName: string;
  myRole: "owner" | "editor" | "viewer";
}) {
  const [name, setName] = useState(workspaceName);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "editor" | "viewer">("editor");

  const isOwner = myRole === "owner";

  const fetchMembers = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/members`, { cache: "no-store" });
    if (res.ok) setMembers((await res.json()).members);
  }, [workspaceId]);

  const fetchInvites = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/invites`, { cache: "no-store" });
    if (res.ok) setInvites((await res.json()).invites);
  }, [workspaceId]);

  useEffect(() => {
    fetchMembers();
    if (isOwner) fetchInvites();
  }, [fetchMembers, fetchInvites, isOwner]);

  async function rename() {
    if (name.trim() === workspaceName) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      window.location.reload();
    } catch (e: any) {
      alert(`Rename failed: ${e?.message ?? e}`);
    }
  }

  async function deleteWorkspace() {
    if (
      !confirm(
        `Permanently delete "${workspaceName}"? This drops the entire schema (every uploaded table) and removes all members.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      window.location.href = "/";
    } catch (e: any) {
      alert(`Delete failed: ${e?.message ?? e}`);
    }
  }

  async function removeMember(userId: string, label: string) {
    if (!confirm(`Remove ${label}?`)) return;
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/members?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchMembers();
    } catch (e: any) {
      alert(`Remove failed: ${e?.message ?? e}`);
    }
  }

  async function createInvite() {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: inviteRole, email: inviteEmail || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInviteEmail("");
      await fetchInvites();
    } catch (e: any) {
      alert(`Invite failed: ${e?.message ?? e}`);
    }
  }

  async function revokeInvite(token: string) {
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/invites?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchInvites();
    } catch (e: any) {
      alert(`Revoke failed: ${e?.message ?? e}`);
    }
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard
      .writeText(url)
      .then(() => alert("Invite link copied"))
      .catch(() => alert(url));
  }

  return (
    <>
      {isOwner && (
        <div className="card">
          <h3>Workspace name</h3>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" onClick={rename}>
            Rename
          </button>
        </div>
      )}

      <div className="card">
        <h3>
          Members <span className="badge">{members.length}</span>
        </h3>
        {members.map((m) => (
          <div key={m.userId} className="saved-row">
            <div className="name" style={{ flex: 1 }}>
              {m.name ?? m.email ?? m.userId}
              <div className="meta">
                {m.email} · {m.role}
              </div>
            </div>
            {isOwner && (
              <button
                className="ghost tiny danger"
                onClick={() => removeMember(m.userId, m.name ?? m.email ?? m.userId)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <div className="card">
          <h3>
            Invites <span className="badge">{invites.length}</span>
          </h3>
          <div className="muted" style={{ marginBottom: 8 }}>
            Generate a token and share the link. Optional email locks the invite to that account.
          </div>
          {invites.map((inv) => (
            <div key={inv.token} className="qh-row">
              <span className="qh-source">{inv.role}</span>
              <span className="qh-sql" style={{ whiteSpace: "normal" }}>
                {inv.email ?? "anyone with the link"} ·{" "}
                <code>/invite/{inv.token.slice(0, 10)}…</code>
              </span>
              <button className="ghost tiny" onClick={() => copyInviteLink(inv.token)}>
                Copy link
              </button>
              <button className="ghost tiny danger" onClick={() => revokeInvite(inv.token)}>
                Revoke
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              placeholder="email (optional)"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)}>
              <option value="owner">owner</option>
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button className="primary" style={{ marginTop: 0 }} onClick={createInvite}>
              + Invite
            </button>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="card" style={{ borderColor: "var(--err)" }}>
          <h3 style={{ color: "var(--err)" }}>Danger zone</h3>
          <button className="ghost danger" onClick={deleteWorkspace}>
            Delete this workspace permanently
          </button>
        </div>
      )}
    </>
  );
}
