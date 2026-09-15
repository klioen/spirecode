import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { useThemeStore } from "./themeStore";

export function ThemeToggle() {
  const mode = useThemeStore((state) => state.mode);
  const cycle = useThemeStore((state) => state.cycle);
  const Icon = mode === "light" ? RiSunLine : RiMoonLine;
  const nextMode = mode === "light" ? "dark" : "light";
  const label = `Theme: ${mode}. Switch to ${nextMode}`;
  return (
    <button title={label} aria-label={label} onClick={cycle}>
      <Icon size={17} />
    </button>
  );
}
