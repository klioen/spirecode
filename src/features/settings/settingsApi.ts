import { commands } from "../../bindings";

export const settingsApi = {
  listExtensions: commands.settingsExtensionsList,
  getLanguage: commands.settingsLanguageGet,
  getAgentReadiness: commands.settingsAgentReadiness,
  setLanguage: commands.settingsLanguageSet,
};
