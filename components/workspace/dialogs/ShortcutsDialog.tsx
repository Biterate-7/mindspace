"use client";

import { Dialog } from "@/components/ui/Dialog";
import { SHORTCUTS, type ShortcutDoc } from "@/lib/shortcuts/keymap";

const GROUPS: ShortcutDoc["group"][] = ["Create", "Navigate", "Edit", "View"];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" eyebrow="Flight controls" width={640}>
      <div className="grid max-h-[70vh] gap-x-8 gap-y-5 overflow-y-auto px-5 py-4 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group}>
            <h3 className="px-caption mb-2">{group}</h3>
            <ul className="flex flex-col">
              {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => (
                <li key={shortcut.label} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 text-[13px] text-ink-2 last:border-0">
                  <span>{shortcut.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd key={key} className="px-kbd">
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="border-t border-line px-5 py-3 text-[12px] text-ink-3">Shortcuts pause while you type in a field. Press Esc to step back out.</p>
    </Dialog>
  );
}
