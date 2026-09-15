import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";
import { useThemeStore } from "./themeStore";

beforeEach(() => {
  useThemeStore.setState({ mode: "light", resolved: "light" });
});

describe("ThemeToggle", () => {
  it("shows only explicit light and dark modes", () => {
    render(<ThemeToggle />);

    const lightButton = screen.getByRole("button", {
      name: "Theme: light. Switch to dark",
    });
    expect(lightButton.querySelector("svg")).toBeTruthy();

    fireEvent.click(lightButton);
    expect(useThemeStore.getState().mode).toBe("dark");
    const darkButton = screen.getByRole("button", {
      name: "Theme: dark. Switch to light",
    });

    fireEvent.click(darkButton);
    expect(useThemeStore.getState().mode).toBe("light");
    expect(screen.queryByRole("button", { name: /system/i })).toBeNull();
  });
});
