import { describe, expect, it } from "vitest";
import { EmptyInputError, generateMap } from "@/lib/generation";
import { analyzeTopic, matchTemplate } from "@/lib/generation/topic";
import { splitThoughts } from "@/lib/generation/braindump";
import { stem, splitSentences } from "@/lib/generation/text";
import { expectValidGraph, reachableCount } from "./helpers";

const ESSAY = `The Attention Economy

Social media platforms compete for a scarce resource: human attention. Recommendation algorithms rank content by predicted engagement, because engagement drives advertising revenue. However, engagement metrics reward outrage and novelty rather than accuracy.

Researchers have linked heavy social media use to anxiety, especially among teenagers. Comparison with curated feeds leads to lower self-esteem. Yet the same platforms enable connection, such as support communities for rare diseases.

Some designers now argue for humane technology. Features such as time limits and chronological feeds help users regain control. Regulation of recommendation algorithms is also growing, for example the Digital Services Act in Europe. Can attention be protected without breaking the business model?`;

const DUMP = `Finish the first draft of my novel
Write every morning before work
Join a writing group for feedback on the novel
Start running again and train for a 10k
Build a reading tracker app for my phone
Read 20 books this year
What if the reading tracker shared quotes with friends?
Should I take the evening design course?
Redesign my portfolio site with new design work
Call grandma every Sunday
Finish the first draft of my novel
finish the first draft of my novel!`;

describe("topic generation", () => {
  it("produces a valid, connected graph for a curated topic", () => {
    const result = generateMap("topic", "How the human brain learns");
    expect(result.method).toBe("template");
    expectValidGraph(result.graph);
    expect(result.graph.nodes.length).toBeGreaterThanOrEqual(12);
    expect(result.graph.nodes.length).toBeLessThanOrEqual(45);
    expect(reachableCount(result.graph)).toBe(result.graph.nodes.length);
    expect(result.graph.nodes.filter((n) => n.data.kind === "core")).toHaveLength(1);
    expect(result.graph.edges.some((e) => e.data.relation !== "related")).toBe(true);
  });

  it("matches the curated examples to their templates", () => {
    expect(matchTemplate("Building a startup from scratch")?.id).toBe("startup");
    expect(matchTemplate("The future of artificial intelligence")?.id).toBe("ai-future");
    expect(matchTemplate("Why civilizations rise and fall")?.id).toBe("civilizations");
    expect(matchTemplate("Sourdough fermentation")).toBeNull();
  });

  it("expands unfamiliar topics with a scaffold anchored to the subject", () => {
    const result = generateMap("topic", "Sourdough fermentation");
    expect(result.method).toBe("frame");
    expectValidGraph(result.graph);
    expect(reachableCount(result.graph)).toBe(result.graph.nodes.length);
    expect(result.graph.nodes.length).toBeGreaterThanOrEqual(12);
    const labels = result.graph.nodes.map((n) => n.data.label);
    expect(labels).toContain("How sourdough fermentation works");
  });

  it("drops framing words from the subject so branch names read naturally", () => {
    expect(analyzeTopic("The history of jazz").subject).toBe("jazz");
    const labels = generateMap("topic", "The history of jazz").graph.nodes.map((n) => n.data.label);
    expect(labels).toContain("Origins of jazz");
    expect(labels[0]).toBe("The history of jazz");
  });

  it("recognises comparison, why and future questions", () => {
    expect(analyzeTopic("Python vs JavaScript").frame).toBe("compare");
    expect(analyzeTopic("Why do cats purr?").frame).toBe("why");
    expect(analyzeTopic("The future of remote work").frame).toBe("future");
    const compare = generateMap("topic", "Python vs JavaScript");
    expectValidGraph(compare.graph);
    expect(compare.graph.nodes.map((n) => n.data.label)).toEqual(expect.arrayContaining(["Python", "JavaScript"]));
  });

  it("is deterministic for the same input", () => {
    const a = generateMap("topic", "Urban beekeeping");
    const b = generateMap("topic", "Urban beekeeping");
    expect(b).toEqual(a);
  });

  it("rejects empty input", () => {
    expect(() => generateMap("topic", "   ")).toThrow(EmptyInputError);
  });
});

