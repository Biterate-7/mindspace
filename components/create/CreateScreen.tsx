"use client";

import { ArrowRight, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Graph } from "@/types/graph";
import { LogoMark } from "@/components/ui/PixelIcon";
import { generateMap } from "@/lib/generation";
import { useMindspace } from "@/lib/store";
import { useMediaQuery } from "@/lib/utils/motion";
import { ConstellationPreview } from "./ConstellationPreview";
import { CreatePanel } from "./CreatePanel";
import { HeroGalaxy } from "./HeroGalaxy";

const SAMPLE_TOPIC = "How the human brain learns";

function relativeTime(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** First-launch and "New map" experience: discover an uncharted galaxy, then generate your own. */
export function CreateScreen({ overlay = false }: { overlay?: boolean }) {
  const draft = useMindspace((s) => s.draft);
  const maps = useMindspace((s) => s.maps);
  const closeCreate = useMindspace((s) => s.closeCreate);
  const openMap = useMindspace((s) => s.openMap);
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const sample = useMemo(() => generateMap("topic", SAMPLE_TOPIC).graph, []);
  const [preview, setPreview] = useState<{ graph: Graph; input: string } | null>(null);

  // Live preview of what the current input will generate (debounced, fully local).
  useEffect(() => {
    const input = draft.input.trim();
    const timer = setTimeout(() => {
      if (!input) {
        setPreview(null);
        return;
      }
      try {
        setPreview({ graph: generateMap(draft.mode, input).graph, input });
      } catch {
        setPreview(null);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [draft.input, draft.mode]);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCreate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, closeCreate]);

  const graph = preview?.graph ?? sample;
  const recent = maps.slice(0, 3);

  return (
    <motion.div
      className="fixed inset-0 z-[60] overflow-hidden bg-void"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.06, filter: "brightness(1.6)" }}
      transition={{ duration: 0.45, ease: [0.3, 0.7, 0.2, 1] }}
      role={overlay ? "dialog" : undefined}
      aria-modal={overlay ? true : undefined}
      aria-label={overlay ? "Create a new map" : undefined}
    >
      <HeroGalaxy anchor={wide ? { x: 0.7, y: 0.5 } : { x: 0.5, y: 0.17 }} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: wide
            ? "linear-gradient(90deg, rgba(3,4,10,0.92) 0%, rgba(3,4,10,0.72) 34%, rgba(3,4,10,0.1) 62%, rgba(3,4,10,0) 100%)"
            : "linear-gradient(180deg, rgba(3,4,10,0.15) 0%, rgba(3,4,10,0.75) 32%, rgba(3,4,10,0.94) 60%)",
        }}
        aria-hidden="true"
      />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-8 sm:py-6">
        <div className="flex items-center gap-2.5">
          <LogoMark size={22} />
          <span className="font-pixel text-[13px] tracking-[0.14em] text-ink">MINDSPACE</span>
          <span className="px-caption hidden sm:inline">· put your brain on a map</span>
        </div>
        {overlay && (
          <button type="button" className="px-btn h-9 gap-2 bg-void/60" onClick={closeCreate} aria-label="Close and return to your map">
            <X size={15} />
            <span className="hidden sm:inline">Back to map</span>
            <kbd className="px-kbd hidden sm:inline-flex">Esc</kbd>
          </button>
        )}
      </header>

      <div className="relative z-10 h-full overflow-y-auto">
        <div className="mx-auto grid min-h-full max-w-[1480px] grid-cols-[minmax(0,1fr)] items-center gap-8 px-5 pb-14 pt-[34vh] sm:px-8 lg:grid-cols-[minmax(0,580px)_1fr] lg:px-16 lg:pt-24">
          <div>
            <p className="px-caption mb-4 flex items-center gap-2">
              <span className="ms-blink inline-block h-1.5 w-1.5 bg-cyan" aria-hidden="true" />
              Sector 001 · uncharted
            </p>
            <h1 className="font-pixel text-[clamp(28px,4.2vw,52px)] leading-[1.08] tracking-[0.02em] text-ink">
              Your thoughts,
              <br />
              <span className="text-accent">connected.</span>
            </h1>
            <p className="mt-5 max-w-[480px] text-[16px] leading-relaxed text-ink-2">
              Mindspace turns a topic, an essay or a messy brain dump into an interactive galaxy of connected ideas you can explore, edit and share.
            </p>
            <div className="mt-8">
              <CreatePanel />
            </div>
            {recent.length > 0 && (
              <div className="mt-6">
                <p className="px-caption mb-2">Continue exploring</p>
                <ul className="flex flex-col gap-1">
                  {recent.map((map) => (
                    <li key={map.id}>
                      <button
                        type="button"
                        onClick={() => openMap(map.id)}
                        className="group flex w-full items-center gap-3 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-line hover:bg-white/[0.03]"
                      >
                        <span className="h-1.5 w-1.5 shrink-0 bg-accent/70" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 group-hover:text-ink">{map.title}</span>
                        <span className="font-pixel shrink-0 text-[8px] uppercase tracking-[0.1em] text-ink-3">
                          {map.nodeCount} stars · {relativeTime(map.updatedAt)}
                        </span>
                        <ArrowRight size={13} className="shrink-0 text-ink-3 group-hover:text-accent" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {wide && (
            <div className="relative flex flex-col items-center justify-center">
              <ConstellationPreview key={preview?.input ?? "sample"} graph={graph} size={500} />
              <p className="px-caption mt-2 text-center">
                {preview ? "Live preview" : "Example constellation"} · {graph.nodes.length} stars · {graph.edges.length} links
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
