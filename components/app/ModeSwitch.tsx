"use client";

import { PixelIcon } from "@/components/ui/PixelIcon";
import { useMindspace } from "@/lib/store";
import type { AppMode } from "@/lib/store/types";

const MODES: Array<{ mode: AppMode; label: string; icon: "star" | "telescope"; hint: string }> = [
  { mode: "create", label: "Create", icon: "star", hint: "Map your own thinking" },
  { mode: "discovery", label: "Discovery", icon: "telescope", hint: "Research a question with web sources" },
];

/** Top-level navigation between Create (your own maps) and Discovery (research workspaces). */
export function ModeSwitch({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const mode = useMindspace((s) => s.mode);
  const switchMode = useMindspace((s) => s.switchMode);
  return (
    <nav aria-label="Mode" className={`flex shrink-0 border border-line bg-void/50 p-0.5 ${className}`}>
      {MODES.map((item) => {
        const active = mode === item.mode;
        return (
          <button
            key={item.mode}
            type="button"
            onClick={() => switchMode(item.mode)}
            aria-current={active ? "page" : undefined}
            title={item.hint}
            aria-label={compact ? item.label : undefined}
            className={`font-pixel flex h-7 items-center gap-1.5 px-2 text-[8px] uppercase tracking-[0.12em] transition-colors sm:px-2.5 ${
              active ? "bg-accent/15 text-ink" : "text-ink-3 hover:bg-white/[0.04] hover:text-ink-2"
            }`}
          >
            <PixelIcon name={item.icon} scale={1} className={active ? (item.mode === "discovery" ? "text-cyan" : "text-accent") : ""} />
            {!compact && <span>{item.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}