describe("text extraction", () => {
  const result = generateMap("text", ESSAY);
  const labels = result.graph.nodes.map((n) => n.data.label.toLowerCase());

  it("keeps the source title and real phrases from the text", () => {
    expect(result.method).toBe("extract");
    expect(result.title).toBe("The Attention Economy");
    expectValidGraph(result.graph);
    for (const phrase of ["recommendation algorithms", "social media", "engagement metrics"]) {
      expect(labels).toContain(phrase);
    }
    // Every concept (apart from the title core and questions) is wording that appears in the text.
    const lower = ESSAY.toLowerCase();
    for (const node of result.graph.nodes) {
      if (node.data.kind === "core" || node.data.category === "question") continue;
      expect(lower).toContain(node.data.label.toLowerCase());
    }
  });

  it("links concepts into one connected galaxy with inferred relations", () => {
    expect(reachableCount(result.graph)).toBe(result.graph.nodes.length);
    expect(result.graph.edges.some((e) => e.data.relation === "causes")).toBe(true);
    expect(result.graph.nodes.some((n) => n.data.category === "question")).toBe(true);
  });

  it("uses source sentences as notes", () => {
    const algorithms = result.graph.nodes.find((n) => n.data.label.toLowerCase() === "recommendation algorithms");
    expect(algorithms?.data.notes.length).toBeGreaterThan(20);
    expect(ESSAY).toContain(algorithms?.data.notes.slice(0, 30) ?? "missing");
  });

  it("treats very short text as a topic", () => {
    expect(generateMap("text", "Photosynthesis").method).toBe("frame");
  });
});

describe("brain dump", () => {
  const result = generateMap("dump", DUMP);
  const labels = result.graph.nodes.map((n) => n.data.label);

  it("preserves the user's wording for every distinct thought", () => {
    expect(result.method).toBe("dump");
    expectValidGraph(result.graph);
    for (const line of ["Write every morning before work", "Call grandma every Sunday", "Should I take the evening design course?"]) {
      expect(labels).toContain(line);
    }
  });

  it("merges duplicates and near duplicates", () => {
    expect(labels.filter((l) => l.toLowerCase().startsWith("finish the first draft"))).toHaveLength(1);
    const novel = result.graph.nodes.find((n) => n.data.label === "Finish the first draft of my novel");
    expect(novel?.data.notes).toMatch(/3 times/);
  });

  it("groups related thoughts and keeps the galaxy connected", () => {
    expect(reachableCount(result.graph)).toBe(result.graph.nodes.length);
    expect(result.graph.nodes.some((n) => n.data.kind === "planet")).toBe(true);
    const question = result.graph.nodes.find((n) => n.data.label.startsWith("Should I"));
    expect(question?.data.category).toBe("question");
  });

  it("splits bullets and detects a title line", () => {
    const { title, lines } = splitThoughts("Weekend:\n- buy paint\n* fix shelf\n1. call Sam");
    expect(title).toBe("Weekend");
    expect(lines).toEqual(["buy paint", "fix shelf", "call Sam"]);
  });

  it("caps very large dumps to a readable size", () => {
    const many = Array.from({ length: 120 }, (_, i) => `Idea number ${i} about topic ${i % 7}`).join("\n");
    const big = generateMap("dump", many);
    expectValidGraph(big.graph);
    expect(big.graph.nodes.length).toBeLessThanOrEqual(50);
  });
});

describe("text helpers", () => {
  it("stems related word forms together", () => {
    expect(stem("learning")).toBe(stem("learns"));
    expect(stem("civilizations")).toBe(stem("civilization"));
    expect(stem("writing")).toBe(stem("write"));
    expect(stem("humane")).not.toBe(stem("human"));
  });

  it("splits sentences without breaking on abbreviations", () => {
    expect(splitSentences("Use tools, e.g. a hammer. Then rest! Is it 3.5 m?")).toEqual(["Use tools, e.g. a hammer.", "Then rest!", "Is it 3.5 m?"]);
  });
});
