import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TerminalPanel } from "./TerminalPanel";
import { useTerminalStore } from "./terminalStore";

beforeEach(() => {
  useTerminalStore.setState({ tabsByProject: {}, activeByProject: {} });
});

describe("TerminalPanel", () => {
  it("renders an empty project terminal without an unstable store snapshot", () => {
    render(<TerminalPanel projectId="project-without-terminals" />);

    expect(
      screen.getAllByRole("button", { name: "New terminal" }),
    ).not.toHaveLength(0);
  });
});
