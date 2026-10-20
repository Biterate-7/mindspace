"use client";

import { CornerDownLeft } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { InputMode } from "@/types/graph";
import { PixelIcon, type PixelIconName } from "@/components/ui/PixelIcon";
import { useMindspace } from "@/lib/store";
import { EXAMPLES, MODE_COPY } from "./examples";

const MODES: Array<{ mode: InputMode; icon: PixelIconName }> = [
  { mode: "topic", icon: "star" },
  { mode: "text", icon: "telescope" },
  { mode: "dump", icon: "constellation" },
];

/** Topic / Text / Brain dump input with examples and a single, obvious action. */
export function CreatePanel({ autoFocus = true }: { autoFocus?: boolean }) {
  const draft = useMindspace((s) => s.draft);
  const setDraft = useMindspace((s) => s.setDraft);
  const generate = useMindspace((s) => s.generate);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tabsId = useId();
  const copy = MODE_COPY[draft.mode];
  const words = draft.input.trim() ? draft.input.trim().split(/\s+/).length : 0;
  const lines = draft.input.split("\n").filter((l) => l.trim()).length;
  const canGenerate = draft.input.trim().length > 0;

  useEffect(() => {
    if (autoFocus && window.matchMedia("(min-width: 768px)").matches) inputRef.current?.focus();
  }, [autoFocus, draft.mode]);

  const submit = () => {
    if (!canGenerate) {
      inputRef.current?.focus();
      return;
    }
    generate(draft.mode, draft.input);
  };

  const meta =
    draft.mode === "text" ? `${words.toLocaleString()} word${words === 1 ? "" : "s"}` : draft.mode === "dump" ? `${lines} thought${lines === 1 ? "" : "s"}` : copy.hint;

  return (
    <div className="px-panel px-rivets w-full shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
      <div role="tablist" aria-label="Input mode" className="flex border-b border-line">
        {MODES.map(({ mode, icon }) => {
          const active = draft.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              id={`${tabsId}-${mode}`}
              aria-selected={active}
              aria-controls={`${tabsId}-panel`}
              onClick={() => setDraft({ mode })}
              className={`font-pixel relative flex h-10 flex-1 items-center justify-center gap-2 text-[9px] uppercase tracking-[0.12em] transition-colors ${
                active ? "text-ink" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              <PixelIcon name={icon} scale={1} className={active ? "text-accent" : ""} />
              {MODE_COPY[mode].label}
              {active && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-accent" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${draft.mode}`} className="p-3">
        <label className="sr-only" htmlFor={`${tabsId}-input`}>
          {copy.hint}
        </label>
        <textarea
          ref={inputRef}
          id={`${tabsId}-input`}
          value={draft.input}
          onChange={(e) => setDraft({ input: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey || (draft.mode === "topic" && !e.shiftKey))) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={copy.placeholder}
          rows={draft.mode === "topic" ? 2 : 7}
          spellCheck={draft.mode !== "topic"}
          className={`px-input block resize-none px-3 py-2.5 leading-relaxed ${draft.mode === "topic" ? "text-[17px] font-medium" : "text-[14px]"}`}
          maxLength={20000}
        />

        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Examples">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => {
                setDraft({ mode: example.mode, input: example.input });
                inputRef.current?.focus();
              }}
              className="border border-line bg-white/[0.025] px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:border-line-strong hover:bg-accent/10 hover:text-ink"
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
        <div className="min-w-0">
          <p className="px-caption truncate">{meta}</p>
          <p className="mt-0.5 hidden truncate text-[11px] text-ink-3 sm:block">Generated locally with heuristics — nothing leaves your browser.</p>
        </div>
        <button type="button" className="px-btn-primary h-10 shrink-0 px-4" onClick={submit} disabled={!canGenerate}>
          <PixelIcon name="rocket" scale={1} />
          Generate galaxy
          <span className="hidden items-center gap-0.5 opacity-60 sm:inline-flex" aria-hidden="true">
            <CornerDownLeft size={12} />
          </span>
        </button>
      </div>
    </div>
  );
}
