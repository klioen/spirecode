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
  it("shows a closed worked duration and reveals inspectable intermediate UI", () => {
    render(<WorkSummary work={worked} />);

    const summary = screen.getByText("Worked for 45s");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("read")).not.toBeVisible();

    fireEvent.click(summary);
    const thinking = within(details!).getByText("Thinking");
    expect(thinking).toBeVisible();
    fireEvent.click(thinking);
    expect(within(details!).getByText("private raw reasoning")).toBeVisible();
    expect(within(details!).getByText("read")).toBeVisible();
    expect(within(details!).getByText("Checking another file")).toBeVisible();
  });

  it("stays closed while working, ticks once per second, and stays closed on completion", () => {
    vi.useFakeTimers();
    vi.setSystemTime(11_000);
    const { rerender } = render(
      <WorkSummary
        work={{ ...worked, status: "working", completedAt: undefined }}
      />,
    );

    const details = screen.getByText("Working for 10s").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details?.querySelector(".chat-work-active-text")).toHaveTextContent(
      "Read file · chat.tsx",
    );
    void act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText("Working for 12s")).toBeVisible();

    rerender(<WorkSummary work={worked} />);
    expect(details).not.toHaveAttribute("open");
    expect(details?.querySelector(".chat-work-active")).toBeNull();
  });

  it("shows only the latest semantic active item and updates it in place", () => {
    const activeWork: ChatWorkDisplayItem = {
      ...worked,
      status: "working",
      completedAt: undefined,
      items: [
        {
          type: "thinking",
          id: "thinking-active",
          content: "private streamed reasoning",
          status: "streaming",
        },
        {
          type: "tool",
          toolCallId: "read-active",
          name: "read",
          arguments: { path: "/private/project/src/very-long-file.tsx" },
          result: "private partial output",
          status: "running",
        },
      ],
    };
    const { rerender } = render(<WorkSummary work={activeWork} />);
    const details = screen.getByText(/Working for/).closest("details")!;
    const summary = details.querySelector("summary")!;

    expect(details).not.toHaveAttribute("open");
    expect(
      summary.querySelector(":scope > .chat-work-summary-heading"),
    ).not.toBeNull();
    expect(summary.querySelector(":scope > .chat-work-active")).not.toBeNull();
    expect(summary.querySelector(".chat-work-active-text")).toHaveTextContent(
      "Reading file · very-long-file.tsx",
    );
    expect(summary.querySelector('[data-process-icon="read"]')).not.toBeNull();
    expect(
      within(summary).queryByText("private streamed reasoning"),
    ).toBeNull();
    expect(within(summary).queryByText("private partial output")).toBeNull();

    rerender(
      <WorkSummary
        work={{
          ...activeWork,
          items: activeWork.items.map((item) =>
            item.type === "tool" ? { ...item, status: "done" as const } : item,
          ),
        }}
      />,
    );
    expect(summary.querySelector(".chat-work-active-text")).toHaveTextContent(
      "Read file · very-long-file.tsx",
    );

    rerender(
      <WorkSummary
        work={{
          ...activeWork,
          items: [
            ...activeWork.items.map((item) =>
              item.type === "tool"
                ? { ...item, status: "done" as const }
                : item,
            ),
            {
              type: "thinking",
              id: "thinking-latest",
              content: "new private reasoning",
              status: "streaming",
            },
          ],
        }}
      />,
    );

    expect(within(summary).getByText("Thinking")).toBeVisible();
    expect(
      summary.querySelector('[data-process-icon="thinking"]'),
    ).not.toBeNull();
    expect(within(summary).queryByText("new private reasoning")).toBeNull();
    expect(summary).not.toHaveTextContent("Reading file");
  });

  it("preserves a user's disclosure choice across streaming and completion", () => {
    const active = {
      ...worked,
      status: "working" as const,
      completedAt: undefined,
    };
    const { rerender } = render(<WorkSummary work={active} />);
    const summary = screen.getByText(/Working for/);
    const details = summary.closest("details");
    fireEvent.click(summary);
    rerender(<WorkSummary work={{ ...active, items: [...active.items] }} />);
    expect(details).toHaveAttribute("open");

    rerender(<WorkSummary work={worked} />);
    expect(details).toHaveAttribute("open");
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
