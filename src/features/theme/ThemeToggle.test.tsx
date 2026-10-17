import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../i18n";
import { ThemeToggle } from "./ThemeToggle";
import { useThemeStore } from "./themeStore";

beforeEach(() => {
  setLanguage("en");
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

  it("uses the resolved system appearance without exposing a third mode", () => {
    useThemeStore.setState({ mode: "system", resolved: "dark" });
    render(<ThemeToggle />);

    const button = screen.getByRole("button", {
      name: "Theme: dark. Switch to light",
    });
    expect(screen.queryByRole("button", { name: /system/i })).toBeNull();

    fireEvent.click(button);
    expect(useThemeStore.getState()).toMatchObject({
      mode: "light",
      resolved: "light",
    });
  });

  it("rerenders its accessible label when the language changes", () => {
    render(<ThemeToggle />);

    act(() => setLanguage("zh-CN"));

    expect(
      screen.getByRole("button", { name: "主题：浅色。切换到深色" }),
    ).toBeInTheDocument();
  });
});
