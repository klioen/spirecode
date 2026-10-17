import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { Tooltip } from "../../components/Tooltip";
import { useTranslation } from "../../i18n";
import { useThemeStore } from "./themeStore";

export function ThemeToggle() {
  const { t } = useTranslation();
  const resolved = useThemeStore((state) => state.resolved);
  const cycle = useThemeStore((state) => state.cycle);
  const Icon = resolved === "light" ? RiSunLine : RiMoonLine;
  const nextMode = resolved === "light" ? "dark" : "light";
  const label = t("theme.toggle", {
    mode: t(`theme.${resolved}`),
    nextMode: t(`theme.${nextMode}`),
  });
  return (
    <Tooltip label={label}>
      <button aria-label={label} onClick={cycle}>
        <Icon size={17} />
      </button>
    </Tooltip>
  );
}
