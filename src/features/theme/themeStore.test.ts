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

  it("starts from and persists the current system appearance", () => {
    const controller = createThemeController(
      media(true) as unknown as MediaQueryList,
    );

    expect(controller.getState()).toMatchObject({
      mode: "dark",
      resolved: "dark",
    });
    expect(localStorage.getItem("spirecode.appearance.v1")).toBe("dark");
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
  ])("resolves a %s system setting to an explicit theme", (_source, key) => {
    const legacyKey = ["pi", "app.appearance.v1"].join("-");
    localStorage.setItem(key, "system");

    const controller = createThemeController(
      media(true) as unknown as MediaQueryList,
    );

    expect(controller.getState()).toMatchObject({
      mode: "dark",
      resolved: "dark",
    });
    expect(localStorage.getItem("spirecode.appearance.v1")).toBe("dark");
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it("cycles only between light and dark", () => {
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
