import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  en,
  formatDateTime,
  formatList,
  formatNumber,
  initializeLanguage,
  setLanguage,
  t,
  useTranslation,
  zhCN,
} from "./index";

beforeEach(() => {
  initializeLanguage("en");
});

describe("i18n", () => {
  it("keeps Chinese keys and named placeholders in parity with English", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(en) as Array<keyof typeof en>)
      expect(placeholders(zhCN[key]), key).toEqual(placeholders(en[key]));
  });

  it("defaults to English and synchronizes the document language", () => {
    expect(t("settings.title")).toBe("Settings");
    expect(document.documentElement.lang).toBe("en");
  });

  it("interpolates values and formats with the explicit selected locale", () => {
    initializeLanguage("zh-CN");
    expect(t("settings.agent.ready", { count: 2 })).toBe(
      "已就绪，有 2 个已认证模型。",
    );
    expect(formatNumber(10_000)).toBe("10,000");
    expect(formatList(["甲", "乙"])).toBe("甲和乙");
    expect(formatDateTime(new Date("2024-01-02T03:04:00Z"))).toContain("2024");
  });

  it("rerenders hook consumers when the language changes", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("settings.title")).toBe("Settings");
    act(() => setLanguage("zh-CN"));
    expect(result.current.t("settings.title")).toBe("设置");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
