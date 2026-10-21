"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { DataExport } from "@/components/discovery/DataExport";
import { Dialog } from "@/components/ui/Dialog";
import { computeExportGeometry, computeFrameLayout, exportFileName, graphBounds } from "@/lib/export/geometry";
import { downloadBlob, renderGraphPng } from "@/lib/export/png";
import { useMindspace } from "@/lib/store";

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2.5">
      <span>
        <span className="block text-[13.5px] text-ink">{label}</span>
        <span className="block text-[12px] leading-snug text-ink-3">{description}</span>
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-[18px] w-8 border border-line-strong bg-void transition-colors peer-checked:border-accent peer-checked:bg-accent/25 peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span className="absolute left-[3px] top-[3px] h-3 w-3 bg-ink-3 transition-transform peer-checked:translate-x-[14px] peer-checked:bg-accent" />
      </span>
    </label>
  );
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nodes = useMindspace((s) => s.nodes);
  const edgeCount = useMindspace((s) => s.edges.length);
  const title = useMindspace((s) => s.current?.title ?? "Mindspace map");
  const prefs = useMindspace((s) => s.prefs);
  const setPrefs = useMindspace((s) => s.setPrefs);
  const toast = useMindspace((s) => s.toast);
  const [quality, setQuality] = useState<2 | 3>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const discovery = useMindspace((s) => s.current?.workspace === "discovery");
  const [format, setFormat] = useState<"png" | "json">("png");
  const fileName = exportFileName(title);

  const size = useMemo(() => {
    const bounds = graphBounds(nodes);
    if (!bounds) return null;
    const geometry = computeExportGeometry(bounds, { pixelRatio: quality });
    const layout = computeFrameLayout(geometry.width, geometry.height, prefs.exportFrame);
    return { width: Math.round(layout.width * geometry.pixelRatio), height: Math.round(layout.height * geometry.pixelRatio), scaled: geometry.scaledDown };
  }, [nodes, quality, prefs.exportFrame]);

  const run = async () => {
    const root = document.querySelector<HTMLElement>(".ms-flow .react-flow");
    const viewport = root?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!root || !viewport) {
      setError("The canvas is not ready yet. Try again in a moment.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { blob, scaledDown } = await renderGraphPng(viewport, root, nodes, {
        title,
        frame: prefs.exportFrame,
        background: prefs.exportBackground,
        edgeCount,
        pixelRatio: quality,
      });
      downloadBlob(blob, fileName);
      toast(`Exported ${fileName}${scaledDown ? " — scaled down to fit browser limits" : ""}`, { tone: "success" });
      onClose();
    } catch (cause) {
      const message = cause instanceof Error && cause.name === "ExportError" ? cause.message : "Export failed. Your map is safe — try again, or turn off the space background.";
      setError(message);
      toast("Export failed", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title={format === "json" ? "Export research data" : "Export PNG"} eyebrow="Capture the galaxy" width={460}>
      {discovery && (
        <div className="flex gap-1 px-5 pt-3" role="radiogroup" aria-label="Export format">
          {(["png", "json"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={format === f}
              onClick={() => setFormat(f)}
              className={`font-pixel h-8 flex-1 border text-[8px] uppercase tracking-[0.12em] ${format === f ? "border-[rgba(179,156,255,0.4)] bg-accent/15 text-ink" : "border-line text-ink-3 hover:text-ink-2"}`}
            >
              {f === "png" ? "Image · PNG" : "Data · JSON"}
            </button>
          ))}
        </div>
      )}
      {format === "json" && discovery ? (
        <DataExport onClose={onClose} />
      ) : (
        <>
      <div className="px-5 py-2">
        <Toggle
          label="Caption frame"
          description="Adds the map title and a small Mindspace mark beneath the graph."
          checked={prefs.exportFrame}
          onChange={(exportFrame) => setPrefs({ exportFrame })}
        />
        <Toggle
          label="Deep-space background"
          description="Pixel stars and nebula behind the graph. Off for a plain midnight backdrop."
          checked={prefs.exportBackground === "space"}
          onChange={(space) => setPrefs({ exportBackground: space ? "space" : "plain" })}
        />
        <div className="flex items-center justify-between gap-4 py-2.5">
          <span>
            <span className="block text-[13.5px] text-ink">Resolution</span>
            <span className="block text-[12px] text-ink-3">Includes every idea, not just what is on screen.</span>
          </span>
          <div className="flex shrink-0 border border-line" role="radiogroup" aria-label="Resolution">
            {([2, 3] as const).map((q) => (
              <button
                key={q}
                type="button"
                role="radio"
                aria-checked={quality === q}
                onClick={() => setQuality(q)}
                className={`font-pixel h-8 px-3 text-[9px] tracking-[0.1em] ${quality === q ? "bg-accent/20 text-ink" : "text-ink-3 hover:text-ink-2"}`}
              >
                {q}×
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-5 mb-4 flex items-center justify-between border border-line bg-white/[0.02] px-3 py-2">
        <span className="min-w-0 truncate text-[12.5px] text-ink-2">{fileName}</span>
        {size && (
          <span className="font-pixel shrink-0 pl-3 text-[8px] tracking-[0.1em] text-ink-3">
            {size.width} × {size.height}
          </span>
        )}
      </div>
      {error && (
        <p className="mx-5 mb-3 border border-[rgba(255,122,154,0.35)] bg-[rgba(255,122,154,0.08)] px-3 py-2 text-[12.5px] text-[#ffc2d1]" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <button type="button" className="px-btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="px-btn-primary h-8" onClick={run} disabled={busy || nodes.length === 0} data-autofocus>
          {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
          {busy ? "Rendering" : "Export PNG"}
        </button>
      </div>
        </>
      )}
    </Dialog>
  );
}
