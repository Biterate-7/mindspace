"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useMindspace } from "@/lib/store";

const TONE_COLOR = {
  info: "#B39CFF",
  success: "#5EE3F2",
  error: "#FF7A9A",
} as const;

export function Toasts() {
  const toasts = useMindspace((s) => s.toasts);
  const dismiss = useMindspace((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(68px,calc(env(safe-area-inset-bottom)+56px))] z-[90] flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.14 } }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
            className="px-panel pointer-events-auto flex max-w-[min(520px,100%)] items-center gap-3 py-2 pl-3 pr-1.5 text-[13px] text-ink shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
          >
            <span className="h-2 w-2 shrink-0" style={{ background: TONE_COLOR[toast.tone] }} aria-hidden="true" />
            <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="font-pixel shrink-0 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-accent hover:text-white"
                onClick={() => {
                  toast.action?.run();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className="px-icon-btn h-7 w-7 shrink-0" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
