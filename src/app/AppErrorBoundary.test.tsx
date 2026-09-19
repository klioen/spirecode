import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeLanguage } from "../i18n";
import { AppErrorBoundary } from "./AppErrorBoundary";

function Broken({ message = "raw host failure" }: { message?: string }): never {
  throw new Error(message);
}

beforeEach(() => {
  initializeLanguage("en");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("AppErrorBoundary", () => {
  it("shows an English host bootstrap failure before application render", async () => {
    let startupUi: ReactNode;
    const renderRoot = vi.fn((content: ReactNode) => {
      startupUi = content;
    });
    vi.doMock("./monacoSetup", () => ({}));
    vi.doMock("react-dom/client", () => ({
      default: { createRoot: () => ({ render: renderRoot }) },
    }));
    vi.doMock("../features/settings/settingsApi", () => ({
      settingsApi: {
        getLanguage: vi.fn().mockRejectedValue(new Error("host unavailable")),
      },
    }));
    vi.doMock("./App", () => ({
      default: () => <div>application content</div>,
    }));

    await import("../main");
    await waitFor(() => expect(renderRoot).toHaveBeenCalledOnce());
    render(startupUi!);

    expect(
      screen.getByRole("heading", { name: "SpireCode could not start" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Unable to connect to SpireCode host."),
    ).toBeInTheDocument();
    expect(screen.queryByText("application content")).not.toBeInTheDocument();
  });

  it("localizes application chrome and preserves the raw error", () => {
    initializeLanguage("zh-CN");
    render(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "SpireCode 无法启动" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重新加载" }),
    ).toBeInTheDocument();
    expect(screen.getByText("raw host failure")).toBeInTheDocument();
  });
});
