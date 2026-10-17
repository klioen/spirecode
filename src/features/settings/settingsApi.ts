import { commands } from "../../bindings";

export const settingsApi = {
  listExtensions: commands.settingsExtensionsList,
  listExtensionCatalog: commands.settingsExtensionCatalogList,
  installExtensionPackage: commands.settingsExtensionPackageInstall,
  updateExtensionPackage: commands.settingsExtensionPackageUpdate,
  removeExtensionPackage: commands.settingsExtensionPackageRemove,
  listSkills: commands.settingsSkillsList,
  setSkillEnabled: commands.settingsSkillSetEnabled,
  getLanguage: commands.settingsLanguageGet,
  getAgentReadiness: commands.settingsAgentReadiness,
  setLanguage: commands.settingsLanguageSet,
};
