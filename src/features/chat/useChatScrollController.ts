import { useCallback, useEffect, useRef, useState } from "react";

const FOLLOW_THRESHOLD = 48;
const BUTTON_THRESHOLD = 250;

function distanceFromBottom(element: HTMLElement): number {
  return element.scrollHeight - element.clientHeight - element.scrollTop;
}

function moveToBottom(element: HTMLElement): void {
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ top: element.scrollHeight });
  } else {
    element.scrollTop = element.scrollHeight;
  }
}

export function useChatScrollController(sessionId: string) {
  const elementRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<() => void>(() => undefined);
  const followingRef = useRef(true);
  const previousScrollTopRef = useRef(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const updateScrollState = useCallback((element: HTMLElement) => {
    const distance = distanceFromBottom(element);
    const scrollingUp = element.scrollTop < previousScrollTopRef.current;
    if (scrollingUp && distance > FOLLOW_THRESHOLD)
      followingRef.current = false;
    if (distance <= FOLLOW_THRESHOLD) followingRef.current = true;
    previousScrollTopRef.current = element.scrollTop;
    setShowScrollToBottom(distance > BUTTON_THRESHOLD);
  }, []);

  const scrollToBottom = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    followingRef.current = true;
    moveToBottom(element);
    previousScrollTopRef.current = element.scrollHeight;
    setShowScrollToBottom(false);
  }, []);

  const transcriptRef = useCallback(
    (element: HTMLDivElement | null) => {
      cleanupRef.current();
      elementRef.current = element;
      if (!element) return;

      followingRef.current = true;
      previousScrollTopRef.current = element.scrollTop;
      const onScroll = () => updateScrollState(element);
      element.addEventListener("scroll", onScroll, { passive: true });
      const observer =
        typeof ResizeObserver === "undefined"
          ? undefined
          : new ResizeObserver(() => {
              if (followingRef.current) moveToBottom(element);
              updateScrollState(element);
            });
      observer?.observe(element);
      for (const child of element.children) observer?.observe(child);
      const mutationObserver =
        typeof MutationObserver === "undefined"
          ? undefined
          : new MutationObserver(() => {
              for (const child of element.children) observer?.observe(child);
              if (followingRef.current) moveToBottom(element);
              updateScrollState(element);
            });
      mutationObserver?.observe(element, { childList: true, subtree: true });
      cleanupRef.current = () => {
        element.removeEventListener("scroll", onScroll);
        observer?.disconnect();
        mutationObserver?.disconnect();
      };
    },
    [updateScrollState],
  );

  useEffect(() => {
    followingRef.current = true;
    setShowScrollToBottom(false);
    return () => cleanupRef.current();
  }, [sessionId]);

  return { transcriptRef, scrollToBottom, showScrollToBottom };
}
