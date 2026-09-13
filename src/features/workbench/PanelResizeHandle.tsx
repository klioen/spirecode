import { useEffect, useRef, useState } from "react";

interface PanelResizeHandleProps {
  label: string;
  edge: "projects" | "right" | "terminal";
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: number;
  direction: 1 | -1;
  onChange: (value: number) => void;
  onReset: () => void;
}

const coordinate = (
  event: Pick<PointerEvent, "clientX" | "clientY">,
  orientation: PanelResizeHandleProps["orientation"],
) => (orientation === "vertical" ? event.clientX : event.clientY);

export function PanelResizeHandle({
  label,
  edge,
  orientation,
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
      const delta = coordinate(event, orientation) - start.coordinate;
      onChange(start.value + delta * direction);
    };
    const finish = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    document.body.classList.add(
      "panel-resizing",
      `panel-resizing-${orientation}`,
    );
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.classList.remove(
        "panel-resizing",
        `panel-resizing-${orientation}`,
      );
    };
  }, [direction, dragging, onChange, orientation]);

  const adjustByKey = (key: string) => {
    const physicalDelta =
      key === "ArrowRight" || key === "ArrowDown"
        ? 8
        : key === "ArrowLeft" || key === "ArrowUp"
          ? -8
          : 0;
    if (physicalDelta !== 0) onChange(value + physicalDelta * direction);
    return physicalDelta !== 0;
  };

  return (
    <div
      className={`panel-resize-handle ${edge} ${orientation} ${dragging ? "dragging" : ""}`}
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        drag.current = {
          coordinate: coordinate(event, orientation),
          value,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
      }}
      onKeyDown={(event) => {
        if (adjustByKey(event.key)) event.preventDefault();
      }}
      onDoubleClick={onReset}
    />
  );
}
