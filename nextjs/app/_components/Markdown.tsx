"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Themed markdown renderer for agent reports + the public share page.
 * Picks up the global CSS variables so it slots into both dark and light themes.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div
      className="md"
      style={{
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--text)",
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => (
            <h2
              style={{ fontSize: 16, fontWeight: 700, margin: "16px 0 8px" }}
              {...p}
            />
          ),
          h2: (p) => (
            <h3
              style={{ fontSize: 14, fontWeight: 700, margin: "14px 0 6px" }}
              {...p}
            />
          ),
          h3: (p) => (
            <h4
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--muted)",
                margin: "12px 0 4px",
              }}
              {...p}
            />
          ),
          p: (p) => <p style={{ margin: "6px 0" }} {...p} />,
          ul: (p) => <ul style={{ margin: "4px 0 8px 20px" }} {...p} />,
          ol: (p) => <ol style={{ margin: "4px 0 8px 20px" }} {...p} />,
          li: (p) => <li style={{ margin: "2px 0" }} {...p} />,
          strong: (p) => <strong style={{ color: "var(--text)" }} {...p} />,
          em: (p) => <em {...p} />,
          code: (p) => (
            <code
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                padding: "0 4px",
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
              }}
              {...p}
            />
          ),
          pre: (p) => (
            <pre
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: 10,
                fontSize: 11,
                overflow: "auto",
              }}
              {...p}
            />
          ),
          blockquote: (p) => (
            <blockquote
              style={{
                borderLeft: "2px solid var(--accent)",
                paddingLeft: 10,
                margin: "8px 0",
                color: "var(--muted)",
              }}
              {...p}
            />
          ),
          table: (p) => (
            <div className="db-scroll" style={{ marginTop: 6 }}>
              <table className="db-table" {...p} />
            </div>
          ),
          a: (p) => (
            <a style={{ color: "var(--accent)", textDecoration: "underline" }} {...p} />
          ),
          hr: () => (
            <hr
              style={{
                border: 0,
                borderTop: "1px solid var(--border)",
                margin: "12px 0",
              }}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
