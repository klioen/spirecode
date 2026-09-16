import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TodoListCard } from "./TodoListCard";

describe("TodoListCard", () => {
  it("renders progress, explanation, and all todo states", () => {
    render(
      <TodoListCard
        todo={{
          id: "todo-1",
          explanation: "Implementation progress",
          todos: [
            { id: "done", step: "Inspect", status: "completed" },
            { id: "active", step: "Build", status: "in_progress" },
            { id: "blocked", step: "Release", status: "blocked" },
            { id: "pending", step: "Verify", status: "pending" },
          ],
        }}
      />,
    );

    expect(screen.getByRole("region", { name: "Todo progress" })).toBeVisible();
    expect(screen.getByText("1/4")).toBeVisible();
    expect(screen.getByText("Implementation progress")).toBeVisible();
    expect(screen.getByText("✓")).toBeVisible();
    expect(screen.getByText("●")).toBeVisible();
    expect(screen.getByText("!")).toBeVisible();
    expect(screen.getByText("○")).toBeVisible();
    expect(screen.getByText("Inspect").closest("li")).toHaveClass(
      "chat-todo-completed",
    );
  });
});
