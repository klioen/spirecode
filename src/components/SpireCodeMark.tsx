import { useId } from "react";

interface SpireCodeMarkProps {
  className?: string;
}

export function SpireCodeMark({ className }: SpireCodeMarkProps) {
  const id = useId().replace(/:/g, "");
  const background = `${id}-background`;
  const spire = `${id}-spire`;

  return (
    <svg
      aria-hidden="true"
      className={className}
      data-testid="spirecode-mark"
      focusable="false"
      viewBox="0 0 1024 1024"
    >
      <defs>
        <linearGradient id={background} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12252a" />
          <stop offset="1" stopColor="#081217" />
        </linearGradient>
        <linearGradient id={spire} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#35e2f2" />
          <stop offset=".48" stopColor="#20bfd2" />
          <stop offset="1" stopColor="#ffd166" />
        </linearGradient>
      </defs>
      <rect
        x="70"
        y="58"
        width="884"
        height="884"
        rx="218"
        fill={`url(#${background})`}
      />
      <path
        d="M673 267C591 202 363 225 351 402c-11 157 324 94 314 255-10 160-242 180-345 74"
        fill="none"
        stroke={`url(#${spire})`}
        strokeWidth="126"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="72"
        y="60"
        width="880"
        height="880"
        rx="216"
        fill="none"
        stroke="rgba(255,255,255,.13)"
        strokeWidth="4"
      />
    </svg>
  );
}
