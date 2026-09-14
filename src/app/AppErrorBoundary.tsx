import { Component, type ErrorInfo, type ReactNode } from "react";
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
          <h1>SpireCode could not start</h1>
          <p>{this.state.error.message}</p>
          <button onClick={() => location.reload()}>Reload</button>
        </main>
      );
    return this.props.children;
  }
}
