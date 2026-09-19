import { commands } from "../../bindings";

export const settingsApi = {
  listExtensions: commands.settingsExtensionsList,
  setExtensionEnabled: commands.settingsExtensionSetEnabled,
  getLanguage: commands.settingsLanguageGet,
  setLanguage: commands.settingsLanguageSet,
};
