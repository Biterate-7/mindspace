import type { EdgeChange, NodeChange, Viewport } from "@xyflow/react";
import type { IdeaData, IdeaEdge, IdeaNode, InputMode, MapMeta, MindMap, Preferences, Relation } from "@/types/graph";
import type { Emphasis } from "@/lib/graph/emphasis";
import type { History } from "@/lib/graph/history";

export type View = "loading" | "create" | "workspace";
export type SaveStatus = "saved" | "saving" | "error" | "memory";

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
  action?: { label: string; run: () => void };
}

export type Dialog =
  | null
  | { type: "shortcuts" }
  | { type: "command" }
  | { type: "export" }
  | { type: "confirm"; title: string; body: string; confirmLabel: string; run: () => void };

/** One-shot camera instructions, executed by the CameraController inside React Flow. */
export type CameraRequest =
  | { type: "fit"; ids?: string[]; nonce: number; duration?: number; intro?: boolean }
  | { type: "center"; id: string; nonce: number; zoom?: number }
  | { type: "viewport"; viewport: Viewport; nonce: number };

export type MapInfo = Omit<MindMap, "nodes" | "edges">;

export interface GraphSlice {
  nodes: IdeaNode[];
  edges: IdeaEdge[];
  history: History;
  /** Bumped on every persisted graph change; drives autosave. */
  version: number;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  hoverId: string | null;
  focusMode: boolean;
  focusId: string | null;
  searchQuery: string;
  searchMatches: string[] | null;
  searchIndex: number;
  emphasis: Emphasis;
  intro: IntroPlan | null;
  leaving: Record<string, true>;
  linkSourceId: string | null;
  /** A node just created by the user; the inspector focuses its title for immediate naming. */
  freshNodeId: string | null;

  onNodesChange: (changes: NodeChange<IdeaNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<IdeaEdge>[]) => void;
  beginDrag: () => void;
  endDrag: () => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setHover: (id: string | null) => void;
  addChild: (parentId?: string | null) => void;
  addIdeaAt: (position: { x: number; y: number }) => void;
  connectNodes: (source: string, target: string, relation?: Relation) => boolean;
  updateNode: (id: string, patch: Partial<IdeaData>) => void;
  deleteNodes: (ids: string[]) => void;
  deleteSelection: () => void;
  deleteEdge: (id: string) => void;
  setRelation: (edgeId: string, relation: Relation) => void;
  reverseEdge: (edgeId: string) => void;
  duplicateNode: (id: string) => void;
  relayout: () => void;
  undo: () => void;
  redo: () => void;
  setFocusMode: (on: boolean) => void;
  setSearch: (query: string) => void;
  stepSearch: (direction: 1 | -1) => void;
  startLink: (sourceId: string | null) => void;
  clearFresh: () => void;
}

export interface IntroPlan {
  nodes: Record<string, number>;
  edges: Record<string, number>;
  until: number;
}

export interface LibrarySlice {
  maps: MapMeta[];
  current: MapInfo | null;
  saveStatus: SaveStatus;
  storagePersistent: boolean;
  prefs: Preferences;
  /** Bumped when only the camera changed; saved quietly without a status flash. */
  viewVersion: number;

  init: () => void;
  generate: (mode: InputMode, input: string) => boolean;
  openMap: (id: string) => void;
  renameMap: (title: string) => void;
  deleteMap: (id: string) => void;
  duplicateMap: (id: string) => void;
  toggleStar: (id: string) => void;
  clearAllData: () => void;
  setViewport: (viewport: Viewport) => void;
  setPrefs: (patch: Partial<Preferences>) => void;
  flushSave: () => void;
}

export interface UiSlice {
  view: View;
  createOpen: boolean;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  minimapOpen: boolean;
  dialog: Dialog;
  toasts: Toast[];
  camera: CameraRequest | null;
  draft: { mode: InputMode; input: string };

  openCreate: () => void;
  closeCreate: () => void;
  setDraft: (draft: Partial<{ mode: InputMode; input: string }>) => void;
  toggleSidebar: (open?: boolean) => void;
  toggleInspector: (open?: boolean) => void;
  toggleMinimap: () => void;
  setDialog: (dialog: Dialog) => void;
  toast: (message: string, options?: { tone?: Toast["tone"]; action?: Toast["action"]; duration?: number }) => void;
  dismissToast: (id: string) => void;
  requestCamera: (request: DistributiveOmit<CameraRequest, "nonce">) => void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Store = GraphSlice & LibrarySlice & UiSlice;
