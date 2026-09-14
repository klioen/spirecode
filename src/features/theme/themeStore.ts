import { create, type StoreApi, type UseBoundStore } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
}

const STORAGE_KEY = "pi-app.appearance.v1";
const modes: ThemeMode[] = ["system", "light", "dark"];

const storedMode = (): ThemeMode => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return modes.includes(value as ThemeMode) ? (value as ThemeMode) : "system";
  } catch {
    return "system";
  }
};

const resolve = (mode: ThemeMode, systemDark: boolean): ResolvedTheme =>
  mode === "system" ? (systemDark ? "dark" : "light") : mode;

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
  const initialMode = storedMode();
  const store = create<ThemeState>((set, get) => ({
    mode: initialMode,
    resolved: resolve(initialMode, query.matches),
    setMode: (mode) => {
      persist(mode);
      set({ mode, resolved: resolve(mode, query.matches) });
    },
    cycle: () => {
      const index = modes.indexOf(get().mode);
      get().setMode(modes[(index + 1) % modes.length]);
    },
  }));
  query.addEventListener("change", (event) => {
    if (store.getState().mode === "system")
      store.setState({ resolved: event.matches ? "dark" : "light" });
  });
  return store;
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
