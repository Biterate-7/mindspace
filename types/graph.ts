import type { Edge, Node, Viewport } from "@xyflow/react";

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

export type Relation = "related" | "causes" | "supports" | "example" | "contrasts";

export const RELATIONS: readonly Relation[] = ["related", "causes", "supports", "example", "contrasts"];

export type InputMode = "topic" | "text" | "dump";

export interface IdeaData extends Record<string, unknown> {
  label: string;
  notes: string;
  category: Category;
  kind: NodeKind;
  /** Stable visual seed so a node keeps its look across sessions. */
  seed: number;
}

export interface LinkData extends Record<string, unknown> {
  relation: Relation;
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
}

export interface Preferences {
  lastMapId: string | null;
  sidebarOpen: boolean;
  minimapOpen: boolean;
  exportFrame: boolean;
  exportBackground: "space" | "plain";
}

export const DEFAULT_PREFERENCES: Preferences = {
  lastMapId: null,
  sidebarOpen: true,
  minimapOpen: false,
  exportFrame: true,
  exportBackground: "space",
};
