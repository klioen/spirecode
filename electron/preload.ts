import { contextBridge, ipcRenderer } from "electron";
import { isCommand, isTopic, type TopicName } from "./contracts.js";

const api = {
  setDirtyFileCount(count: number) {
    if (!Number.isSafeInteger(count) || count < 0 || count > 10_000)
      throw new TypeError("dirty file count is invalid");
    const result = ipcRenderer.sendSync("spire:set-dirty-file-count", count) as
      { ok: true } | { ok: false; error: { message: string } };
    if (!result.ok) throw new Error(result.error.message);
  },
  async invoke(command: string, args?: Record<string, unknown>) {
    if (!isCommand(command)) throw new Error("Host command is not allowed");
    return ipcRenderer.invoke("spire:invoke", command, args ?? {});
  },
  subscribe(topic: string, listener: (payload: unknown) => void) {
    if (!isTopic(topic)) throw new Error("Host topic is not allowed");
    const channel = topicChannel(topic);
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
};

function topicChannel(topic: TopicName): string {
  return `spire:event:${topic}`;
}

contextBridge.exposeInMainWorld("spire", Object.freeze(api));
