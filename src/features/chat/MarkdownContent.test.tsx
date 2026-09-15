import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders GFM structure and fenced code without executing raw HTML", () => {
    const { container } = render(
      <MarkdownContent
        content={[
          "## Result",
          "",
          "- **fixed**",
          "- tested",
          "",
          "| file | state |",
          "| --- | --- |",
          "| `chat.tsx` | done |",
          "",
          "```ts",
          "const ready = true;",
          "```",
          "",
          "<script>window.__unsafe = true</script>",
        ].join("\n")}
      />,
    );

    expect(screen.getByRole("heading", { name: "Result" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("const ready = true;")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/<script>/)).toBeInTheDocument();
  });

  it("places the streaming cursor inside the last Markdown block", () => {
    const { container } = render(
      <MarkdownContent content="First\n\nLast **word**" running />,
    );

    const cursor = screen.getByLabelText("Streaming");
    expect(cursor.closest("p")).toBe(container.querySelector("p:last-child"));
  });

  it("shows a language header and copies fenced code", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<MarkdownContent content={"```ts\nconst ok = true;\n```"} />);

    expect(screen.getByText("ts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenCalledWith("const ok = true;");
  });

  it("allows safe external links and rejects unsafe protocols", () => {
    render(
      <MarkdownContent content="[safe](https://example.com) [unsafe](javascript:alert(1))" />,
    );

    expect(screen.getByRole("link", { name: "safe" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByRole("link", { name: "safe" })).toHaveAttribute(
      "rel",
      "noreferrer noopener",
    );
    expect(screen.queryByRole("link", { name: "unsafe" })).toBeNull();
    expect(screen.getByText("unsafe")).toBeInTheDocument();
  });
});
