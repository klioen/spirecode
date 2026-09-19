import { useId } from "react";

interface SpireCodeMarkProps {
  className?: string;
}

export function SpireCodeMark({ className }: SpireCodeMarkProps) {
  const id = useId().replace(/:/g, "");
  const background = `${id}-background`;
  const cyan = `${id}-cyan`;
  const gold = `${id}-gold`;
  const clip = `${id}-clip`;

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
        <linearGradient id={cyan} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#16a6c1" />
          <stop offset="1" stopColor="#35e2f2" />
        </linearGradient>
        <linearGradient id={gold} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#f39a1e" />
          <stop offset="1" stopColor="#ffd866" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x="70" y="58" width="884" height="884" rx="218" />
        </clipPath>
      </defs>
      <rect
        x="70"
        y="58"
        width="884"
        height="884"
        rx="218"
        fill={`url(#${background})`}
      />
      <g clipPath={`url(#${clip})`}>
        <path
          d="M492 168 218 378v292l274 190V704L354 610V448l138-104Z"
          fill={`url(#${cyan})`}
        />
        <path
          d="M532 168 806 378v292L532 860V704l138-94V448L532 344Z"
          fill={`url(#${gold})`}
        />
        <path
          d="M669 331C590 276 390 291 382 421c-8 126 276 77 269 216-6 116-174 139-301 64"
          fill="none"
          stroke="#0b171c"
          strokeWidth="92"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
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
