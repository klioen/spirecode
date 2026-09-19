import React from "react";
import ReactDOM from "react-dom/client";
import "./app/monacoSetup";
import App from "./app/App";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import "./styles/index.css";
import { initializeLanguage, type AppLanguage } from "./i18n";
import { settingsApi } from "./features/settings/settingsApi";

function HostStartupFailure(): never {
  throw new Error("Unable to connect to SpireCode host.");
}

function renderApplication(content: React.ReactNode): void {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <AppErrorBoundary>{content}</AppErrorBoundary>
    </React.StrictMode>,
  );
}

async function bootstrap(): Promise<void> {
  let language: AppLanguage;
  try {
    language = await settingsApi.getLanguage();
  } catch (error) {
    console.error("Unable to load interface language", error);
    initializeLanguage("en");
    renderApplication(<HostStartupFailure />);
    return;
  }
  initializeLanguage(language);
  renderApplication(<App />);
}

void bootstrap();
