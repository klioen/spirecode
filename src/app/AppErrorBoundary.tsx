import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n";
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Workbench crashed", error, info);
  }
  render() {
    if (this.state.error)
      return (
        <main className="fatal-error">
          <span>S</span>
          <h1>{t("app.error.title")}</h1>
          <p>{this.state.error.message}</p>
          <button onClick={() => location.reload()}>
            {t("app.error.reload")}
          </button>
        </main>
      );
    return this.props.children;
  }
}
