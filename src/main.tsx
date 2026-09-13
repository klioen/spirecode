import React from "react";
import ReactDOM from "react-dom/client";
import "./app/monacoSetup";
import App from "./app/App";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
