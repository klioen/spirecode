import { create, type StoreApi, type UseBoundStore } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemeMode, "system">;

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
}

const STORAGE_KEY = "spirecode.appearance.v1";
const LEGACY_STORAGE_KEY = "pi-app.appearance.v1";
const modes: ThemeMode[] = ["system", "light", "dark"];

const isThemeMode = (value: string | null): value is ThemeMode =>
  modes.includes(value as ThemeMode);

const resolveMode = (mode: ThemeMode, systemDark: boolean): ResolvedTheme =>
  mode === "system" ? (systemDark ? "dark" : "light") : mode;

const storedMode = (): ThemeMode => {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(current)) return current;

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    const mode = isThemeMode(legacy) ? legacy : "system";
    localStorage.setItem(STORAGE_KEY, mode);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return mode;
  } catch {
    return "system";
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
  const initialMode = storedMode();
  const controller = create<ThemeState>((set, get) => ({
    mode: initialMode,
    resolved: resolveMode(initialMode, query.matches),
    setMode: (mode) => {
      persist(mode);
      set({ mode, resolved: resolveMode(mode, query.matches) });
    },
    cycle: () => {
      get().setMode(get().resolved === "light" ? "dark" : "light");
    },
  }));

  query.addEventListener("change", (event) => {
    if (controller.getState().mode !== "system") return;
    controller.setState({ resolved: event.matches ? "dark" : "light" });
  });
  return controller;
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

const applyTheme = (animate: boolean) => {
  const root = document.documentElement;
  if (animate) root.classList.add("theme-transition-disabled");
  root.dataset.theme = useThemeStore.getState().resolved;
  root.style.colorScheme = useThemeStore.getState().resolved;
  if (animate) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        root.classList.remove("theme-transition-disabled"),
      ),
    );
  }
};

applyTheme(false);
useThemeStore.subscribe((state, previous) => {
  if (state.resolved !== previous.resolved) applyTheme(true);
});
