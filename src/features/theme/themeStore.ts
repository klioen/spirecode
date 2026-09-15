import { create, type StoreApi, type UseBoundStore } from "zustand";

export type ThemeMode = "light" | "dark";
export type ResolvedTheme = ThemeMode;

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
}

const STORAGE_KEY = "spirecode.appearance.v1";
const LEGACY_STORAGE_KEY = "pi-app.appearance.v1";
const modes: ThemeMode[] = ["light", "dark"];

const isThemeMode = (value: string | null): value is ThemeMode =>
  modes.includes(value as ThemeMode);

const storedMode = (systemDark: boolean): ThemeMode => {
  const systemMode: ThemeMode = systemDark ? "dark" : "light";
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(current)) return current;
    if (current === "system") {
      localStorage.setItem(STORAGE_KEY, systemMode);
      return systemMode;
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    const mode = isThemeMode(legacy) ? legacy : systemMode;
    localStorage.setItem(STORAGE_KEY, mode);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return mode;
  } catch {
    return systemMode;
  }
};

const persist = (mode: ThemeMode) => {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    return;
  }
};

export function createThemeController(
  query: MediaQueryList,
): UseBoundStore<StoreApi<ThemeState>> {
  const initialMode = storedMode(query.matches);
  return create<ThemeState>((set, get) => ({
    mode: initialMode,
    resolved: initialMode,
    setMode: (mode) => {
      persist(mode);
      set({ mode, resolved: mode });
    },
    cycle: () => {
      get().setMode(get().mode === "light" ? "dark" : "light");
    },
  }));
}

const fallbackQuery: MediaQueryList = {
  matches: false,
  media: "(prefers-color-scheme: dark)",
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
};
const systemQuery =
  window.matchMedia?.("(prefers-color-scheme: dark)") ?? fallbackQuery;
export const useThemeStore = createThemeController(systemQuery);

const applyTheme = () => {
  document.documentElement.dataset.theme = useThemeStore.getState().resolved;
  document.documentElement.style.colorScheme =
    useThemeStore.getState().resolved;
};

applyTheme();
useThemeStore.subscribe(applyTheme);
