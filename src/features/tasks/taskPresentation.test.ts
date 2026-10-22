import { expect, it } from "vitest";
import {
  boundedTaskQuery,
  relativeTaskTime,
  taskDisplayStatus,
  taskErrorMessage,
} from "./taskPresentation";
import { taskDetail } from "./tasksTestUtils";
it("shows execution sub-state without changing terminal business status", () => {
  expect(
    taskDisplayStatus(
      taskDetail({ status: "running", executionStatus: "awaiting_report" }),
    ),
  ).toBe("awaiting_report");
  expect(
    taskDisplayStatus(
      taskDetail({ status: "completed", executionStatus: "reported" }),
    ),
  ).toBe("completed");
});
it("formats relative times in both languages", () => {
  expect(relativeTaskTime(1000, "en", 301000)).toBe("5 minutes ago");
  expect(relativeTaskTime(1000, "zh-CN", 301000)).toBe("5分钟前");
});

it("bounds UTF-8 search input without splitting characters and preserves typed IPC errors", () => {
  const query = boundedTaskQuery("中".repeat(100));
  expect(new TextEncoder().encode(query).length).toBeLessThanOrEqual(256);
  expect(query).toBe("中".repeat(85));
  expect(
    taskErrorMessage(
      { code: "TASK_CONFLICT", message: "Task changed" },
      "fallback",
    ),
  ).toBe("Task changed");
});
