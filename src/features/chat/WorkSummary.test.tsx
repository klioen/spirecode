import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../../i18n";
import { WorkSummary } from "./WorkSummary";
import type { ChatWorkDisplayItem } from "./chatDisplayItems";

const worked: ChatWorkDisplayItem = {
  type: "work",
  id: "work:user-1",
  status: "worked",
  startedAt: 1_000,
  completedAt: 46_000,
  items: [
    {
      type: "thinking",
      id: "thinking-1",
      content: "private raw reasoning",
      status: "complete",
    },
    {
      type: "tool",
      toolCallId: "read-1",
      name: "read",
      arguments: { path: "src/chat.tsx" },
      status: "done",
    },
    {
      type: "message",
      id: "update-1",
      role: "assistant",
      content: "Checking another file",
      status: "complete",
      createdAt: 20_000,
    },
  ],
};

beforeEach(() => setLanguage("en"));
afterEach(() => vi.useRealTimers());

describe("WorkSummary", () => {
  it("shows a closed worked duration and reveals only safe intermediate UI", () => {
    render(<WorkSummary work={worked} />);

    const summary = screen.getByText("Worked for 45s");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("read")).not.toBeVisible();

    fireEvent.click(summary);
    expect(within(details!).getByText("Thinking")).toBeVisible();
    expect(within(details!).queryByText("private raw reasoning")).toBeNull();
    expect(within(details!).getByText("read")).toBeVisible();
    expect(within(details!).getByText("Checking another file")).toBeVisible();
  });

  it("ticks a working duration once per second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(11_000);
    render(
      <WorkSummary
        work={{ ...worked, status: "working", completedAt: undefined }}
      />,
    );

    expect(screen.getByText("Working for 10s")).toBeVisible();
    void act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText("Working for 12s")).toBeVisible();
  });

  it("formats compact minute and second units", () => {
    render(
      <WorkSummary
        work={{ ...worked, startedAt: 1_000, completedAt: 66_000 }}
      />,
    );
    expect(screen.getByText("Worked for 1m 5s")).toBeVisible();
  });
});
