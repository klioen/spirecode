import type { MessageBoxSyncOptions } from "electron";
import type { AppLanguage } from "./domains/settings/index.js";

export function unsavedChangesDialogOptions(
  language: AppLanguage,
  count: number,
): MessageBoxSyncOptions {
  const formattedCount = new Intl.NumberFormat(
    language === "zh-CN" ? "zh-CN" : "en-US",
  ).format(count);
  if (language === "zh-CN") {
    return {
      type: "warning",
      buttons: ["取消", "放弃更改并退出"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: "未保存的更改",
      message: `${formattedCount} 个文件有未保存的更改。`,
      detail: "放弃更改将永久丢失这些内容。",
    };
  }

  const noun = count === 1 ? "file has" : "files have";
  return {
    type: "warning",
    buttons: ["Cancel", "Discard and Quit"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "Unsaved changes",
    message: `${formattedCount} ${noun} unsaved changes.`,
    detail: "Discarding will permanently lose those changes.",
  };
}
