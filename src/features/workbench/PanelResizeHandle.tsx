import { useEffect, useRef, useState } from "react";

interface PanelResizeHandleProps {
  label: string;
  edge: "projects" | "right";
  value: number;
  min: number;
  max: number;
  direction: 1 | -1;
  onChange: (value: number) => void;
  onReset: () => void;
}

export function PanelResizeHandle({
  label,
  edge,
  value,
  min,
  max,
  direction,
  onChange,
  onReset,
}: PanelResizeHandleProps) {
  const drag = useRef<{ coordinate: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const start = drag.current;
      if (!start) return;
      onChange(start.value + (event.clientX - start.coordinate) * direction);
    };
    const finish = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    document.body.classList.add("panel-resizing", "panel-resizing-vertical");
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove(
        "panel-resizing",
        "panel-resizing-vertical",
      );
    };
  }, [direction, dragging, onChange]);

  return (
    <div
      className={`panel-resize-handle ${edge} vertical ${dragging ? "dragging" : ""}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        drag.current = { coordinate: event.clientX, value };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
      }}
      onKeyDown={(event) => {
        const delta =
          event.key === "ArrowRight" ? 8 : event.key === "ArrowLeft" ? -8 : 0;
        if (delta !== 0) {
          onChange(value + delta * direction);
          event.preventDefault();
        }
      }}
      onDoubleClick={onReset}
    />
  );
}
