import type { AppLanguage } from "../../i18n";
import { formatNumber } from "../../i18n";

const durationUnits: Record<
  AppLanguage,
  Array<{ milliseconds: number; suffix: string }>
> = {
  en: [
    { milliseconds: 86_400_000, suffix: "d" },
    { milliseconds: 3_600_000, suffix: "h" },
    { milliseconds: 60_000, suffix: "m" },
    { milliseconds: 1_000, suffix: "s" },
  ],
  "zh-CN": [
    { milliseconds: 86_400_000, suffix: "天" },
    { milliseconds: 3_600_000, suffix: "时" },
    { milliseconds: 60_000, suffix: "分" },
    { milliseconds: 1_000, suffix: "秒" },
  ],
};

export function formatTaskDuration(
  durationMs: number,
  language: AppLanguage,
): string {
  let remaining = Math.max(0, Math.floor(durationMs / 1_000) * 1_000);
  const parts: string[] = [];
  for (const unit of durationUnits[language]) {
    const value = Math.floor(remaining / unit.milliseconds);
    if (value > 0 || (unit.milliseconds === 1_000 && parts.length === 0)) {
      parts.push(`${value}${unit.suffix}`);
      remaining -= value * unit.milliseconds;
    }
  }
  return parts.join(language === "en" ? " " : "");
}

export function formatTaskTokens(tokenCount: number): string {
  return formatNumber(Math.max(0, tokenCount), {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}
