import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySettings } from "./MemorySettings";
import { memoryApi } from "./memoryApi";

vi.mock("./memoryApi", () => ({
  memoryApi: { read: vi.fn() },
}));

const summary = {
  id: "summary" as const,
  name: "memory_summary.md",
  content: "# Summary\n\nCurrent memory.",
  size: 27,
  updatedAt: Date.parse("2026-09-16T12:00:00Z"),
};
const handbook = {
  id: "handbook" as const,
  name: "MEMORY.md",
  content: "# Handbook\n\nLong-term memory.",
  size: 30,
  updatedAt: Date.parse("2026-09-16T13:00:00Z"),
};

beforeEach(() => {
  vi.mocked(memoryApi.read).mockImplementation(async (document) =>
    document === "summary" ? summary : handbook,
  );
});

describe("MemorySettings", () => {
  it("loads the summary by default and switches documents", async () => {
    render(<MemorySettings />);

    expect(
      await screen.findByRole("heading", { name: "Summary" }),
    ).toBeInTheDocument();
    expect(memoryApi.read).toHaveBeenCalledWith("summary");

    fireEvent.click(screen.getByRole("button", { name: "MEMORY.md" }));
    expect(
      await screen.findByRole("heading", { name: "Handbook" }),
    ).toBeInTheDocument();
    expect(memoryApi.read).toHaveBeenCalledWith("handbook");
  });

  it("refreshes the selected document", async () => {
    render(<MemorySettings />);
    await screen.findByRole("heading", { name: "Summary" });

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh memory document" }),
    );
    await waitFor(() => expect(memoryApi.read).toHaveBeenCalledTimes(2));
    expect(memoryApi.read).toHaveBeenLastCalledWith("summary");
  });

  it("shows a missing-document state", async () => {
    vi.mocked(memoryApi.read).mockRejectedValue({
      code: "NOT_FOUND",
      message: "memory document has not been generated",
    });
    render(<MemorySettings />);

    expect(
      await screen.findByText("memory_summary.md has not been generated yet."),
    ).toBeInTheDocument();
  });

  it("does not let an older request replace the selected document", async () => {
    let resolveSummary!: (value: typeof summary) => void;
    vi.mocked(memoryApi.read).mockImplementation((document) =>
      document === "summary"
        ? new Promise((resolve) => {
            resolveSummary = resolve;
          })
        : Promise.resolve(handbook),
    );
    render(<MemorySettings />);

    fireEvent.click(screen.getByRole("button", { name: "MEMORY.md" }));
    expect(
      await screen.findByRole("heading", { name: "Handbook" }),
    ).toBeInTheDocument();
    resolveSummary(summary);

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Summary" }),
      ).not.toBeInTheDocument(),
    );
  });
});
