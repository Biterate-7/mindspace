import type { Category, Relation } from "@/types/graph";
import { createRng, hashString } from "@/lib/utils/random";
import { GraphBuilder, kindForDepth } from "./builder";
import { TOPIC_TEMPLATES, type TemplateNode, type TopicTemplate } from "./templates";
import { capitalize, cleanLine, normalizeWhitespace, stem, stemSet, stripQuestionLead, truncate } from "./text";

/** Topic expansion: curated templates for familiar subjects, structured thinking frames for everything else. */

export type TopicMethod = "template" | "frame";

export interface TopicResult {
  builder: GraphBuilder;
  title: string;
  method: TopicMethod;
  templateId?: string;
}

// ---------------------------------------------------------------------------
// Template matching

export function scoreTemplate(template: TopicTemplate, topic: string): number {
  const lower = ` ${topic.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ")} `;
  const stems = stemSet(topic);
  let score = 0;
  template.keywords.forEach((keyword, index) => {
    const anchor = index === 0;
    if (/[\s-]/.test(keyword)) {
      if (lower.includes(` ${keyword} `) || lower.includes(` ${keyword}s `)) score += 2;
    } else if (stems.has(stem(keyword))) {
      score += anchor || keyword.length <= 2 ? 2 : 1;
    }
  });
  return score;
}

