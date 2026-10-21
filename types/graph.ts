import type { Edge, Node, Viewport } from "@xyflow/react";
import type { ConceptInfo, EdgeReview, Evidence, ResearchMeta, SourceInfo } from "./research";

/** The celestial body used to draw a node. Roughly maps to its depth in the map. */
export type NodeKind = "core" | "planet" | "star" | "moon";

export const NODE_KINDS: readonly NodeKind[] = ["core", "planet", "star", "moon"];

export type Category =
  | "concept"
  | "process"
  | "example"
  | "impact"
  | "question"
  | "goal"
  | "idea"
  | "note";

export const CATEGORIES: readonly Category[] = [
  "concept",
  "process",
  "example",
  "impact",
  "question",
  "goal",
  "idea",
  "note",
];

/**
 * Relationship types. The first five are the Create-mode vocabulary; Discovery adds
 * contradiction, attribution (source links) and the user's own asserted links.
 */
export type Relation = "related" | "causes" | "supports" | "example" | "contrasts" | "contradicts" | "mentions" | "extracted" | "believes";

/** Relationship choices offered in Create mode. */
export const RELATIONS: readonly Relation[] = ["related", "causes", "supports", "example", "contrasts"];

/** Semantic relationship choices offered in Discovery. */
export const RESEARCH_RELATIONS: readonly Relation[] = ["related", "supports", "contradicts", "causes", "example", "contrasts", "believes"];

/** Source attribution: concept → source. Kept apart from semantic relationships. */
export const ATTRIBUTION_RELATIONS: readonly Relation[] = ["extracted", "mentions"];

export const ALL_RELATIONS: readonly Relation[] = [...RELATIONS, "contradicts", "believes", ...ATTRIBUTION_RELATIONS];

export function isAttribution(relation: Relation | undefined): boolean {
  return relation === "extracted" || relation === "mentions";
}

export type InputMode = "topic" | "text" | "dump";

/** Discovery node roles. Nodes without a role are the user's own ideas. */
export type NodeRole = "source" | "concept";

export interface IdeaData extends Record<string, unknown> {
  label: string;
  notes: string;
  category: Category;
  kind: NodeKind;
  /** Stable visual seed so a node keeps its look across sessions. */
  seed: number;
  role?: NodeRole;
  source?: SourceInfo;
  concept?: ConceptInfo;
}

export interface LinkData extends Record<string, unknown> {
  relation: Relation;
  /** Discovery: suggested links start unreviewed; users accept them or mark them as hypotheses. */
  review?: EdgeReview;
  /** Why the user believes the two ideas are connected. */
  rationale?: string;
  /** The passage that suggested an automatic link. */
  evidence?: Evidence;
  /** True when Mindspace created the link rather than the user. */
  auto?: boolean;
}

export type IdeaNode = Node<IdeaData, "idea">;
export type IdeaEdge = Edge<LinkData, "cosmic">;

/** A plain, serialisable graph used by the generation engine, history and storage. */
export interface GraphNode {
  id: string;
  position: { x: number; y: number };
  data: IdeaData;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data: LinkData;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface MindMap extends Graph {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  starred: boolean;
  source: { mode: InputMode; input: string };
  viewport?: Viewport;
  /** Absent for Create-mode maps, which keeps every existing saved map valid. */
  workspace?: "discovery";
  research?: ResearchMeta;
}

export interface MapMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  starred: boolean;
  nodeCount: number;
  edgeCount: number;
  mode: InputMode;
  workspace?: "discovery";
}

export interface Preferences {
  lastMapId: string | null;
  /** Most recent Discovery workspace. Optional so preferences saved before Discovery stay valid. */
  lastResearchId?: string | null;
  sidebarOpen: boolean;
  minimapOpen: boolean;
  exportFrame: boolean;
  exportBackground: "space" | "plain";
}

export const DEFAULT_PREFERENCES: Preferences = {
  lastMapId: null,
  lastResearchId: null,
  sidebarOpen: true,
  minimapOpen: false,
  exportFrame: true,
  exportBackground: "space",
};
