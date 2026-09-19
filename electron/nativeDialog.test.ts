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
      message: "1 file has unsaved changes.",
      detail: "Discarding will permanently lose those changes.",
    });
    expect(unsavedChangesDialogOptions("en", 2).message).toBe(
      "2 files have unsaved changes.",
    );
    expect(unsavedChangesDialogOptions("en", 10_000).message).toBe(
      "10,000 files have unsaved changes.",
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
      message: "2 个文件有未保存的更改。",
      detail: "放弃更改将永久丢失这些内容。",
    });
    expect(unsavedChangesDialogOptions("zh-CN", 10_000).message).toBe(
      "10,000 个文件有未保存的更改。",
    );
  });
});
