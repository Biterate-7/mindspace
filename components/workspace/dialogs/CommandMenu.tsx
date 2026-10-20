"use client";

import { useReactFlow } from "@xyflow/react";
import { Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useMindspace } from "@/lib/store";
import { focusOn, openExport, requestDeleteMap, requestDeleteSelection, startConnect } from "@/lib/store/actions";

interface Command {
  id: string;
  label: string;
  group: "Actions" | "Ideas";
  hint?: string;
  shortcut?: string;
  run: () => void;
  icon?: ReactNode;
}

function score(label: string, query: string): number {
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 1;
  if (l.startsWith(q)) return 3;
  if (l.includes(q)) return 2;
  // Subsequence match ("rlo" -> "Reorganize layout").
  let i = 0;
  for (const ch of l) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const flow = useReactFlow();
  const nodes = useMindspace((s) => s.nodes);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const s = useMindspace.getState;
    const selected = s().selectedNodeId;
    const actions: Command[] = [
      { id: "new", label: "New map", group: "Actions", shortcut: "N", run: () => s().openCreate() },
      { id: "add", label: selected ? "Add child idea" : "Add idea", group: "Actions", shortcut: "A", run: () => s().addChild() },
      { id: "fit", label: "Fit galaxy to view", group: "Actions", shortcut: "F", run: () => void flow.fitView({ padding: 0.16, duration: 500, maxZoom: 1.15 }) },
      { id: "layout", label: "Reorganize layout", group: "Actions", shortcut: "R", run: () => s().relayout() },
      { id: "export", label: "Export PNG", group: "Actions", shortcut: "E", run: openExport },
      { id: "search", label: "Search ideas", group: "Actions", shortcut: "/", run: () => setTimeout(() => document.getElementById("ms-search")?.focus(), 30) },
      { id: "minimap", label: s().minimapOpen ? "Hide minimap" : "Show minimap", group: "Actions", shortcut: "M", run: () => s().toggleMinimap() },
      { id: "undo", label: "Undo", group: "Actions", shortcut: "Ctrl Z", run: () => s().undo() },
      { id: "redo", label: "Redo", group: "Actions", shortcut: "Ctrl ⇧ Z", run: () => s().redo() },
      { id: "shortcuts", label: "Keyboard shortcuts", group: "Actions", shortcut: "?", run: () => setTimeout(() => s().setDialog({ type: "shortcuts" }), 0) },
    ];
    if (selected) {
      actions.splice(
        2,
        0,
        { id: "connect", label: "Connect selected idea…", group: "Actions", shortcut: "C", run: () => startConnect(selected) },
        { id: "focus", label: "Focus on selected idea", group: "Actions", shortcut: "⇧F", run: () => focusOn(selected) },
        { id: "duplicate", label: "Duplicate selected idea", group: "Actions", shortcut: "Ctrl D", run: () => s().duplicateNode(selected) },
        { id: "delete", label: "Delete selection", group: "Actions", shortcut: "Del", run: requestDeleteSelection },
      );
    }
    const current = s().current;
    if (current) {
      actions.push(
        { id: "dup-map", label: "Duplicate this map", group: "Actions", run: () => s().duplicateMap(current.id) },
        { id: "del-map", label: "Delete this map…", group: "Actions", run: () => setTimeout(() => requestDeleteMap(current.id), 0) },
      );
    }
    const ideas: Command[] = nodes.map((n) => ({
      id: `node-${n.id}`,
      label: n.data.label,
      group: "Ideas",
      hint: n.data.kind,
      run: () => {
        s().selectNode(n.id);
        s().requestCamera({ type: "center", id: n.id, zoom: 1.1 });
      },
    }));
    return [...actions, ...ideas];
    // Recompute whenever the menu opens or the ideas change.
  }, [nodes, flow, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const scored = commands.map((c) => ({ c, s: score(c.label, query.trim()) })).filter((x) => x.s > 0);
    const limited = query.trim() ? scored.sort((a, b) => b.s - a.s) : scored.filter((x) => x.c.group === "Actions");
    return limited.slice(0, 40).map((x) => x.c);
  }, [commands, query]);

  const close = () => {
    setQuery("");
    setActive(0);
    onClose();
  };

  const run = (command: Command | undefined) => {
    if (!command) return;
    close();
    command.run();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Command menu"
      width={560}
      align="top"
      header={
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="text-ink-3" aria-hidden="true" />
          <input
            data-autofocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(results[active]);
              }
            }}
            placeholder="Type a command or the name of an idea"
            aria-label="Command or idea"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
          />
          <kbd className="px-kbd">Esc</kbd>
        </div>
      }
    >
      <ul id="command-results" role="listbox" className="max-h-[50vh] overflow-y-auto py-1.5">
        {results.length === 0 && <li className="px-4 py-3 text-[13px] text-ink-3">Nothing matches “{query}”.</li>}
        {results.map((command, index) => {
          const showGroup = index === 0 || results[index - 1].group !== command.group;
          return (
            <li key={command.id} role="presentation">
              {showGroup && <p className="px-caption px-4 pb-1 pt-2">{command.group}</p>}
              <button
                type="button"
                id={`cmd-${command.id}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => run(command)}
                className={`flex h-9 w-full items-center gap-3 px-4 text-left text-[13.5px] ${index === active ? "bg-accent/10 text-ink" : "text-ink-2"}`}
              >
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
                {command.hint && <span className="font-pixel text-[7px] uppercase tracking-[0.12em] text-ink-3">{command.hint}</span>}
                {command.shortcut && <kbd className="px-kbd">{command.shortcut}</kbd>}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
