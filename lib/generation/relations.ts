import type { Category, Relation } from "@/types/graph";

/**
 * Relationship inference. Everything here is heuristic: cue phrases in the
 * source text and the categories of the two ideas. Users can always edit the result.
 */

interface Cue {
  pattern: RegExp;
  relation: Relation;
  /** True when the cue implies the later concept acts on the earlier one ("A because B"). */
  reverse?: boolean;
}

const CUES: Cue[] = [
  { pattern: /\b(because of|because|due to|caused by|driven by|results? from|stems? from|thanks to)\b/i, relation: "causes", reverse: true },
  { pattern: /\b(causes?|caused|leads? to|led to|results? in|resulted in|drives?|produces?|triggers?|creates?|generates?|increases?|reduces?|decreases?|therefore|thus|hence|so that)\b/i, relation: "causes" },
  { pattern: /\b(depends? on|requires?|relies on|built on|based on)\b/i, relation: "supports", reverse: true },
  { pattern: /\b(supports?|enables?|helps?|improves?|strengthens?|allows?|boosts?|fosters?|encourages?|reinforces?|makes? possible|contributes? to)\b/i, relation: "supports" },
  { pattern: /\b(is an example of|is a kind of|is a type of|a form of)\b/i, relation: "example", reverse: true },
  { pattern: /\b(for example|for instance|such as|e\.g\.|including)\b/i, relation: "example" },
  { pattern: /\b(however|but|whereas|unlike|versus|vs\.?|although|instead of|rather than|in contrast|on the other hand|despite|conflicts? with|opposes?|compared to)\b/i, relation: "contrasts" },
];

export interface SentenceRelation {
  relation: Relation;
  /** True when the edge should point from the later concept to the earlier one. */
  reversed: boolean;
}

/**
 * Looks for a cue between the two concept mentions first, then anywhere in the sentence for contrasts.
 * Positions are character offsets of each concept inside `sentence`.
 */
export function inferRelationFromSentence(sentence: string, firstEnd: number, secondStart: number): SentenceRelation | null {
  const between = secondStart > firstEnd ? sentence.slice(firstEnd, secondStart) : "";
  if (between) {
    for (const cue of CUES) {
      if (cue.pattern.test(between)) {
        if (cue.relation === "example") {
          // "A such as B" -> B is an example of A; "A is an example of B" -> A is an example of B.
          return { relation: "example", reversed: !cue.reverse };
        }
        return { relation: cue.relation, reversed: Boolean(cue.reverse) };
      }
    }
  }
  // "Unlike A, B ..." / "Whereas A ..., B ..." put the cue before both mentions.
  const lead = sentence.slice(0, firstEnd);
  if (/^\s*(unlike|whereas|in contrast to|compared (to|with)|versus)\b/i.test(lead) && /,/.test(between)) {
    return { relation: "contrasts", reversed: false };
  }
  return null;
}

/** Fallback when there is no shared sentence to learn from. */
export function inferRelationFromCategories(from: Category, to: Category): Relation {
  if (to === "example" && from !== "example") return "example";
  if (from === "process" && to === "impact") return "causes";
  if (from === "impact" && to === "process") return "causes";
  if (from === "goal" || to === "goal") return "supports";
  return "related";
}

export const RELATION_LABELS: Record<Relation, string> = {
  related: "related to",
  causes: "causes",
  supports: "supports",
  example: "example of",
  contrasts: "contrasts with",
};

const IMPACT_WORDS = /\b(effects?|impacts?|consequences?|risks?|benefits?|costs?|loss|losses|growth|decline|damage|harm|outcomes?|results?|improvements?|failure|success|crisis|problems?|threats?|opportunit(y|ies)|inequality|burnout)\b/i;
const PROCESS_WORDS = /\b(process|processes|cycles?|methods?|mechanisms?|strategy|strategies|techniques?|practices?|development|production|systems?|loops?|steps?|workflow|training|learning|feedback|iteration|transition|evolution|formation)\b/i;
const GOAL_WORDS = /\b(goals?|plans?|aims?|targets?|objectives?|milestones?|ambitions?)\b/i;
const IDEA_WORDS = /\b(ideas?|theory|theories|hypothes[ie]s|insights?|concepts?|thesis|vision)\b/i;

/** Category guess for a phrase extracted from prose. */
export function categorizePhrase(phrase: string, opts: { isProperNoun?: boolean; isExample?: boolean } = {}): Category {
  const p = phrase.trim();
  if (p.endsWith("?")) return "question";
  if (opts.isExample || opts.isProperNoun) return "example";
  if (GOAL_WORDS.test(p)) return "goal";
  if (IMPACT_WORDS.test(p)) return "impact";
  if (PROCESS_WORDS.test(p) || /\b\w{4,}ing\b/i.test(p)) return "process";
  if (IDEA_WORDS.test(p)) return "idea";
  return "concept";
}
