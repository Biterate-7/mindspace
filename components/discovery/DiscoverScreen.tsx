"use client";

import { ArrowRight, Link2, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ModeSwitch } from "@/components/app/ModeSwitch";
import { HeroGalaxy } from "@/components/create/HeroGalaxy";
import { LogoMark, PixelIcon } from "@/components/ui/PixelIcon";
import { EXAMPLE_QUESTIONS } from "@/lib/discovery/vocabulary";
import { useMindspace } from "@/lib/store";
import { AUTO_IMPORT } from "@/lib/store/researchSlice";
import { useMediaQuery } from "@/lib/utils/motion";
import { ProviderStatus } from "./ProviderStatus";

function relativeTime(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Discovery launch: ask a question, optionally bring your own URLs, start the expedition. */
export function DiscoverScreen({ overlay = false }: { overlay?: boolean }) {
  const maps = useMindspace((s) => s.maps);
  const openMap = useMindspace((s) => s.openMap);
  const closeDiscover = useMindspace((s) => s.closeDiscover);
  const startResearch = useMindspace((s) => s.startResearch);
  const loadConfig = useMindspace((s) => s.loadDiscoveryConfig);
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const [question, setQuestion] = useState("");
  const [urls, setUrls] = useState("");
  const [showUrls, setShowUrls] = useState(false);
  const [autoBuild, setAutoBuild] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recent = maps.filter((m) => m.workspace === "discovery").slice(0, 4);

  useEffect(() => {
    loadConfig();
    if (window.matchMedia("(min-width: 768px)").matches) inputRef.current?.focus();
  }, [loadConfig]);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDiscover();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, closeDiscover]);

  const submit = () => {
    if (!question.trim()) {
      inputRef.current?.focus();
      return;
    }
    startResearch(question, showUrls ? urls : "", { autoImport: autoBuild ? AUTO_IMPORT : 0 });
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] overflow-hidden bg-void"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.06, filter: "brightness(1.6)" }}
      transition={{ duration: 0.45, ease: [0.3, 0.7, 0.2, 1] }}
      role={overlay ? "dialog" : undefined}
      aria-modal={overlay ? true : undefined}
      aria-label={overlay ? "Start a new research workspace" : undefined}
    >
      <HeroGalaxy anchor={wide ? { x: 0.72, y: 0.5 } : { x: 0.5, y: 0.15 }} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: wide
            ? "linear-gradient(90deg, rgba(3,4,10,0.94) 0%, rgba(3,4,10,0.76) 36%, rgba(3,4,10,0.14) 64%, rgba(3,4,10,0) 100%)"
            : "linear-gradient(180deg, rgba(3,4,10,0.2) 0%, rgba(3,4,10,0.8) 30%, rgba(3,4,10,0.95) 58%)",
        }}
        aria-hidden="true"
      />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-6">
        <div className="flex items-center gap-2.5">
          <LogoMark size={22} />
          <span className="font-pixel hidden text-[13px] tracking-[0.14em] text-ink sm:inline">MINDSPACE</span>
        </div>
        <div className="flex items-center gap-2">
          <ModeSwitch compact={!wide} />
          {overlay && (
            <button type="button" className="px-btn h-9 gap-2 bg-void/60" onClick={closeDiscover} aria-label="Close and return to your workspace">
              <X size={15} />
              <span className="hidden sm:inline">Back</span>
              <kbd className="px-kbd hidden sm:inline-flex">Esc</kbd>
            </button>
          )}
        </div>
      </header>

      <div className="relative z-10 h-full overflow-y-auto">
        <div className="mx-auto grid min-h-full max-w-[1480px] grid-cols-[minmax(0,1fr)] items-center gap-8 px-5 pb-14 pt-[30vh] sm:px-8 lg:grid-cols-[minmax(0,600px)_1fr] lg:px-16 lg:pt-24">
          <div>
            <p className="px-caption mb-4 flex items-center gap-2">
              <span className="ms-blink inline-block h-1.5 w-1.5 bg-cyan" aria-hidden="true" />
              Discovery · deep-field survey
            </p>
            <h1 className="font-pixel text-[clamp(26px,3.8vw,48px)] leading-[1.1] tracking-[0.02em] text-ink">
              What do you want
              <br />
              <span className="text-cyan">to understand?</span>
            </h1>
            <p className="mt-5 max-w-[500px] text-[15.5px] leading-relaxed text-ink-2">
              Discovery searches for sources, reads the articles you choose and maps their concepts into your galaxy — every concept linked back to the passage it came from.
            </p>

            <div className="px-panel px-rivets mt-8 w-full shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
              <div className="p-3">
                <label htmlFor="discover-question" className="px-caption mb-2 flex items-center gap-2">
                  <PixelIcon name="telescope" scale={1} className="text-cyan" /> Research question
                </label>
                <textarea
                  ref={inputRef}
                  id="discover-question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={2}
                  maxLength={500}
                  placeholder="e.g. Why did the Treaty of Versailles contribute to World War II?"
                  className="px-input block resize-none px-3 py-2.5 text-[17px] font-medium leading-relaxed"
                />
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Example questions">
                  {EXAMPLE_QUESTIONS.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setQuestion(example);
                        inputRef.current?.focus();
                      }}
                      className="border border-line bg-white/[0.025] px-2.5 py-1 text-left text-[12px] text-ink-2 transition-colors hover:border-line-strong hover:bg-cyan/10 hover:text-ink"
                    >
                      {example}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  {showUrls ? (
                    <div>
                      <label htmlFor="discover-urls" className="px-caption mb-1.5 block">
                        Start with these URLs · one per line
                      </label>
                      <textarea
                        id="discover-urls"
                        value={urls}
                        onChange={(e) => setUrls(e.target.value)}
                        rows={3}
                        placeholder={"https://www.britannica.com/event/Treaty-of-Versailles-1919\nhttps://…"}
                        className="px-input block resize-y px-3 py-2 font-mono text-[12px] leading-relaxed"
                        spellCheck={false}
                      />
                    </div>
                  ) : (
                    <button type="button" className="flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink" onClick={() => setShowUrls(true)}>
                      <Link2 size={13} /> Add your own source URLs
                    </button>
                  )}
                </div>
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[12px] text-ink-2">
                  <input type="checkbox" checked={autoBuild} onChange={(e) => setAutoBuild(e.target.checked)} className="mt-0.5 accent-[#5EE3F2]" />
                  <span>
                    Build the galaxy automatically from the top {AUTO_IMPORT} sources
                    <span className="block text-[11px] text-ink-3">Picked from different sites; you can review, remove or add more afterwards.</span>
                  </span>
                </label>
              </div>
              <div className="flex flex-col gap-3 border-t border-line px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <ProviderStatus />
                </div>
                <button type="button" className="px-btn-primary h-10 shrink-0 px-4" onClick={submit} disabled={!question.trim()}>
                  <PixelIcon name="rocket" scale={1} />
                  Start research
                </button>
              </div>
            </div>

            {recent.length > 0 && (
              <div className="mt-6">
                <p className="px-caption mb-2">Continue an expedition</p>
                <ul className="flex flex-col gap-1">
                  {recent.map((map) => (
                    <li key={map.id}>
                      <button
                        type="button"
                        onClick={() => openMap(map.id)}
                        className="group flex w-full items-center gap-3 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-line hover:bg-white/[0.03]"
                      >
                        <PixelIcon name="telescope" scale={1} className="shrink-0 text-cyan/70" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 group-hover:text-ink">{map.title}</span>
                        <span className="font-pixel shrink-0 text-[8px] uppercase tracking-[0.1em] text-ink-3">
                          {map.nodeCount} nodes · {relativeTime(map.updatedAt)}
                        </span>
                        <ArrowRight size={13} className="shrink-0 text-ink-3 group-hover:text-cyan" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {wide && (
            <div className="relative hidden flex-col items-center justify-center lg:flex" aria-hidden="true">
              <div className="px-panel max-w-[340px] p-4">
                <p className="px-caption mb-3">How an expedition works</p>
                <ol className="space-y-2.5 text-[12.5px] leading-snug text-ink-2">
                  {[
                    ["Search", "Real results from the configured provider — titles, links and snippets exactly as returned."],
                    ["Import", "You choose which pages to read. Mindspace fetches them server-side and extracts the article text."],
                    ["Map", "Concepts, people and events become planets, each linked to the sources and passages they came from."],
                    ["Think", "Add your own ideas, connect them, and review every suggested link."],
                  ].map(([title, body], i) => (
                    <li key={title} className="flex gap-2.5">
                      <span className="font-pixel mt-0.5 shrink-0 text-[9px] text-cyan">{String(i + 1).padStart(2, "0")}</span>
                      <span>
                        <span className="text-ink">{title}.</span> {body}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
