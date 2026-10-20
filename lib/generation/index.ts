import type { Graph, InputMode } from "@/types/graph";
import { generateFromDump } from "./braindump";
import { generateFromText } from "./extract";
import { applyLayout } from "./layout";
import { generateFromTopic } from "./topic";
import { normalizeWhitespace } from "./text";

/**
 * Entry point of the local generation engine. Pure and deterministic:
 * the same input always produces the same graph. No network, no model calls.
 */

export type GenerationMethod = "template" | "frame" | "extract" | "dump";

export interface GenerationResult {
  title: string;
  graph: Graph;
  mode: InputMode;
  method: GenerationMethod;
  /** One-line, honest description of how the map was produced. */
  summary: string;
}

export class EmptyInputError extends Error {
  constructor() {
    super("Write a topic, some text or a few thoughts first.");
    this.name = "EmptyInputError";
  }
}

function wordCount(text: string): number {
  return normalizeWhitespace(text).split(" ").filter(Boolean).length;
}

export function generateMap(mode: InputMode, rawInput: string): GenerationResult {
  const input = rawInput.trim();
  if (!input) throw new EmptyInputError();
  const words = wordCount(input);
  const lines = input.split(/\n/).filter((l) => l.trim()).length;

  if (mode === "dump" && lines >= 2) {
    const result = generateFromDump(input);
    if (result) {
      return {
        title: result.title,
        graph: applyLayout(result.builder.build()),
        mode,
        method: "dump",
        summary: `Grouped ${result.itemCount} thoughts by shared words${result.mergedDuplicates ? ` and merged ${result.mergedDuplicates} duplicate${result.mergedDuplicates === 1 ? "" : "s"}` : ""}.`,
      };
    }
  }

  const treatAsText = mode === "text" ? words >= 14 : mode === "topic" && (words > 32 || /[.!?]\s+\S.*[.!?]/.test(input));
  if (treatAsText) {
    const result = generateFromText(input);
    if (result) {
      return {
        title: result.title,
        graph: applyLayout(result.builder.build()),
        mode,
        method: "extract",
        summary: `Extracted ${result.conceptCount} concepts from your text and linked them by co-occurrence.`,
      };
    }
  }

  const topic = mode === "topic" ? input : input.split(/\n/).find((l) => l.trim())?.trim() ?? input;
  const result = generateFromTopic(topic);
  return {
    title: result.title,
    graph: applyLayout(result.builder.build()),
    mode,
    method: result.method,
    summary:
      result.method === "template"
        ? "Expanded from a built-in knowledge template, generated locally."
        : "Drafted a thinking scaffold around your topic with local heuristics.",
  };
}
