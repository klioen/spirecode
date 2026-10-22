// @vitest-environment node
import { describe, expect, it } from "vitest";
import { unsavedChangesDialogOptions } from "./nativeDialog.js";

describe("unsavedChangesDialogOptions", () => {
  it("builds singular and plural English copy", () => {
    expect(unsavedChangesDialogOptions("en", 1)).toEqual({
      type: "warning",
      buttons: ["Cancel", "Discard and Quit"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: "Unsaved changes",
      message: "1 item has unsaved changes.",
      detail: "Unsaved file changes and task drafts will be permanently lost.",
    });
    expect(unsavedChangesDialogOptions("en", 2).message).toBe(
      "2 items have unsaved changes.",
    );
    expect(unsavedChangesDialogOptions("en", 10_000).message).toBe(
      "10,000 items have unsaved changes.",
    );
  });

  it("builds Simplified Chinese copy", () => {
    expect(unsavedChangesDialogOptions("zh-CN", 2)).toEqual({
      type: "warning",
      buttons: ["取消", "放弃更改并退出"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: "未保存的更改",
      message: "2 项内容有未保存的更改。",
      detail: "未保存的文件更改和任务草稿将永久丢失。",
    });
    expect(unsavedChangesDialogOptions("zh-CN", 10_000).message).toBe(
      "10,000 项内容有未保存的更改。",
    );
  });
});
