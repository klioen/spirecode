import { commands, type MemoryDocumentId } from "../../bindings";

export const memoryApi = {
  read: (document: MemoryDocumentId) => commands.settingsMemoryRead(document),
};
