"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  label: ReactNode;
  shortcut?: string;
  side?: Side;
  children: ReactElement<Record<string, unknown>>;
}

/**
 * Lightweight tooltip for icon-only controls. The trigger is wrapped in a
 * `display: contents` span (no layout impact); the bubble is portalled with fixed
 * positioning so it is never clipped by scrolling or transformed panels.
 */
export function Tooltip({ label, shortcut, side = "bottom", children }: TooltipProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback(
    (immediate: boolean) => {
      if (timer.current) clearTimeout(timer.current);
      const run = () => {
        const el = wrapperRef.current?.firstElementChild;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const gap = 8;
        const point =
          side === "top"
            ? { x: r.left + r.width / 2, y: r.top - gap }
            : side === "bottom"
              ? { x: r.left + r.width / 2, y: r.bottom + gap }
              : side === "left"
                ? { x: r.left - gap, y: r.top + r.height / 2 }
                : { x: r.right + gap, y: r.top + r.height / 2 };
        setPosition(point);
      };
      if (immediate) run();
      else timer.current = setTimeout(run, 380);
    },
    [side],
  );

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPosition(null);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!isValidElement(children)) return children;

  const transform =
    side === "top" ? "translate(-50%, -100%)" : side === "bottom" ? "translate(-50%, 0)" : side === "left" ? "translate(-100%, -50%)" : "translate(0, -50%)";

  return (
    <span
      ref={wrapperRef}
      className="contents"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") show(false);
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(e) => {
        if ((e.target as HTMLElement).matches(":focus-visible")) show(true);
      }}
      onBlur={hide}
    >
      {cloneElement(children, { "aria-describedby": position ? id : undefined })}
      {position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[100] flex items-center gap-2 border border-line-strong bg-[#0b0d22]/95 px-2 py-1 text-[12px] text-ink shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
            style={{ left: position.x, top: position.y, transform }}
          >
            <span>{label}</span>
            {shortcut && <kbd className="px-kbd">{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </span>
  );
}
