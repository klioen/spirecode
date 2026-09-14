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

  it("follows system appearance and persists explicit modes", () => {
    const query = media(true);
    const controller = createThemeController(
      query as unknown as MediaQueryList,
    );
    expect(controller.getState()).toMatchObject({
      mode: "system",
      resolved: "dark",
    });

    controller.getState().cycle();
    expect(controller.getState()).toMatchObject({
      mode: "light",
      resolved: "light",
    });
    expect(localStorage.getItem("pi-app.appearance.v1")).toBe("light");
  });

  it("reacts to system changes only while mode is system", () => {
    const query = media(false);
    const controller = createThemeController(
      query as unknown as MediaQueryList,
    );
    query.emit(true);
    expect(controller.getState().resolved).toBe("dark");

    controller.getState().setMode("light");
    query.emit(false);
    expect(controller.getState().resolved).toBe("light");
  });
});
