import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { TaskEvent } from "./tasksApi";
import { TaskRewriteControl } from "./TaskRewriteControl";
import { createTasksApiMock } from "./tasksTestUtils";

it("starts, applies, undoes, and cancels an isolated rewrite", async () => {
  const api = createTasksApiMock();
  let emit!: (event: TaskEvent) => void;
  vi.mocked(api.subscribe).mockImplementation((listener) => {
    emit = listener;
    return () => undefined;
  });
  const original = {
    title: "Original",
    description: "Original description",
  };
  const rewritten = {
    title: "Improved",
    description: "Clear description",
  };
  const onApply = vi.fn();
  const { rerender } = render(
    <TaskRewriteControl api={api} value={original} onApply={onApply} />,
  );

  fireEvent.click(screen.getByRole("button", { name: "AI optimize" }));
  await waitFor(() =>
    expect(api.rewriteStart).toHaveBeenCalledWith(original, expect.any(String)),
  );
  emit({ kind: "rewrite_result", rewriteId: "rewrite-1", payload: rewritten });
  fireEvent.click(await screen.findByRole("button", { name: "Apply rewrite" }));
  expect(onApply).toHaveBeenLastCalledWith(rewritten);

  rerender(
    <TaskRewriteControl api={api} value={rewritten} onApply={onApply} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo rewrite" }));
  expect(onApply).toHaveBeenLastCalledWith(original);

  fireEvent.click(screen.getByRole("button", { name: "AI optimize" }));
  await screen.findByText("Optimizing…");
  fireEvent.click(screen.getByRole("button", { name: "Cancel optimization" }));
  await waitFor(() =>
    expect(api.rewriteAbort).toHaveBeenCalledWith("rewrite-1"),
  );
});

it("renders original and suggested descriptions as safe GFM Markdown", async () => {
  const api = createTasksApiMock();
  let emit!: (event: TaskEvent) => void;
  vi.mocked(api.subscribe).mockImplementation((listener) => {
    emit = listener;
    return () => undefined;
  });
  const original = {
    title: "Original",
    description: "## Original scope\n\n- Keep behavior\n\n`inline`",
  };
  const suggested = {
    title: "Suggested",
    description: [
      "## Suggested scope",
      "",
      "| check | result |",
      "| --- | --- |",
      "| tests | pass |",
      "",
      "```ts",
      "const improved = true;",
      "```",
      "",
      "<script>window.__rewriteUnsafe = true</script>",
      "[unsafe](javascript:alert(1))",
    ].join("\n"),
  };
  const { container } = render(
    <TaskRewriteControl api={api} value={original} onApply={vi.fn()} />,
  );

  fireEvent.click(screen.getByRole("button", { name: "AI optimize" }));
  await waitFor(() => expect(api.rewriteStart).toHaveBeenCalled());
  emit({ kind: "rewrite_result", rewriteId: "rewrite-1", payload: suggested });

  expect(
    await screen.findByRole("heading", { name: "Original scope" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Suggested scope" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.getByText("const improved = true;")).toBeInTheDocument();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.queryByRole("link", { name: "unsafe" })).toBeNull();
  expect(screen.getByText(/<script>/)).toBeInTheDocument();
});

it("compares the captured original and rejects stale suggestions", async () => {
  const api = createTasksApiMock();
  let emit!: (event: TaskEvent) => void;
  vi.mocked(api.subscribe).mockImplementation((listener) => {
    emit = listener;
    return () => undefined;
  });
  const onApply = vi.fn();
  const original = { title: "Old title", description: "Original text" };
  const { rerender } = render(
    <TaskRewriteControl api={api} value={original} onApply={onApply} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "AI optimize" }));
  await waitFor(() => expect(api.rewriteStart).toHaveBeenCalled());
  emit({
    kind: "rewrite_result",
    rewriteId: "rewrite-1",
    payload: { title: "Suggestion", description: "Improved text" },
  });
  expect(await screen.findByText("Original text")).toBeInTheDocument();
  rerender(
    <TaskRewriteControl
      api={api}
      value={{ ...original, description: "New user edits" }}
      onApply={onApply}
    />,
  );
  expect(screen.getByRole("button", { name: "Apply rewrite" })).toBeDisabled();
  expect(
    screen.getByText(/draft changed after optimization started/),
  ).toBeInTheDocument();
});
