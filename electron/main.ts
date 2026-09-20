import { app, BrowserWindow, dialog, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppState } from "./appState.js";
import {
  APPLICATION_ID,
  resolveUserDataDirectory,
  userDataOverrideFromArgv,
} from "./applicationIdentity.js";
import { registerIpc } from "./ipc.js";
import { unsavedChangesDialogOptions } from "./nativeDialog.js";
import {
  createRendererLocationPolicy,
  isAllowedExternalUrl,
  isAllowedRendererUrl,
} from "./security/navigation.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
if (process.platform === "win32") app.setAppUserModelId(APPLICATION_ID);
const userDataOverride = userDataOverrideFromArgv(process.argv);
const userDataReady = userDataOverride
  ? Promise.resolve(app.setPath("userData", userDataOverride))
  : resolveUserDataDirectory(app.getPath("appData"), process.argv).then(
      (resolution) => {
        app.setPath("userData", resolution.path);
        if (resolution.status === "fallback")
          console.warn(`User data migration was skipped: ${resolution.reason}`);
      },
    );
let state: AppState | undefined;
let unregisterIpc: (() => void) | undefined;
let cleanupStarted = false;

async function createWindow(): Promise<BrowserWindow> {
  const productionEntry = path.join(directory, "../dist/index.html");
  const developmentUrl = app.isPackaged
    ? undefined
    : process.env.VITE_DEV_SERVER_URL;
  const locationPolicy = createRendererLocationPolicy(
    productionEntry,
    developmentUrl,
  );
  const window = new BrowserWindow({
    title: "SpireCode",
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    center: true,
    show: false,
    webPreferences: {
      preload: path.join(directory, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  const guardNavigation = (event: Electron.Event, url: string) => {
    if (!isAllowedRendererUrl(url, locationPolicy)) event.preventDefault();
  };
  window.webContents.on("will-navigate", guardNavigation);

  const windowState = await AppState.create(app.getPath("userData"), window);
  state = windowState;
  unregisterIpc = registerIpc(windowState, locationPolicy);
  window.on("close", (event) => {
    if (
      !windowState.windowCloseGuard.allowClose((count) =>
        confirmDiscard(window, count, windowState.settings.currentLanguage()),
      )
    )
      event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());

  if (developmentUrl) await window.loadURL(developmentUrl);
  else await window.loadFile(productionEntry);
  return window;
}

void app.whenReady().then(async () => {
  try {
    await userDataReady;
    await createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0)
        void createWindow().catch((error) => {
          console.error("Failed to create application window", error);
          void state?.diagnostics.log({
            level: "error",
            code: "WINDOW_CREATE_FAILED",
            safeContext: { errorType: errorName(error) },
          });
        });
    });
  } catch (error) {
    console.error("Failed to start SpireCode", error);
    void state?.diagnostics.log({
      level: "error",
      code: "APP_START_FAILED",
      safeContext: { errorType: errorName(error) },
    });
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", (event) => {
  if (cleanupStarted) return;
  if (
    state &&
    !state.windowCloseGuard.allowClose((count) =>
      confirmDiscard(state!.window, count, state!.settings.currentLanguage()),
    )
  ) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  cleanupStarted = true;
  unregisterIpc?.();
  const cleanup = state?.dispose() ?? Promise.resolve();
  void cleanup
    .catch((error) => {
      console.error("Failed to dispose application state", error);
      void state?.diagnostics.log({
        level: "error",
        code: "APP_DISPOSE_FAILED",
        safeContext: { errorType: errorName(error) },
      });
    })
    .finally(() => app.quit());
});

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function confirmDiscard(
  window: BrowserWindow,
  count: number,
  language: import("./domains/settings/index.js").AppLanguage,
): boolean {
  return (
    dialog.showMessageBoxSync(
      window,
      unsavedChangesDialogOptions(language, count),
    ) === 1
  );
}
