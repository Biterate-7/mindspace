"use client";

import { Dialog } from "@/components/ui/Dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} eyebrow="Confirm" width={420}>
      <p className="px-5 py-4 text-[13.5px] leading-relaxed text-ink-2">{body}</p>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <button type="button" className="px-btn" onClick={onClose} data-autofocus>
          Cancel
        </button>
        <button
          type="button"
          className="px-btn border-[rgba(255,122,154,0.45)] bg-[rgba(255,122,154,0.12)] text-[#ffd0dc] hover:!border-[rgba(255,122,154,0.7)] hover:!bg-[rgba(255,122,154,0.2)]"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
