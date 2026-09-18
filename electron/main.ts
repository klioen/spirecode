import { app, BrowserWindow, dialog, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppState } from "./appState.js";
import { registerIpc } from "./ipc.js";
import {
  createRendererLocationPolicy,
  isAllowedExternalUrl,
  isAllowedRendererUrl,
} from "./security/navigation.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const userDataOverride = process.argv
  .find((argument) => argument.startsWith("--user-data-dir="))
  ?.slice("--user-data-dir=".length);
app.setPath(
  "userData",
  userDataOverride ||
    path.join(app.getPath("appData"), "com.bytedance.spirecode.dev"),
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

  state = await AppState.create(app.getPath("userData"), window);
  unregisterIpc = registerIpc(state, locationPolicy);
  window.on("close", (event) => {
    if (
      !state?.windowCloseGuard.allowClose((count) =>
        confirmDiscard(window, count),
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
    await createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0)
        void createWindow().catch((error) => {
          console.error("Failed to create application window", error);
          void state?.diagnostics.log(
            `Failed to create application window: ${String(error)}`,
          );
        });
    });
  } catch (error) {
    console.error("Failed to start SpireCode", error);
    void state?.diagnostics.log(`Failed to start SpireCode: ${String(error)}`);
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", (event) => {
  if (cleanupStarted) return;
  if (
    state &&
    !state.windowCloseGuard.allowClose((count) =>
      confirmDiscard(state!.window, count),
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
      void state?.diagnostics.log(
        `Failed to dispose application state: ${String(error)}`,
      );
    })
    .finally(() => app.quit());
});

function confirmDiscard(window: BrowserWindow, count: number): boolean {
  const noun = count === 1 ? "file has" : "files have";
  return (
    dialog.showMessageBoxSync(window, {
      type: "warning",
      buttons: ["Cancel", "Discard and Quit"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: "Unsaved changes",
      message: `${count} ${noun} unsaved changes.`,
      detail: "Discarding will permanently lose those changes.",
    }) === 1
  );
}
