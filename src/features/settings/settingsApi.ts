import { commands } from "../../bindings";

export const settingsApi = {
  listExtensions: commands.settingsExtensionsList,
  listSkills: commands.settingsSkillsList,
  setSkillEnabled: commands.settingsSkillSetEnabled,
  getLanguage: commands.settingsLanguageGet,
  getAgentReadiness: commands.settingsAgentReadiness,
  setLanguage: commands.settingsLanguageSet,
};
