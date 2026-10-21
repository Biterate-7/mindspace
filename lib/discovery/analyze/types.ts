import type { Relation } from "@/types/graph";
import type { ConceptType } from "@/types/research";

/**
 * Output of a source analysis provider. Every passage must be quoted from the source
 * text; providers that cannot guarantee that are validated against the text afterwards.
 */

export interface AnalyzedConcept {
  label: string;
  type: ConceptType;
  /** Verbatim sentences from the source that mention the concept. */
  passages: string[];
  mentions: number;
  /** 0..1 relative importance within this source. */
  salience: number;
  description?: string;
  descriptionKind?: "quote" | "model";
  /** The source discusses this concept with contrasting or disputed language. */
  tension?: boolean;
}

export interface AnalyzedRelation {
  from: string;
  to: string;
  relation: Relation;
  /** The sentence that suggested the link. */
  evidence: string;
}

export interface SourceAnalysis {
  provider: "local" | "model";
  /** True for heuristic output that approximates, rather than performs, semantic analysis. */
  approximate: boolean;
  summary: string;
  summaryKind: "extractive" | "model";
  keyPassages: string[];
  concepts: AnalyzedConcept[];
  relations: AnalyzedRelation[];
}

export interface AnalysisInput {
  text: string;
  title: string;
  question: string;
}
