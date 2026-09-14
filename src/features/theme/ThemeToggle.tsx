import { RiComputerLine, RiMoonLine, RiSunLine } from "@remixicon/react";
import { useThemeStore, type ThemeMode } from "./themeStore";

const nextMode: Record<ThemeMode, ThemeMode> = {
  system: "light",
  light: "dark",
  dark: "system",
};

export function ThemeToggle() {
  const mode = useThemeStore((state) => state.mode);
  const cycle = useThemeStore((state) => state.cycle);
  const Icon =
    mode === "system"
      ? RiComputerLine
      : mode === "light"
        ? RiSunLine
        : RiMoonLine;
  const label = `Theme: ${mode}. Switch to ${nextMode[mode]}`;
  return (
    <button title={label} aria-label={label} onClick={cycle}>
      <Icon size={17} />
    </button>
  );
}
