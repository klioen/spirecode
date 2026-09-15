import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
