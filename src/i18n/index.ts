import { useCallback } from "react";
import { create } from "zustand";
import type { AppLanguage } from "../bindings";
import { en, type TranslationKey, type TranslationValues } from "./en";
import { zhCN } from "./zh-CN";

export type { AppLanguage } from "../bindings";
export { en, zhCN };
export type { TranslationKey, TranslationValues };

const catalogs: Record<AppLanguage, Record<TranslationKey, string>> = {
  en,
  "zh-CN": zhCN,
};
const locales: Record<AppLanguage, string> = { en: "en-US", "zh-CN": "zh-CN" };

interface LanguageState {
  language: AppLanguage;
  setLanguage(language: AppLanguage): void;
}

function syncDocumentLanguage(language: AppLanguage): void {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: "en",
  setLanguage: (language) => {
    syncDocumentLanguage(language);
    set({ language });
  },
}));

export function initializeLanguage(language: AppLanguage = "en"): void {
  useLanguageStore.getState().setLanguage(language);
}

export function setLanguage(language: AppLanguage): void {
  useLanguageStore.getState().setLanguage(language);
}

export function getLanguage(): AppLanguage {
  return useLanguageStore.getState().language;
}

function translate(
  language: AppLanguage,
  key: TranslationKey,
  values: TranslationValues = {},
): string {
  return catalogs[language][key].replace(/\{(\w+)\}/g, (placeholder, name) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : placeholder,
  );
}

export function t(key: TranslationKey, values?: TranslationValues): string {
  return translate(getLanguage(), key, values);
}

export function useTranslation() {
  const language = useLanguageStore((state) => state.language);
  const translateForRender = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      translate(language, key, values),
    [language],
  );
  return { language, t: translateForRender };
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locales[getLanguage()], options).format(value);
}

export function formatDateTime(value: Date | number): string {
  return new Intl.DateTimeFormat(locales[getLanguage()], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function formatList(values: string[]): string {
  const ListFormat = (
    Intl as typeof Intl & {
      ListFormat: new (
        locale: string,
        options: { style: "long"; type: "conjunction" },
      ) => { format(items: string[]): string };
    }
  ).ListFormat;
  return new ListFormat(locales[getLanguage()], {
    style: "long",
    type: "conjunction",
  }).format(values);
}

syncDocumentLanguage("en");
