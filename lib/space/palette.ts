import type { Category, Relation } from "@/types/graph";

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

export const RELATION_COLORS: Record<Relation, string> = {
  related: "#7C8CFF",
  causes: "#F27BB5",
  supports: "#58D9EA",
  example: "#8EA9FF",
  contrasts: "#F5C451",
};

/** Deep-space background colours shared by the live canvas and image export. */
export const SPACE = {
  void: "#03040A",
  deep: "#060818",
  navy: "#0A0F2C",
  nebula: ["#5B3FD1", "#3F4FD6", "#2A72C8", "#9B3FB8", "#7452E8"] as const,
  star: ["#FFFFFF", "#DDE3FF", "#B9C6FF", "#FFE9C4", "#C9F4FF"] as const,
};
