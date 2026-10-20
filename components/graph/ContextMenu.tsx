"use client";

import { ArrowLeftRight, Copy, Crosshair, LayoutGrid, Link2, Maximize, Plus, Trash2, Unlink } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { RELATIONS, type Relation } from "@/types/graph";
import { RELATION_LABELS } from "@/lib/generation/relations";
import { RELATION_COLORS } from "@/lib/space/palette";

export type MenuTarget =
  | { type: "node"; id: string; x: number; y: number }
  | { type: "edge"; id: string; relation: Relation; x: number; y: number }
  | { type: "pane"; x: number; y: number; flow: { x: number; y: number } };

interface Item {
  key: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  checked?: boolean;
  color?: string;
  run: () => void;
}

interface ContextMenuProps {
  target: MenuTarget;
  onClose: () => void;
  actions: {
    addChild: (id: string) => void;
    connectFrom: (id: string) => void;
    focus: (id: string) => void;
    duplicate: (id: string) => void;
    removeNode: (id: string) => void;
    addAt: (position: { x: number; y: number }) => void;
    fit: () => void;
    relayout: () => void;
    setRelation: (id: string, relation: Relation) => void;
    reverse: (id: string) => void;
    removeEdge: (id: string) => void;
  };
}

/** Right-click menu for nodes, connections and empty space. Keyboard navigable. */
export function ContextMenu({ target, onClose, actions }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const items: Item[] =
    target.type === "node"
      ? [
          { key: "child", label: "Add child idea", icon: <Plus size={14} />, shortcut: "A", run: () => actions.addChild(target.id) },
          { key: "connect", label: "Connect to…", icon: <Link2 size={14} />, shortcut: "C", run: () => actions.connectFrom(target.id) },
          { key: "focus", label: "Focus on this", icon: <Crosshair size={14} />, shortcut: "⇧F", run: () => actions.focus(target.id) },
          { key: "dup", label: "Duplicate", icon: <Copy size={14} />, shortcut: "Ctrl D", run: () => actions.duplicate(target.id) },
          { key: "delete", label: "Delete", icon: <Trash2 size={14} />, shortcut: "Del", danger: true, run: () => actions.removeNode(target.id) },
        ]
      : target.type === "edge"
        ? [
            ...RELATIONS.map((relation) => ({
              key: relation,
              label: RELATION_LABELS[relation],
              checked: relation === target.relation,
              color: RELATION_COLORS[relation],
              run: () => actions.setRelation(target.id, relation),
            })),
            { key: "reverse", label: "Reverse direction", icon: <ArrowLeftRight size={14} />, run: () => actions.reverse(target.id) },
            { key: "remove", label: "Remove connection", icon: <Unlink size={14} />, danger: true, run: () => actions.removeEdge(target.id) },
          ]
        : [
            { key: "add", label: "Add idea here", icon: <Plus size={14} />, run: () => actions.addAt(target.flow) },
            { key: "fit", label: "Fit galaxy to view", icon: <Maximize size={14} />, shortcut: "F", run: actions.fit },
            { key: "layout", label: "Reorganize layout", icon: <LayoutGrid size={14} />, shortcut: "R", run: actions.relayout },
          ];

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]');
    first?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? [])];
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const next = nodes[(index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length];
    next?.focus();
  };

  const width = 220;
  const left = typeof window === "undefined" ? target.x : Math.min(target.x, window.innerWidth - width - 8);
  const top = typeof window === "undefined" ? target.y : Math.min(target.y, window.innerHeight - items.length * 34 - 24);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={target.type === "node" ? "Idea actions" : target.type === "edge" ? "Connection actions" : "Canvas actions"}
      className="px-panel px-rivets fixed z-[70] py-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
      style={{ left, top, width }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {target.type === "edge" && <p className="px-caption px-3 pb-1 pt-1.5">Relationship</p>}
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role={item.checked !== undefined ? "menuitemradio" : "menuitem"}
          aria-checked={item.checked}
          className={`flex h-8 w-full items-center gap-2.5 px-3 text-left text-[13px] outline-none transition-colors hover:bg-white/5 focus-visible:bg-white/[0.07] ${item.danger ? "text-danger" : "text-ink"}`}
          onClick={() => {
            item.run();
            onClose();
          }}
        >
          {item.color ? (
            <span className="flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
              <span className="h-2 w-2" style={{ background: item.color, opacity: item.checked ? 1 : 0.45 }} />
            </span>
          ) : (
            <span className="text-ink-2" aria-hidden="true">
              {item.icon}
            </span>
          )}
          <span className="flex-1">{item.label}</span>
          {item.checked && <span className="font-pixel text-[8px] text-accent">ON</span>}
          {item.shortcut && <kbd className="px-kbd">{item.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}
