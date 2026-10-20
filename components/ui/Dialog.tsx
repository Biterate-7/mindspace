"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  width?: number;
  /** Rendered at the top of the panel instead of the default header (e.g. a search field). */
  header?: ReactNode;
  align?: "center" | "top";
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal shell with focus management, Escape to close and focus restore. */
export function Dialog({ open, onClose, title, eyebrow, children, width = 460, header, align = "center" }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 z-[80] flex justify-center bg-[#020309]/70 px-4 backdrop-blur-[2px] ${align === "top" ? "items-start pt-[14vh]" : "items-center"}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="px-panel px-rivets w-full max-w-full shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
            style={{ width }}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.9, 0.3, 1] }}
          >
            {header ?? (
              <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div>
                  {eyebrow && <p className="px-caption mb-1.5">{eyebrow}</p>}
                  <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
                </div>
                <button type="button" className="px-icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close dialog">
                  <X size={16} />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
