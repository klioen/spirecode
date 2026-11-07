import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

class MutationObserverMock {
  static callback: MutationCallback | undefined;
  constructor(callback: MutationCallback) {
    MutationObserverMock.callback = callback;
  }
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

type Transcript = HTMLElement & { setScrollHeight: (height: number) => void };

function transcript(): Transcript {
  const element = document.createElement("div") as unknown as Transcript;
  let scrollHeight = 1000;
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 400 },
    scrollHeight: { configurable: true, get: () => scrollHeight },
    scrollTop: { configurable: true, writable: true, value: 600 },
  });
  element.setScrollHeight = (height) => {
    scrollHeight = height;
  };
  const scrollTo = vi.fn((first?: ScrollToOptions | number, y?: number) => {
    const requested =
      typeof first === "number"
        ? (y ?? first)
        : (first?.top ?? element.scrollTop);
    element.scrollTop = Math.max(
      0,
      Math.min(requested, element.scrollHeight - element.clientHeight),
    );
  });
  Object.defineProperty(element, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  return element;
}

function scroll(element: HTMLElement, scrollTop: number) {
  element.scrollTop = scrollTop;
  element.dispatchEvent(new Event("scroll"));
}

beforeEach(() => {
  ResizeObserverMock.callback = undefined;
  MutationObserverMock.callback = undefined;
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("MutationObserver", MutationObserverMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useChatScrollController", () => {
  it("follows streaming growth while at the bottom", () => {
    const element = transcript();
    const { result } = renderHook(() =>
      useChatScrollController("session-1", 1, true),
    );

    act(() => result.current.transcriptRef(element));
    vi.mocked(element.scrollTo).mockClear();
    element.setScrollHeight(1100);
    act(() => ResizeObserverMock.callback?.([], {} as ResizeObserver));

    expect(element.scrollTo).toHaveBeenCalledWith({ top: 1100 });
    expect(element.scrollTop).toBe(700);
    expect(result.current.showScrollToBottom).toBe(false);
  });

  it("does not let layout, DOM, revision, or running updates reclaim a user scroll", async () => {
    vi.useFakeTimers();
    const element = transcript();
    const { result, rerender } = renderHook(
      ({ revision, running }) =>
        useChatScrollController("session-1", revision, running),
      { initialProps: { revision: 1, running: true } },
    );
    act(() => result.current.transcriptRef(element));
    vi.mocked(element.scrollTo).mockClear();

    act(() => scroll(element, 100));
    element.setScrollHeight(1200);
    act(() => ResizeObserverMock.callback?.([], {} as ResizeObserver));
    act(() => MutationObserverMock.callback?.([], {} as MutationObserver));
    rerender({ revision: 2, running: false });
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(element.scrollTop).toBe(100);
    expect(element.scrollTo).not.toHaveBeenCalled();
    expect(result.current.showScrollToBottom).toBe(true);
  });

  it("pauses on upward wheel intent before observers or pending timers can run", async () => {
    vi.useFakeTimers();
    const element = transcript();
    const { result, rerender } = renderHook(
      ({ revision }) => useChatScrollController("session-1", revision, true),
      { initialProps: { revision: 1 } },
    );
    act(() => result.current.transcriptRef(element));
    rerender({ revision: 2 });
    vi.mocked(element.scrollTo).mockClear();

    act(() => {
      element.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    });
    element.setScrollHeight(1150);
    act(() => ResizeObserverMock.callback?.([], {} as ResizeObserver));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(element.scrollTo).not.toHaveBeenCalled();
    expect(element.scrollTop).toBe(600);
  });

  it("honors a scrollbar departure even if layout observation wins the event race", () => {
    const element = transcript();
    const { result } = renderHook(() =>
      useChatScrollController("session-1", 1, true),
    );
    act(() => result.current.transcriptRef(element));
    vi.mocked(element.scrollTo).mockClear();

    element.scrollTop = 100;
    act(() => ResizeObserverMock.callback?.([], {} as ResizeObserver));

    expect(element.scrollTop).toBe(100);
    expect(element.scrollTo).not.toHaveBeenCalled();
  });

  it("does not treat a content-height clamp as user intent", () => {
    const element = transcript();
    const { result } = renderHook(() =>
      useChatScrollController("session-1", 1, true),
    );
    act(() => result.current.transcriptRef(element));
    vi.mocked(element.scrollTo).mockClear();

    element.setScrollHeight(900);
    element.scrollTop = 500;
    act(() => ResizeObserverMock.callback?.([], {} as ResizeObserver));
    element.setScrollHeight(1100);
    act(() => ResizeObserverMock.callback?.([], {} as ResizeObserver));

    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 1100 });
    expect(element.scrollTop).toBe(700);
  });

  it("invalidates already scheduled alignment after a user scrolls upward", async () => {
    vi.useFakeTimers();
    const element = transcript();
    const { result, rerender } = renderHook(
      ({ revision }) => useChatScrollController("session-1", revision, true),
      { initialProps: { revision: 1 } },
    );
    act(() => result.current.transcriptRef(element));
    rerender({ revision: 2 });
    vi.mocked(element.scrollTo).mockClear();

    act(() => scroll(element, 100));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(element.scrollTo).not.toHaveBeenCalled();
    expect(element.scrollTop).toBe(100);
  });

  it("resumes following when the user scrolls back near the bottom", () => {
    const element = transcript();
    const { result } = renderHook(() =>
      useChatScrollController("session-1", 1, true),
    );
    act(() => result.current.transcriptRef(element));
    act(() => scroll(element, 100));
    expect(result.current.showScrollToBottom).toBe(true);

    act(() => scroll(element, 570));
    element.setScrollHeight(1100);
    vi.mocked(element.scrollTo).mockClear();
    act(() => ResizeObserverMock.callback?.([], {} as ResizeObserver));

    expect(element.scrollTo).toHaveBeenCalledWith({ top: 1100 });
    expect(result.current.showScrollToBottom).toBe(false);
  });

  it("clicking the recovery action restores current and future following", () => {
    const element = transcript();
    const { result } = renderHook(() =>
      useChatScrollController("session-1", 1, true),
    );
    act(() => result.current.transcriptRef(element));
    act(() => scroll(element, 100));

    vi.mocked(element.scrollTo).mockClear();
    act(() => result.current.scrollToBottom());
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 1000 });
    expect(result.current.showScrollToBottom).toBe(false);

    element.setScrollHeight(1100);
    act(() => MutationObserverMock.callback?.([], {} as MutationObserver));
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 1100 });
  });

  it("starts following the latest content when the session changes", () => {
    const element = transcript();
    const { result, rerender } = renderHook(
      ({ sessionId }) => useChatScrollController(sessionId, 1, true),
      { initialProps: { sessionId: "session-1" } },
    );
    act(() => result.current.transcriptRef(element));
    act(() => scroll(element, 100));
    vi.mocked(element.scrollTo).mockClear();

    rerender({ sessionId: "session-2" });

    expect(element.scrollTo).toHaveBeenCalledWith({ top: 1000 });
    expect(element.scrollTop).toBe(600);
    expect(result.current.showScrollToBottom).toBe(false);

    vi.mocked(element.scrollTo).mockClear();
    element.setScrollHeight(1100);
    act(() => ResizeObserverMock.callback?.([], {} as ResizeObserver));
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 1100 });
  });
});
