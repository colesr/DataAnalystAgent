"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight modal dialog. Uses the existing .modal-backdrop / .modal CSS
 * from globals.css so it picks up theme styling for free.
 *
 * Closes on Escape and on backdrop click. Auto-focuses the first focusable
 * element inside `children` after mount.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 480,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Auto-focus first input/textarea/button inside the modal.
    const t = setTimeout(() => {
      const focusable = modalRef.current?.querySelector<HTMLElement>(
        "input, textarea, select, button"
      );
      focusable?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={modalRef} className="modal" style={{ maxWidth }}>
        <h3>
          {title}
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </h3>
        {children}
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 6,
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
