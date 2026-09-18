import { create } from "zustand";

const KEY = "spirecode.settings.v1";
export type WordWrap = "off" | "on";
export interface AppSettings {
  editorFontSize: 13 | 14 | 16 | 18;
  wordWrap: WordWrap;
  terminalFontSize: 12 | 13 | 14 | 16;
  terminalScrollback: 1000 | 5000 | 10000 | 20000;
}
const defaults: AppSettings = {
  editorFontSize: 13,
  wordWrap: "off",
  terminalFontSize: 12,
  terminalScrollback: 5000,
};
const valid = {
  editorFontSize: new Set([13, 14, 16, 18]),
  wordWrap: new Set(["off", "on"]),
  terminalFontSize: new Set([12, 13, 14, 16]),
  terminalScrollback: new Set([1000, 5000, 10000, 20000]),
};
function load(): AppSettings {
  try {
    const value = JSON.parse(
      localStorage.getItem(KEY) ?? "null",
    ) as Partial<AppSettings> | null;
    return {
      editorFontSize: valid.editorFontSize.has(value?.editorFontSize as number)
        ? (value!.editorFontSize! as AppSettings["editorFontSize"])
        : defaults.editorFontSize,
      wordWrap: valid.wordWrap.has(value?.wordWrap as string)
        ? (value!.wordWrap! as WordWrap)
        : defaults.wordWrap,
      terminalFontSize: valid.terminalFontSize.has(
        value?.terminalFontSize as number,
      )
        ? (value!.terminalFontSize! as AppSettings["terminalFontSize"])
        : defaults.terminalFontSize,
      terminalScrollback: valid.terminalScrollback.has(
        value?.terminalScrollback as number,
      )
        ? (value!.terminalScrollback! as AppSettings["terminalScrollback"])
        : defaults.terminalScrollback,
    };
  } catch {
    return defaults;
  }
}
function save(value: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* best effort */
  }
}
interface SettingsStore extends AppSettings {
  setSetting: (
    key: keyof AppSettings,
    value: AppSettings[keyof AppSettings],
  ) => void;
}
export const useSettingsStore = create<SettingsStore>((set) => ({
  ...load(),
  setSetting: (key, value) =>
    set((state) => {
      const next = { ...state, [key]: value } as AppSettings;
      save(next);
      return { [key]: value } as Partial<SettingsStore>;
    }),
}));
export const settingsDefaults = defaults;
