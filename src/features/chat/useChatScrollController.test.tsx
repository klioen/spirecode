import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatScrollController } from "./useChatScrollController";

class ResizeObserverMock {
  static callback: ResizeObserverCallback | undefined;
  constructor(callback: ResizeObserverCallback) {
    ResizeObserverMock.callback = callback;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

function transcript() {
  const element = document.createElement("div");
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 400 },
    scrollHeight: { configurable: true, value: 1000 },
    scrollTop: { configurable: true, writable: true, value: 600 },
  });
  const scrollTo = vi.fn((first?: ScrollToOptions | number, y?: number) => {
    element.scrollTop =
      typeof first === "number"
        ? (y ?? first)
        : (first?.top ?? element.scrollTop);
  });
  Object.defineProperty(element, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  return element;
}

beforeEach(() => {
  ResizeObserverMock.callback = undefined;
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

describe("useChatScrollController", () => {
  it("follows growth while near the bottom", () => {
    const element = transcript();
    const { result } = renderHook(() => useChatScrollController("session-1"));

    act(() => result.current.transcriptRef(element));
    act(() => ResizeObserverMock.callback?.([], {} as ResizeObserver));

    expect(element.scrollTo).toHaveBeenCalledWith({ top: 1000 });
    expect(result.current.showScrollToBottom).toBe(false);
  });

  it("stops following after the user scrolls upward and exposes recovery", () => {
    const element = transcript();
    const { result } = renderHook(() => useChatScrollController("session-1"));
    act(() => result.current.transcriptRef(element));

    element.scrollTop = 100;
    act(() => {
      element.dispatchEvent(new Event("scroll"));
    });
    act(() => ResizeObserverMock.callback?.([], {} as ResizeObserver));

    expect(result.current.showScrollToBottom).toBe(true);
    expect(element.scrollTo).not.toHaveBeenCalled();

    act(() => result.current.scrollToBottom());
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 1000 });
    expect(result.current.showScrollToBottom).toBe(false);
  });
});
