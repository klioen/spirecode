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
      message: `${formattedCount} 项内容有未保存的更改。`,
      detail: "未保存的文件更改和任务草稿将永久丢失。",
    };
  }

  const noun = count === 1 ? "item has" : "items have";
  return {
    type: "warning",
    buttons: ["Cancel", "Discard and Quit"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: "Unsaved changes",
    message: `${formattedCount} ${noun} unsaved changes.`,
    detail: "Unsaved file changes and task drafts will be permanently lost.",
  };
}
