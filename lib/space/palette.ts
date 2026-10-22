import type { Category, Relation } from "@/types/graph";
import type { SourceCategory } from "@/types/research";

/**
 * Limited pixel-art palettes. Each ramp runs highlight -> deep shadow so sprites
 * can be shaded with a handful of hard-edged tones, like hand-made pixel art.
 */

export type Ramp = readonly [highlight: string, light: string, base: string, shade: string, deep: string];

export const CATEGORY_RAMPS: Record<Category, Ramp> = {
  concept: ["#F3EEFF", "#C9B8FF", "#9B7BFF", "#5B3FD1", "#2A1B70"],
  process: ["#E6FEFF", "#9DF3FB", "#3FD3E8", "#1A8AA6", "#0B3F57"],
  example: ["#EAF0FF", "#A9C1FF", "#6F93FF", "#3456D6", "#18257A"],
  impact: ["#FFE8F4", "#FFA6D2", "#F2629F", "#B02C6E", "#5A1338"],
  question: ["#FFF9E3", "#FFE7A3", "#F5C451", "#B98320", "#5E3D0D"],
  goal: ["#FFF0E2", "#FFC08A", "#FA8C4C", "#C0501F", "#5F230C"],
  idea: ["#E9FFF4", "#A6F5CC", "#56DB9C", "#1F9A66", "#0C4A33"],
  note: ["#F4F5FB", "#C9CDE2", "#9298B8", "#5A6084", "#2C3050"],
};

/** The core reads as a luminous white star with a lavender corona. */
export const CORE_RAMP: Ramp = ["#FFFFFF", "#FFF6E0", "#E9DEFF", "#B39CFF", "#6F55E8"];

export const CATEGORY_LABELS: Record<Category, string> = {
  concept: "Concept",
  process: "Process",
  example: "Example",
  impact: "Impact",
  question: "Question",
  goal: "Goal",
  idea: "Idea",
  note: "Note",
};

export function categoryColor(category: Category): string {
  return CATEGORY_RAMPS[category][2];
}

/**
 * Discovery palettes. Concepts drawn from sources use a cool cyan/blue family so they
 * read apart from your own ideas at a glance; sources are steel satellites.
 */
export const CONCEPT_RAMPS: Record<"idea" | "named", Ramp> = {
  idea: ["#E6FEFF", "#9DF3FB", "#3FD3E8", "#1A8AA6", "#0B3F57"],
  named: ["#EAF0FF", "#A9C1FF", "#6F93FF", "#3456D6", "#18257A"],
};

export const SOURCE_RAMP: Ramp = ["#F4F6FF", "#C8CFEA", "#8E98C4", "#58618F", "#2A2F4F"];

/** Tag colours for kinds of publisher, kept in the steel/cyan family of sources with a few warm accents. */
export const CATEGORY_COLORS: Record<SourceCategory, string> = {
  academic: "#9DF3FB",
  news: "#FFB7A6",
  reference: "#C8CFEA",
  government: "#A9C1FF",
  documentation: "#7FE6B5",
  code: "#B39CFF",
  discussion: "#F5C451",
  educational: "#8EE3FF",
  organization: "#C8CFEA",
  blog: "#F2A3CF",
  web: "#AEB6D8",
};

/** Claims are small amber moons: quoted evidence orbiting the concepts it is about. */
export const CLAIM_RAMP: Ramp = ["#FFF6DD", "#FFE29A", "#F2C46B", "#B8862B", "#5E4313"];

const NAMED_TYPES = new Set(["person", "organization", "place", "event", "date", "entity"]);

export function conceptRampKey(type: string): "idea" | "named" {
  return NAMED_TYPES.has(type) ? "named" : "idea";
}

export const CONCEPT_TYPE_LABELS: Record<string, string> = {
  theme: "Theme",
  concept: "Concept",
  person: "Person",
  organization: "Organization",
  place: "Place",
  event: "Event",
  date: "Date",
  entity: "Name",
};

/** Legend colours for the three node families. */
export const ROLE_COLORS = { idea: "#56DB9C", concept: "#3FD3E8", source: "#C8CFEA", claim: "#F2C46B" } as const;

export const RELATION_COLORS: Record<Relation, string> = {
  related: "#7C8CFF",
  causes: "#F27BB5",
  supports: "#58D9EA",
  example: "#8EA9FF",
  contrasts: "#F5C451",
  contradicts: "#FF8A6B",
  mentions: "#6FA3C7",
  extracted: "#6FA3C7",
  evidence: "#E8B65A",
  believes: "#56DB9C",
};

/** Deep-space background colours shared by the live canvas and image export. */
export const SPACE = {
  void: "#03040A",
  deep: "#060818",
  navy: "#0A0F2C",
  nebula: ["#5B3FD1", "#3F4FD6", "#2A72C8", "#9B3FB8", "#7452E8"] as const,
  star: ["#FFFFFF", "#DDE3FF", "#B9C6FF", "#FFE9C4", "#C9F4FF"] as const,
};
