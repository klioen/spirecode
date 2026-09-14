import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";
import { useThemeStore } from "./themeStore";

beforeEach(() => {
  useThemeStore.setState({ mode: "system", resolved: "dark" });
});

describe("ThemeToggle", () => {
  it("shows the current mode and cycles to light", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: /Theme: system/ });
    fireEvent.click(button);
    expect(useThemeStore.getState().mode).toBe("light");
  });
});
