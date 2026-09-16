import { commands } from "../../bindings";

export const settingsApi = {
  listExtensions: commands.settingsExtensionsList,
  setExtensionEnabled: commands.settingsExtensionSetEnabled,
};
