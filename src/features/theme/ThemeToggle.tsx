import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { useTranslation } from "../../i18n";
import { useThemeStore } from "./themeStore";

export function ThemeToggle() {
  const { t } = useTranslation();
  const mode = useThemeStore((state) => state.mode);
  const cycle = useThemeStore((state) => state.cycle);
  const Icon = mode === "light" ? RiSunLine : RiMoonLine;
  const nextMode = mode === "light" ? "dark" : "light";
  const label = t("theme.toggle", {
    mode: t(`theme.${mode}`),
    nextMode: t(`theme.${nextMode}`),
  });
  return (
    <button title={label} aria-label={label} onClick={cycle}>
      <Icon size={17} />
    </button>
  );
}
