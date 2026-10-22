"use client";

import { ConnectionMode, MiniMap, ReactFlow, useReactFlow, useStoreApi, type IsValidConnection, type MiniMapNodeProps } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IdeaEdge, IdeaNode as IdeaNodeType, Relation } from "@/types/graph";
import { isAttribution, RELATIONS, RESEARCH_RELATIONS } from "@/types/graph";
import { hasConnection } from "@/lib/graph/ops";
import { categoryColor, ROLE_COLORS } from "@/lib/space/palette";
import { useMindspace } from "@/lib/store";
import { focusOn, requestDeleteNodes, requestRename, startConnect } from "@/lib/store/actions";
import { pointerStore } from "@/lib/utils/pointer";
import { CameraController } from "./CameraController";
import { ConnectionBeam } from "./ConnectionBeam";
import { ContextMenu, type MenuTarget } from "./ContextMenu";
import { CosmicEdge } from "./CosmicEdge";
import { IdeaNode } from "./IdeaNode";
import { MeasureGuard } from "./MeasureGuard";
import { SpaceBackground } from "./SpaceBackground";

const nodeTypes = { idea: IdeaNode };
const edgeTypes = { cosmic: CosmicEdge };
const NODE_ORIGIN: [number, number] = [0.5, 0.5];

function MiniNode({ x, y, width, height, color }: MiniMapNodeProps) {
  const size = Math.max(16, Math.min(width, height) * 0.7);
  return <rect x={x + width / 2 - size / 2} y={y + height / 2 - size / 2} width={size} height={size} fill={color} shapeRendering="crispEdges" />;
}

/** Writes zoom-dependent state straight to the DOM so zooming never re-renders the graph. */
function useZoomAttributes() {
  const store = useStoreApi();
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let lastBand = "";
    let lastScale = "";
    const apply = (zoom: number) => {
      const el = wrapper.current;
      if (!el) return;
      const band = zoom < 0.56 ? "far" : zoom < 0.9 ? "mid" : "near";
      if (band !== lastBand) {
        el.dataset.zoom = band;
        lastBand = band;
      }
      // Keep the core and planet labels readable when zoomed out, in coarse steps.
      const scale = zoom >= 0.75 ? "1" : Math.min(2.2, Math.round((0.75 / zoom) * 4) / 4).toString();
      if (scale !== lastScale) {
        el.style.setProperty("--ms-label-scale", scale);
        lastScale = scale;
      }
    };
    apply(store.getState().transform[2]);
    return store.subscribe((state) => apply(state.transform[2]));
  }, [store]);
  return wrapper;
}

export function GraphCanvas() {
  const nodes = useMindspace((s) => s.nodes);
  const edges = useMindspace((s) => s.edges);
  const minimapOpen = useMindspace((s) => s.minimapOpen);
  const onNodesChange = useMindspace((s) => s.onNodesChange);
  const onEdgesChange = useMindspace((s) => s.onEdgesChange);
  const flow = useReactFlow<IdeaNodeType, IdeaEdge>();
  const wrapperRef = useZoomAttributes();
  const [menu, setMenu] = useState<MenuTarget | null>(null);

  const isValidConnection: IsValidConnection<IdeaEdge> = useCallback((connection) => {
    if (connection.source === connection.target) return false;
    return !hasConnection(useMindspace.getState().edges, connection.source, connection.target);
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  // Leave any connection highlight state if the pointer is released elsewhere.
  useEffect(() => {
    const el = wrapperRef.current;
    const end = () => el?.classList.remove("ms-connecting");
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, [wrapperRef]);

  const store = useMindspace;
  const actions = {
    addChild: (id: string) => store.getState().addChild(id),
    connectFrom: startConnect,
    focus: focusOn,
    duplicate: (id: string) => store.getState().duplicateNode(id),
    removeNode: (id: string) => requestDeleteNodes([id]),
    addAt: (position: { x: number; y: number }) => store.getState().addIdeaAt(position),
    fit: () => void flow.fitView({ padding: 0.16, duration: 500, maxZoom: 1.15 }),
    relayout: () => store.getState().relayout(),
    setRelation: (id: string, relation: Relation) => store.getState().setRelation(id, relation),
    reverse: (id: string) => store.getState().reverseEdge(id),
    removeEdge: (id: string) => store.getState().deleteEdge(id),
  };

  return (
    <div
      ref={wrapperRef}
      className="ms-flow absolute inset-0"
      data-zoom="near"
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        pointerStore.set(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      }}
      onPointerLeave={() => pointerStore.set(null)}
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement;
        if (!target.classList.contains("react-flow__pane")) return;
        store.getState().addIdeaAt(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      }}
    >
      <SpaceBackground />
      <ReactFlow<IdeaNodeType, IdeaEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodeOrigin={NODE_ORIGIN}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(connection) => store.getState().connectNodes(connection.source, connection.target)}
        onConnectStart={() => wrapperRef.current?.classList.add("ms-connecting")}
        onConnectEnd={() => wrapperRef.current?.classList.remove("ms-connecting")}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        connectionLineComponent={ConnectionBeam}
        connectionRadius={34}
        onNodeMouseEnter={(_, node) => store.getState().setHover(node.id)}
        onNodeMouseLeave={() => store.getState().setHover(null)}
        onNodeDragStart={() => store.getState().beginDrag()}
        onNodeDragStop={() => store.getState().endDrag()}
        onSelectionDragStart={() => store.getState().beginDrag()}
        onSelectionDragStop={() => store.getState().endDrag()}
        onNodeClick={(_, node) => {
          const state = store.getState();
          const source = state.linkSourceId;
          if (!source || source === node.id) return;
          if (state.connectNodes(source, node.id)) state.selectNode(source);
        }}
        onNodeDoubleClick={(_, node) => requestRename(node.id)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          store.getState().selectNode(node.id);
          setMenu({ type: "node", id: node.id, x: event.clientX, y: event.clientY });
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          store.getState().selectEdge(edge.id);
          const relation = edge.data?.relation ?? "related";
          const discovery = store.getState().current?.workspace === "discovery";
          const relations = isAttribution(relation) ? [] : discovery ? RESEARCH_RELATIONS : RELATIONS;
          setMenu({ type: "edge", id: edge.id, relation, x: event.clientX, y: event.clientY, relations });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          setMenu({ type: "pane", x: event.clientX, y: event.clientY, flow: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
        }}
        onPaneClick={() => {
          setMenu(null);
          if (store.getState().linkSourceId) store.getState().startLink(null);
        }}
        onMoveEnd={(_, viewport) => store.getState().setViewport(viewport)}
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={["Meta", "Control"]}
        zoomOnDoubleClick={false}
        minZoom={0.12}
        maxZoom={2.6}
        elevateNodesOnSelect
        nodeDragThreshold={2}
        proOptions={{ hideAttribution: false }}
        attributionPosition="bottom-right"
        aria-label="Mind map canvas"
      >
        {minimapOpen && (
          <MiniMap<IdeaNodeType>
            position="bottom-right"
            pannable
            zoomable
            ariaLabel="Minimap"
            nodeComponent={MiniNode}
            nodeColor={(node) =>
              node.data.role ? ROLE_COLORS[node.data.role] : node.data.kind === "core" ? "#FFFFFF" : categoryColor(node.data.category)
            }
            maskColor="rgba(3, 4, 10, 0.72)"
            style={{ width: 188, height: 132, bottom: 64, right: 16 }}
          />
        )}
        <CameraController />
        <MeasureGuard />
      </ReactFlow>
      {menu && <ContextMenu target={menu} onClose={closeMenu} actions={actions} />}
    </div>
  );
}
