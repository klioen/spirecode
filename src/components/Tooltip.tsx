import { cloneElement, useId, useState, type ReactElement } from "react";

type TooltipSide = "top" | "bottom" | "left" | "right";
type TooltipAlign = "start" | "center" | "end";
type TooltipChild = ReactElement<{ "aria-describedby"?: string }>;

export function Tooltip({
  label,
  side = "bottom",
  align = "center",
  children,
}: {
  label: string;
  side?: TooltipSide;
  align?: TooltipAlign;
  children: TooltipChild;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const describedBy = [children.props["aria-describedby"], id]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className="app-tooltip"
      data-side={side}
      data-align={align}
      data-open={open || undefined}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      <span
        id={id}
        className="app-tooltip-content"
        role="tooltip"
        aria-hidden={!open}
      >
        {label}
      </span>
    </span>
  );
}
