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

export function useChatScrollController(
  sessionId: string,
  revision = 0,
  running = false,
) {
  const elementRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<() => void>(() => undefined);
  const followingRef = useRef(true);
  const previousScrollTopRef = useRef(0);
  const previousScrollHeightRef = useRef(0);
  const generationRef = useRef(0);
  const timersRef = useRef(new Set<number>());
  const touchYRef = useRef<number | undefined>(undefined);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  const invalidateScheduledScrolls = useCallback(() => {
    generationRef.current += 1;
    clearTimers();
  }, [clearTimers]);

  const updateButton = useCallback((element: HTMLElement) => {
    setShowScrollToBottom(distanceFromBottom(element) > BUTTON_THRESHOLD);
  }, []);

  const pauseFollowing = useCallback(
    (element: HTMLElement) => {
      followingRef.current = false;
      invalidateScheduledScrolls();
      updateButton(element);
    },
    [invalidateScheduledScrolls, updateButton],
  );

  const recordLayout = useCallback((element: HTMLElement) => {
    previousScrollTopRef.current = element.scrollTop;
    previousScrollHeightRef.current = element.scrollHeight;
  }, []);

  const moveToBottomAndRecord = useCallback(
    (element: HTMLElement) => {
      moveToBottom(element);
      recordLayout(element);
    },
    [recordLayout],
  );

  const resumeFollowing = useCallback(
    (element: HTMLElement, move = false) => {
      invalidateScheduledScrolls();
      followingRef.current = true;
      if (move) moveToBottomAndRecord(element);
      else recordLayout(element);
      setShowScrollToBottom(false);
    },
    [invalidateScheduledScrolls, moveToBottomAndRecord, recordLayout],
  );

  const updateAfterUserScroll = useCallback(
    (element: HTMLElement) => {
      const scrollTop = element.scrollTop;
      const previousScrollTop = previousScrollTopRef.current;
      const distance = distanceFromBottom(element);

      if (
        scrollTop < previousScrollTop &&
        element.scrollHeight >= previousScrollHeightRef.current
      ) {
        pauseFollowing(element);
      } else if (
        scrollTop > previousScrollTop &&
        distance <= FOLLOW_THRESHOLD
      ) {
        resumeFollowing(element);
      } else {
        updateButton(element);
      }
      recordLayout(element);
    },
    [pauseFollowing, recordLayout, resumeFollowing, updateButton],
  );

  const syncAfterLayout = useCallback(
    (element: HTMLElement) => {
      const upwardDeparture =
        element.scrollTop < previousScrollTopRef.current &&
        element.scrollHeight >= previousScrollHeightRef.current;
      if (followingRef.current && upwardDeparture) pauseFollowing(element);
      if (followingRef.current) moveToBottomAndRecord(element);
      else recordLayout(element);
      updateButton(element);
    },
    [moveToBottomAndRecord, pauseFollowing, recordLayout, updateButton],
  );

  const scheduleScroll = useCallback(
    (element: HTMLElement, delay: number, generation: number) => {
      const timer = window.setTimeout(() => {
        timersRef.current.delete(timer);
        if (
          generationRef.current !== generation ||
          !followingRef.current ||
          elementRef.current !== element
        )
          return;
        if (
          element.scrollTop < previousScrollTopRef.current &&
          element.scrollHeight >= previousScrollHeightRef.current
        ) {
          pauseFollowing(element);
          recordLayout(element);
          return;
        }
        moveToBottomAndRecord(element);
        updateButton(element);
      }, delay);
      timersRef.current.add(timer);
    },
    [moveToBottomAndRecord, pauseFollowing, recordLayout, updateButton],
  );

  const transcriptRef = useCallback(
    (element: HTMLElement | null) => {
      cleanupRef.current();
      invalidateScheduledScrolls();
      elementRef.current = element;
      if (!element) return;

      followingRef.current = true;
      moveToBottomAndRecord(element);
      setShowScrollToBottom(false);

      const onScroll = () => updateAfterUserScroll(element);
      const onWheel = (event: WheelEvent) => {
        if (event.deltaY < 0) pauseFollowing(element);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (
          event.key === "ArrowUp" ||
          event.key === "PageUp" ||
          event.key === "Home" ||
          (event.key === " " && event.shiftKey)
        )
          pauseFollowing(element);
      };
      const onTouchStart = (event: TouchEvent) => {
        touchYRef.current = event.touches[0]?.clientY;
      };
      const onTouchMove = (event: TouchEvent) => {
        const nextY = event.touches[0]?.clientY;
        if (
          nextY !== undefined &&
          touchYRef.current !== undefined &&
          nextY > touchYRef.current
        )
          pauseFollowing(element);
        touchYRef.current = nextY;
      };
      const onTouchEnd = () => {
        touchYRef.current = undefined;
      };

      element.addEventListener("scroll", onScroll, { passive: true });
      element.addEventListener("wheel", onWheel, { passive: true });
      element.addEventListener("keydown", onKeyDown);
      element.addEventListener("touchstart", onTouchStart, { passive: true });
      element.addEventListener("touchmove", onTouchMove, { passive: true });
      element.addEventListener("touchend", onTouchEnd, { passive: true });
      element.addEventListener("touchcancel", onTouchEnd, { passive: true });

      const observer =
        typeof ResizeObserver === "undefined"
          ? undefined
          : new ResizeObserver(() => syncAfterLayout(element));
      observer?.observe(element);
      for (const child of element.children) observer?.observe(child);
      const mutationObserver =
        typeof MutationObserver === "undefined"
          ? undefined
          : new MutationObserver(() => {
              for (const child of element.children) observer?.observe(child);
              syncAfterLayout(element);
            });
      mutationObserver?.observe(element, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      cleanupRef.current = () => {
        element.removeEventListener("scroll", onScroll);
        element.removeEventListener("wheel", onWheel);
        element.removeEventListener("keydown", onKeyDown);
        element.removeEventListener("touchstart", onTouchStart);
        element.removeEventListener("touchmove", onTouchMove);
        element.removeEventListener("touchend", onTouchEnd);
        element.removeEventListener("touchcancel", onTouchEnd);
        observer?.disconnect();
        mutationObserver?.disconnect();
      };
    },
    [
      invalidateScheduledScrolls,
      moveToBottomAndRecord,
      pauseFollowing,
      syncAfterLayout,
      updateAfterUserScroll,
    ],
  );

  useEffect(() => {
    const element = elementRef.current;
    invalidateScheduledScrolls();
    followingRef.current = true;
    setShowScrollToBottom(false);
    if (element) moveToBottomAndRecord(element);
  }, [sessionId, invalidateScheduledScrolls, moveToBottomAndRecord]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !followingRef.current) return;
    const generation = generationRef.current;
    const delays = running ? [0, 50, 180] : [0, 16, 80, 180, 360];
    for (const delay of delays) scheduleScroll(element, delay, generation);
    return clearTimers;
  }, [revision, running, scheduleScroll, clearTimers]);

  useEffect(
    () => () => {
      invalidateScheduledScrolls();
      cleanupRef.current();
    },
    [invalidateScheduledScrolls],
  );

  const recoverToBottom = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    resumeFollowing(element, true);
    const generation = generationRef.current;
    for (const delay of [80, 180, 360, 720])
      scheduleScroll(element, delay, generation);
  }, [resumeFollowing, scheduleScroll]);

  return {
    transcriptRef,
    scrollToBottom: recoverToBottom,
    showScrollToBottom,
  };
}
