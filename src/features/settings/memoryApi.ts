import { commands, type MemoryDocumentId } from "../../bindings";

export const memoryApi = {
  read: (document: MemoryDocumentId) => commands.settingsMemoryRead(document),
  listModels: (worktreeId: string) =>
    commands.settingsMemoryModelsList(worktreeId),
  getConfig: commands.settingsMemoryConfigGet,
  setConfig: commands.settingsMemoryConfigSet,
};
