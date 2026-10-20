/** Keyboard model, shared by the handler, the shortcuts dialog and tooltips. */

export interface ShortcutDoc {
  keys: string[];
  label: string;
  group: "Create" | "Navigate" | "Edit" | "View";
}

export const SHORTCUTS: ShortcutDoc[] = [
  { keys: ["N"], label: "New map", group: "Create" },
  { keys: ["A"], label: "Add idea (child of selection)", group: "Create" },
  { keys: ["C"], label: "Connect selected idea to…", group: "Create" },
  { keys: ["Double-click"], label: "Add idea on empty space", group: "Create" },
  { keys: ["F"], label: "Fit galaxy to view", group: "Navigate" },
  { keys: ["+", "−"], label: "Zoom in / out", group: "Navigate" },
  { keys: ["0"], label: "Reset zoom to 100%", group: "Navigate" },
  { keys: ["/"], label: "Search ideas", group: "Navigate" },
  { keys: ["Enter", "⇧ Enter"], label: "Next / previous search result", group: "Navigate" },
  { keys: ["⇧", "F"], label: "Focus mode on selection", group: "Navigate" },
  { keys: ["Esc"], label: "Exit focus, close menus, clear selection", group: "Navigate" },
  { keys: ["Ctrl/⌘", "K"], label: "Command menu", group: "Navigate" },
  { keys: ["F2"], label: "Rename selected idea", group: "Edit" },
  { keys: ["Del"], label: "Delete selection", group: "Edit" },
  { keys: ["Ctrl/⌘", "D"], label: "Duplicate idea", group: "Edit" },
  { keys: ["Ctrl/⌘", "Z"], label: "Undo", group: "Edit" },
  { keys: ["Ctrl/⌘", "⇧", "Z"], label: "Redo", group: "Edit" },
  { keys: ["R"], label: "Reorganize layout", group: "Edit" },
  { keys: ["Arrows"], label: "Nudge selected idea", group: "Edit" },
  { keys: ["E"], label: "Export PNG", group: "View" },
  { keys: ["M"], label: "Toggle minimap", group: "View" },
  { keys: ["["], label: "Toggle sidebar", group: "View" },
  { keys: ["]"], label: "Toggle inspector", group: "View" },
  { keys: ["?"], label: "Show shortcuts", group: "View" },
];

/** True when a key press should go to a text field rather than the app. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "range", "submit", "reset", "color"].includes(type);
  }
  return Boolean(target.closest("[contenteditable='true']"));
}