export function matchTemplate(topic: string): TopicTemplate | null {
  let best: TopicTemplate | null = null;
  let bestScore = 1;
  for (const template of TOPIC_TEMPLATES) {
    const score = scoreTemplate(template, topic);
    if (score > bestScore) {
      best = template;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Topic analysis

type FrameId = "compare" | "future" | "why" | "how" | "pursuit" | "concept";

interface TopicAnalysis {
  core: string;
  subject: string;
  frame: FrameId;
  compare?: [string, string];
}

export function analyzeTopic(raw: string): TopicAnalysis {
  const cleaned = cleanLine(normalizeWhitespace(raw)).replace(/[.!]+$/, "");
  const core = truncate(capitalize(cleaned), 80);
  const compare = cleaned.match(/^(?:which is better[:,]?\s*)?(.+?)\s+(?:vs\.?|versus|compared (?:to|with))\s+(.+?)\??$/i);
  if (compare && compare[1].split(" ").length <= 5 && compare[2].split(" ").length <= 5) {
    return { core, subject: cleaned, frame: "compare", compare: [capitalize(compare[1].trim()), capitalize(compare[2].trim())] };
  }
  const futureOf = cleaned.match(/\bfuture of (?:the )?(.+?)\??$/i);
  if (futureOf) return { core, subject: futureOf[1], frame: "future" };
  if (/^will\b|\bin (?:the )?(?:next|coming) (?:decade|years)|\bby 20\d\d\b/i.test(cleaned)) {
    return { core, subject: stripQuestionLead(cleaned), frame: "future" };
  }
  if (/^why\b/i.test(cleaned)) {
    return { core, subject: stripQuestionLead(cleaned).replace(/^(do|does|did|is|are|was|were|has|have)\s+/i, ""), frame: "why" };
  }
  if (/^(how to|how can i|how do i|how should i|learn(ing)?|build(ing)?|start(ing)?|becom(e|ing)|get(ting)? better|improv(e|ing)|master(ing)?|launch(ing)?|plan(ning)?|my)\b/i.test(cleaned)) {
    return { core, subject: cleaned.replace(/^(how to|how can i|how do i|how should i)\s+/i, ""), frame: "pursuit" };
  }
  if (/^how\b|\bworks?\??$/i.test(cleaned)) {
    return { core, subject: stripQuestionLead(cleaned).replace(/^(does|do|did|is|are)\s+/i, "").replace(/\s+works?$/i, ""), frame: "how" };
  }
  const subject = stripQuestionLead(cleaned)
    .replace(/^(the|a|an)\s+/i, "")
    // Framing words make awkward branch names ("Origins of history of jazz").
    .replace(/^(?:(?:a|an|the)\s+)?(?:history|story|evolution|basics|fundamentals|introduction|intro)\s+(?:of|to)\s+(?:the\s+)?/i, "");
  return { core, subject: subject || cleaned, frame: "concept" };
}

/** Lower-cases a subject for use mid-sentence unless it looks like a proper noun or acronym. */
function inline(subject: string): string {
  const words = subject.split(" ");
  const properNoun = words.length > 1 && words.every((w) => /^[\p{Lu}\d]/u.test(w));
  if (properNoun || /^[A-Z0-9]{2,}/.test(subject)) return subject;
  return subject.charAt(0).toLowerCase() + subject.slice(1);
}

// ---------------------------------------------------------------------------
// Frames for unfamiliar topics

type Leaf = [label: string, category: Category, notes: string];

interface Lens {
  label: (s: string) => string;
  category: Category;
  notes: string;
  pool: Leaf[];
  take: number;
}

interface Frame {
  lenses: Lens[];
  links: Array<[string, string, Relation]>;
}

const fixed = (label: string) => () => label;

const FRAMES: Record<Exclude<FrameId, "compare">, Frame> = {
  concept: {
    lenses: [
      {
        label: fixed("Core ideas"),
        category: "concept",
        notes: "The essential ideas behind {s}.",
        take: 3,
        pool: [
          ["Definition", "concept", "What exactly is {s}? Try defining it in one sentence."],
          ["Key principles", "concept", "The few rules or truths everything else in {s} rests on."],
          ["Key terms", "concept", "Vocabulary worth knowing when exploring {s}."],
          ["Common misconceptions", "concept", "What people often get wrong about {s}."],
        ],
      },
      {
        label: (s) => `How ${s} works`,
        category: "process",
        notes: "The mechanics and moving parts of {s}.",
        take: 3,
        pool: [
          ["Mechanisms", "process", "The underlying cause-and-effect inside {s}."],
          ["Stages", "process", "The phases {s} moves through."],
          ["Inputs and outputs", "process", "What goes in, and what comes out."],
          ["Feedback loops", "process", "Where effects circle back to reinforce or dampen {s}."],
        ],
      },
      {
        label: (s) => `Origins of ${s}`,
        category: "concept",
        notes: "Where {s} came from and how it evolved.",
        take: 2,
        pool: [
          ["History", "concept", "How {s} developed over time."],
          ["Key figures", "example", "People who shaped {s}."],
          ["Turning points", "example", "Moments that changed the direction of {s}."],
        ],
      },
      {
        label: (s) => `${capitalize(s)} in practice`,
        category: "example",
        notes: "Concrete cases that make {s} tangible.",
        take: 3,
        pool: [
          ["Real-world example", "example", "A concrete case of {s} you could point to."],
          ["Surprising example", "example", "A case of {s} most people would not expect."],
          ["Analogy", "example", "Something familiar that behaves like {s}."],
          ["Everyday encounter", "example", "Where people meet {s} in daily life."],
        ],
      },
      {
        label: (s) => `Debates around ${s}`,
        category: "concept",
        notes: "Where reasonable people disagree.",
        take: 2,
        pool: [
          ["Criticisms", "concept", "The strongest arguments against common views of {s}."],
          ["Competing views", "concept", "Different schools of thought on {s}."],
          ["Tradeoffs", "concept", "What you gain and lose with {s}."],
        ],
      },
      {
        label: (s) => `Why ${s} matters`,
        category: "impact",
        notes: "Consequences and significance.",
        take: 3,
        pool: [
          ["Who it affects", "impact", "People and systems touched by {s}."],
          ["Benefits", "impact", "What {s} makes better."],
          ["Risks", "impact", "Where {s} can cause harm."],
          ["Future direction", "impact", "Where {s} seems to be heading."],
        ],
      },
      {
        label: fixed("Open questions"),
        category: "question",
        notes: "Threads worth pulling on next.",
        take: 2,
        pool: [
          ["What is still unknown?", "question", "The edges of current understanding of {s}."],
          ["What should I explore next?", "question", "A good next step for going deeper into {s}."],
          ["What would an expert add?", "question", "Gaps a specialist in {s} would notice."],
        ],
      },
    ],
    links: [
      ["Mechanisms", "Benefits", "causes"],
      ["Mechanisms", "Risks", "causes"],
      ["Key principles", "Mechanisms", "supports"],
      ["Criticisms", "Key principles", "contrasts"],
      ["Real-world example", "Key principles", "example"],
      ["History", "Turning points", "related"],
      ["Benefits", "Risks", "contrasts"],
      ["Common misconceptions", "What is still unknown?", "related"],
    ],
  },
  future: {
    lenses: [
      {
        label: (s) => `Where ${s} stands today`,
        category: "concept",
        notes: "The present baseline.",
        take: 3,
        pool: [
          ["Current landscape", "concept", "What {s} looks like right now."],
          ["Recent shifts", "process", "What has changed in the last few years."],
          ["Key players", "example", "People and organisations shaping {s}."],
          ["Baseline assumptions", "concept", "What most people currently take for granted about {s}."],
        ],
      },
      {
        label: fixed("Driving forces"),
        category: "process",
        notes: "Forces that will push {s} in new directions.",
        take: 4,
        pool: [
          ["Technology", "process", "Tools and technical change that could reshape {s}."],
          ["Economics", "concept", "Costs, incentives and who pays."],
          ["Culture and behaviour", "concept", "How attitudes and habits are shifting."],
          ["Policy and regulation", "process", "Rules that could speed up or slow down change."],
          ["Demographics", "concept", "Who is involved, and how that is changing."],
        ],
      },
      {
        label: fixed("Possible futures"),
        category: "idea",
        notes: "Scenarios, not predictions.",
        take: 3,
        pool: [
          ["Optimistic scenario", "idea", "What happens to {s} if the main trends go right."],
          ["Likely scenario", "idea", "Where {s} goes if current trends simply continue."],
          ["Pessimistic scenario", "idea", "What happens if key risks materialise."],
          ["Wildcards", "idea", "Low-probability, high-impact surprises."],
        ],
      },
      {
        label: fixed("Risks"),
        category: "impact",
        notes: "What could go wrong.",
        take: 3,
        pool: [
          ["Unintended consequences", "impact", "Second-order effects nobody planned for."],
          ["Who gets left behind", "impact", "People who may lose out as {s} changes."],
          ["Points of failure", "impact", "Single dependencies that could break."],
        ],
      },
      {
        label: fixed("Opportunities"),
        category: "impact",
        notes: "What could go right.",
        take: 3,
        pool: [
          ["New possibilities", "impact", "Things {s} could make possible for the first time."],
          ["Who benefits", "impact", "People and groups most likely to gain."],
          ["Things to build", "goal", "Products, policies or projects worth starting now."],
        ],
      },
      {
        label: fixed("Open questions"),
        category: "question",
        notes: "Uncertainties worth tracking.",
        take: 3,
        pool: [
          ["What would change the trajectory?", "question", "Events that could bend the curve for {s}."],
          ["Which signals should we watch?", "question", "Early indicators that a scenario is unfolding."],
          ["What is overhyped?", "question", "Claims about {s} that deserve scepticism."],
        ],
      },
    ],
    links: [
      ["Technology", "New possibilities", "causes"],
      ["Policy and regulation", "Who gets left behind", "related"],
      ["Recent shifts", "Likely scenario", "supports"],
      ["Optimistic scenario", "Pessimistic scenario", "contrasts"],
      ["Economics", "Who benefits", "related"],
      ["Wildcards", "What would change the trajectory?", "related"],
    ],
  },
  why: {
    lenses: [
      {
        label: fixed("Explanations"),
        category: "idea",
        notes: "Candidate answers to the question.",
        take: 3,
        pool: [
          ["Leading explanation", "idea", "The most widely accepted answer, and why it convinces."],
          ["Alternative explanations", "idea", "Other answers that also fit the facts."],
          ["Common misconceptions", "idea", "Popular answers that don't hold up."],
        ],
      },
      {
        label: fixed("Mechanisms"),
        category: "process",
        notes: "How the cause actually produces the effect.",
        take: 3,
        pool: [
          ["Underlying mechanism", "process", "The step-by-step causal story."],
          ["Chain of events", "process", "What happens first, next and last."],
          ["Necessary conditions", "concept", "What has to be true for it to happen."],
        ],
      },
      {
        label: fixed("Contributing factors"),
        category: "concept",
        notes: "Forces that make it more or less likely.",
        take: 3,
        pool: [
          ["Historical factors", "concept", "Past events that set things in motion."],
          ["Environmental factors", "concept", "Surroundings and physical conditions."],
          ["Human factors", "concept", "Choices, incentives and behaviour."],
          ["Structural factors", "concept", "Systems and institutions that shape outcomes."],
        ],
      },
      {
        label: fixed("Evidence"),
        category: "example",
        notes: "What we can actually observe.",
        take: 3,
        pool: [
          ["Observations", "example", "What people have directly seen or measured."],
          ["Studies and data", "example", "Research that tests the explanations."],
          ["Counterexamples", "example", "Cases that don't fit the leading story."],
        ],
      },
      {
        label: fixed("Consequences"),
        category: "impact",
        notes: "What follows from it.",
        take: 3,
        pool: [
          ["Direct effects", "impact", "Immediate results."],
          ["Long-term effects", "impact", "Outcomes that unfold over years."],
          ["Who is affected", "impact", "People and systems on the receiving end."],
        ],
      },
      {
        label: fixed("Open questions"),
        category: "question",
        notes: "What remains unresolved.",
        take: 3,
        pool: [
          ["What is still unknown?", "question", "Gaps in current understanding."],
          ["How could we test this?", "question", "An observation or experiment that would settle it."],
          ["What would disprove it?", "question", "Evidence that would overturn the leading explanation."],
        ],
      },
    ],
    links: [
      ["Underlying mechanism", "Leading explanation", "supports"],
      ["Studies and data", "Leading explanation", "supports"],
      ["Counterexamples", "Leading explanation", "contrasts"],
      ["Chain of events", "Direct effects", "causes"],
      ["Human factors", "Underlying mechanism", "related"],
      ["How could we test this?", "Studies and data", "related"],
    ],
  },
  how: {
    lenses: [
      {
        label: fixed("Building blocks"),
        category: "concept",
        notes: "The parts that make it up.",
        take: 3,
        pool: [
          ["Core components", "concept", "The essential pieces of {s}."],
          ["Key terms", "concept", "Vocabulary that makes {s} easier to discuss."],
          ["Inputs", "concept", "What {s} needs to get started."],
        ],
      },
      {
        label: fixed("The process"),
        category: "process",
        notes: "How the pieces interact over time.",
        take: 3,
        pool: [
          ["Step by step", "process", "The sequence of events in {s}."],
          ["Feedback loops", "process", "Where outputs circle back as inputs."],
          ["Bottlenecks", "process", "The slowest or most fragile step."],
        ],
      },
      {
        label: fixed("Conditions"),
        category: "concept",
        notes: "When it works and when it doesn't.",
        take: 3,
        pool: [
          ["What it requires", "concept", "Preconditions for {s}."],
          ["What disrupts it", "impact", "Things that interfere or break it."],
          ["Context", "concept", "Surroundings that change how {s} behaves."],
        ],
      },
      {
        label: fixed("Examples"),
        category: "example",
        notes: "Seeing it in action.",
        take: 3,
        pool: [
          ["Everyday example", "example", "A place you can observe {s} directly."],
          ["Edge case", "example", "An unusual situation that tests the rules."],
          ["Analogy", "example", "A familiar system that works similarly."],
        ],
      },
      {
        label: fixed("Results"),
        category: "impact",
        notes: "What it produces.",
        take: 3,
        pool: [
          ["Outputs", "impact", "What {s} ultimately produces."],
          ["Side effects", "impact", "By-products and unintended results."],
          ["Why it matters", "impact", "Why understanding {s} is useful."],
        ],
      },
      {
        label: fixed("Open questions"),
        category: "question",
        notes: "Where understanding runs out.",
        take: 3,
        pool: [
          ["Where does it break down?", "question", "Limits of the current model."],
          ["What is still debated?", "question", "Points where experts disagree."],
          ["How could it be improved?", "question", "Ideas for making {s} work better."],
        ],
      },
    ],
    links: [
      ["Core components", "Step by step", "supports"],
      ["Inputs", "Outputs", "causes"],
      ["What disrupts it", "Bottlenecks", "related"],
      ["Everyday example", "Step by step", "example"],
      ["Side effects", "Outputs", "contrasts"],
      ["Feedback loops", "Outputs", "causes"],
    ],
  },
  pursuit: {
    lenses: [
      {
        label: fixed("Why it matters"),
        category: "goal",
        notes: "The reason behind the effort.",
        take: 3,
        pool: [
          ["Motivation", "goal", "Why you want this, in your own words."],
          ["What success looks like", "goal", "A concrete picture of the finished state."],
          ["Time horizon", "goal", "When you'd like to get there."],
        ],
      },
      {
        label: fixed("Foundations"),
        category: "concept",
        notes: "What you need to understand first.",
        take: 3,
        pool: [
          ["Core skills", "concept", "The few skills that do most of the work."],
          ["Prerequisites", "concept", "What has to be in place before you start."],
          ["Mental models", "concept", "Ways of thinking that make progress easier."],
        ],
      },
      {
        label: fixed("Plan"),
        category: "process",
        notes: "Turning intention into action.",
        take: 4,
        pool: [
          ["First step", "process", "The smallest action you could take today."],
          ["Practice routine", "process", "A repeatable session that compounds."],
          ["Next milestone", "goal", "A visible checkpoint a few weeks out."],
          ["Feedback", "process", "How you will know what is working."],
        ],
      },
      {
        label: fixed("Resources"),
        category: "example",
        notes: "What can help along the way.",
        take: 3,
        pool: [
          ["Tools", "example", "Software, equipment or templates that remove friction."],
          ["Mentors and community", "example", "People who have done this before."],
          ["Learning materials", "example", "Books, courses and examples worth studying."],
        ],
      },
      {
        label: fixed("Obstacles"),
        category: "impact",
        notes: "What tends to get in the way.",
        take: 3,
        pool: [
          ["Time and energy", "impact", "Competing priorities and limited focus."],
          ["Common mistakes", "impact", "Traps beginners often fall into."],
          ["Plateaus", "impact", "Stretches where progress stalls."],
        ],
      },
      {
        label: fixed("Questions"),
        category: "question",
        notes: "Questions to answer as you go.",
        take: 3,
        pool: [
          ["What is the smallest next action?", "question", "Make it small enough to start today."],
          ["How will I measure progress?", "question", "Pick one signal and track it."],
          ["Who has done this before?", "question", "Find someone a few steps ahead."],
        ],
      },
    ],
    links: [
      ["First step", "Next milestone", "supports"],
      ["Practice routine", "Plateaus", "contrasts"],
      ["Mentors and community", "Common mistakes", "related"],
      ["Feedback", "Practice routine", "supports"],
      ["Motivation", "Time and energy", "related"],
      ["How will I measure progress?", "Feedback", "related"],
    ],
  },
};

function fill(text: string, subject: string): string {
  return text.replace(/\{s\}/g, inline(subject));
}

function seededTake<T>(items: readonly T[], count: number, rnd: () => number): T[] {
  const indexed = items.map((item, i) => ({ item, i, r: rnd() }));
  // Keep the first item (usually the most important) and sample the rest, preserving authored order.
  const [first, ...rest] = indexed;
  const chosen = [first, ...rest.sort((a, b) => a.r - b.r).slice(0, Math.max(0, count - 1))];
  return chosen.sort((a, b) => a.i - b.i).map((c) => c.item);
}

// ---------------------------------------------------------------------------
// Builders

function addTemplateBranch(builder: GraphBuilder, parentId: string, node: TemplateNode, depth: number): void {
  const id = builder.addNode({ label: node.label, notes: node.notes, category: node.category, kind: kindForDepth(depth, node.category) });
  if (!id) return;
  if (node.category === "example" && depth > 1) builder.addEdge(id, parentId, "example");
  else builder.addEdge(parentId, id, "related");
  for (const child of node.children ?? []) addTemplateBranch(builder, id, child, depth + 1);
}

function buildFromTemplate(template: TopicTemplate, analysis: TopicAnalysis): GraphBuilder {
  const builder = new GraphBuilder();
  const coreId = builder.addNode({
    label: analysis.core,
    notes: "Your central topic. Branches were drafted locally from a built-in knowledge template — edit, remove or extend anything.",
    category: "concept",
    kind: "core",
  });
  if (!coreId) return builder;
  for (const branch of template.branches) addTemplateBranch(builder, coreId, branch, 1);
  for (const [from, to, relation] of template.links) {
    builder.addEdge(builder.idForLabel(from) ?? null, builder.idForLabel(to) ?? null, relation);
  }
  return builder;
}

function buildFromFrame(analysis: TopicAnalysis): GraphBuilder {
  const builder = new GraphBuilder();
  const rnd = createRng(hashString(analysis.core.toLowerCase()));
  const subject = analysis.subject.length > 34 ? "this topic" : analysis.subject;
  const coreId = builder.addNode({
    label: analysis.core,
    notes: "Your central topic. Mindspace drafted a thinking scaffold around it with local heuristics — rename branches and fill in what you know.",
    category: "concept",
    kind: "core",
  });
  if (!coreId) return builder;

  if (analysis.frame === "compare" && analysis.compare) {
    buildComparison(builder, coreId, analysis.compare);
    return builder;
  }

  const frame = FRAMES[analysis.frame as Exclude<FrameId, "compare">];
  const shortSubject = subject.split(" ").length <= 4 && subject !== "this topic";
  for (const lens of frame.lenses) {
    const lensLabel = shortSubject ? capitalize(lens.label(inline(subject))) : genericLensLabel(lens.label("it"));
    const lensId = builder.addNode({
      label: lensLabel,
      notes: fill(lens.notes, subject),
      category: lens.category,
      kind: "planet",
    });
    if (!lensId) continue;
    builder.addEdge(coreId, lensId, "related");
    for (const [leafLabel, category, notes] of seededTake(lens.pool, lens.take, rnd)) {
      const leafId = builder.addNode({ label: leafLabel, notes: fill(notes, subject), category, kind: kindForDepth(2, category) });
      if (category === "example") builder.addEdge(leafId, lensId, "example");
      else builder.addEdge(lensId, leafId, "related");
    }
  }
  for (const [from, to, relation] of frame.links) {
    builder.addEdge(builder.idForLabel(from) ?? null, builder.idForLabel(to) ?? null, relation);
  }
  return builder;
}

/** When the subject itself is too long to inline, fall back to neutral lens names. */
function genericLensLabel(label: string): string {
  return capitalize(
    label
      .replace(/^Origins of it$/i, "Origins")
      .replace(/^It in practice$/i, "In practice")
      .replace(/^Debates around it$/i, "Debates")
      .replace(/^Where it stands today$/i, "Where things stand"),
  );
}

function buildComparison(builder: GraphBuilder, coreId: string, [a, b]: [string, string]): void {
  const sides: Array<[string, string]> = [
    [a, b],
    [b, a],
  ];
  const sideIds: string[] = [];
  for (const [side, other] of sides) {
    const sideId = builder.addNode({ label: side, notes: `One side of the comparison with ${other}.`, category: "concept", kind: "planet" });
    if (!sideId) continue;
    sideIds.push(sideId);
    builder.addEdge(coreId, sideId, "related");
    const leaves: Leaf[] = [
      [`${side} strengths`, "impact", `Where ${side} clearly wins.`],
      [`${side} weaknesses`, "impact", `Where ${side} falls short.`],
      [`Best uses of ${side}`, "example", `Situations where ${side} is the natural choice.`],
    ];
    for (const [label, category, notes] of leaves) {
      const id = builder.addNode({ label, notes, category, kind: "star" });
      if (category === "example") builder.addEdge(id, sideId, "example");
      else builder.addEdge(sideId, id, "related");
    }
  }
  const shared: Array<[string, Category, string, Leaf[]]> = [
    ["Similarities", "concept", "What both have in common.", [["Shared goals", "concept", "What both are trying to achieve."], ["Common ground", "concept", "Overlapping features and assumptions."]]],
    ["Key differences", "concept", "Where they genuinely diverge.", [["Philosophy", "concept", "Different underlying approaches."], ["Cost and effort", "concept", "Resources each one demands."]]],
    ["Decision criteria", "goal", "How to choose between them.", [["When to choose which", "question", "Rules of thumb for picking one."], ["What matters most to me?", "question", "The criteria that should drive the decision."]]],
  ];
  for (const [label, category, notes, leaves] of shared) {
    const id = builder.addNode({ label, notes, category, kind: "planet" });
    builder.addEdge(coreId, id, "related");
    for (const [leafLabel, leafCategory, leafNotes] of leaves) {
      const leafId = builder.addNode({ label: leafLabel, notes: leafNotes, category: leafCategory, kind: kindForDepth(2, leafCategory) });
      builder.addEdge(id, leafId, "related");
    }
  }
  if (sideIds.length === 2) builder.addEdge(sideIds[0], sideIds[1], "contrasts");
  builder.addEdge(builder.idForLabel(`${a} strengths`) ?? null, builder.idForLabel(`${b} weaknesses`) ?? null, "contrasts");
  builder.addEdge(builder.idForLabel("Philosophy") ?? null, builder.idForLabel("When to choose which") ?? null, "supports");
}

export function generateFromTopic(raw: string): TopicResult {
  const analysis = analyzeTopic(raw);
  const template = analysis.frame === "compare" ? null : matchTemplate(raw);
  if (template) {
    return { builder: buildFromTemplate(template, analysis), title: analysis.core, method: "template", templateId: template.id };
  }
  return { builder: buildFromFrame(analysis), title: analysis.core, method: "frame" };
}
