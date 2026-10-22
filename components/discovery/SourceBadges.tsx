"use client";

import { LoaderCircle } from "lucide-react";
import type { ProviderInfo, ProviderOutcome, SourceCategory, SourceRole } from "@/types/research";
import { CATEGORY_LABELS, ROLE_HINTS, ROLE_LABELS } from "@/lib/discovery/classify";
import { CATEGORY_COLORS } from "@/lib/space/palette";

/** Publisher kind and evidence role as two small pixel tags. Heuristic labels, explained on hover. */
export function SourceBadges({ category, role, preprint }: { category?: SourceCategory; role?: SourceRole; preprint?: boolean }) {
  if (!category && !role) return null;
  return (
    <>
      {category && (
        <span className="text-ink-2" style={{ color: CATEGORY_COLORS[category] }} title="Kind of publisher (heuristic, from the address and the index that found it)">
          {CATEGORY_LABELS[category]}
          {preprint ? " · preprint" : ""}
        </span>
      )}
      {role && (
        <span className="text-ink-3" title={ROLE_HINTS[role]}>
          {ROLE_LABELS[role]}
        </span>
      )}
    </>
  );
}

const STATUS_TEXT: Record<ProviderOutcome["status"], string> = {
  ok: "",
  empty: "no matches",
  failed: "failed",
  timeout: "timed out",
  rate_limited: "rate limited",
  skipped: "not used for this topic",
};

/**
 * Which providers were asked and what each one did. Failures stay visible so a thin result
 * list is never mistaken for a complete one.
 */
export function ProviderOutcomes({ providers, outcomes, searching }: { providers?: ProviderInfo[]; outcomes: ProviderOutcome[]; searching: boolean }) {
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  const rows = (providers ?? outcomes).map((p) => ({ id: p.id, label: p.label, outcome: byId.get(p.id as ProviderOutcome["id"]) }));
  const used = rows.filter((r) => r.outcome?.status !== "skipped");
  const skipped = rows.filter((r) => r.outcome?.status === "skipped");
  if (rows.length === 0) return null;
  return (
    <div className="px-3 pb-1 pt-2">
      <ul className="flex flex-wrap gap-1" aria-label="Search providers">
        {used.map(({ id, label, outcome }) => {
          const tone = !outcome ? "border-line text-ink-3" : outcome.status === "ok" ? "border-[rgba(94,227,242,0.35)] text-ink-2" : outcome.status === "empty" ? "border-line text-ink-3" : "border-[rgba(255,122,154,0.4)] text-[#ffc2d1]";
          return (
            <li key={id} className={`flex items-center gap-1 border px-1.5 py-0.5 text-[11px] ${tone}`} title={outcome?.message ?? (outcome?.queries.length ? `Queries: ${outcome.queries.join(" · ")}` : undefined)}>
              {!outcome && searching && <LoaderCircle size={9} className="animate-spin text-cyan" aria-hidden="true" />}
              {label}
              {outcome && <span className="tabular-nums">{outcome.status === "ok" ? `· ${outcome.count}` : `· ${STATUS_TEXT[outcome.status]}`}</span>}
            </li>
          );
        })}
      </ul>
      {skipped.length > 0 && !searching && <p className="mt-1 text-[10.5px] text-ink-3">Not relevant to this topic: {skipped.map((s) => s.label).join(", ")}</p>}
    </div>
  );
}
