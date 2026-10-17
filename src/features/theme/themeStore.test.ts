import { beforeEach, describe, expect, it, vi } from "vitest";
import { createThemeController } from "./themeStore";

const media = (dark: boolean) => {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  return {
    matches: dark,
    addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
    emit(matches: boolean) {
      for (const listener of listeners)
        listener({ matches } as MediaQueryListEvent);
    },
  };
};

describe("theme controller", () => {
  beforeEach(() => localStorage.clear());

  it("starts in system mode and follows the current system appearance", () => {
    const query = media(true);
    const controller = createThemeController(
      query as unknown as MediaQueryList,
    );

    expect(controller.getState()).toMatchObject({
      mode: "system",
      resolved: "dark",
    });
    expect(localStorage.getItem("spirecode.appearance.v1")).toBe("system");

    query.emit(false);
    expect(controller.getState()).toMatchObject({
      mode: "system",
      resolved: "light",
    });
  });

  it("migrates the legacy appearance setting", () => {
    const legacyKey = ["pi", "app.appearance.v1"].join("-");
    localStorage.setItem(legacyKey, "dark");

    const controller = createThemeController(
      media(false) as unknown as MediaQueryList,
    );

    expect(controller.getState()).toMatchObject({
      mode: "dark",
      resolved: "dark",
    });
    expect(localStorage.getItem("spirecode.appearance.v1")).toBe("dark");
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it.each([
    ["current", "spirecode.appearance.v1"],
    ["legacy", ["pi", "app.appearance.v1"].join("-")],
  ])("preserves a %s system setting", (_source, key) => {
    const legacyKey = ["pi", "app.appearance.v1"].join("-");
    localStorage.setItem(key, "system");

    const controller = createThemeController(
      media(true) as unknown as MediaQueryList,
    );

    expect(controller.getState()).toMatchObject({
      mode: "system",
      resolved: "dark",
    });
    expect(localStorage.getItem("spirecode.appearance.v1")).toBe("system");
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it("cycles only between explicit light and dark modes", () => {
    localStorage.setItem("spirecode.appearance.v1", "light");
    const query = media(false);
    const controller = createThemeController(
      query as unknown as MediaQueryList,
    );

    controller.getState().cycle();
    expect(controller.getState()).toMatchObject({
      mode: "dark",
      resolved: "dark",
    });

    controller.getState().cycle();
    expect(controller.getState()).toMatchObject({
      mode: "light",
      resolved: "light",
    });

    query.emit(true);
    expect(controller.getState()).toMatchObject({
      mode: "light",
      resolved: "light",
    });
  });
});
