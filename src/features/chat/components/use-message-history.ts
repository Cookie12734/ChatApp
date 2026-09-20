"use client";

import {
  useLayoutEffect,
  useRef,
  type RefObject,
  type WheelEvent,
  type TouchEvent,
  type KeyboardEvent,
} from "react";

// Fetch only in response to upward scrolling, never merely because the list is short.
export function useMessageHistory({
  containerRef,
  conversationKey,
  pageCount,
  hasNextPage,
  isFetching,
  fetchNextPage,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  conversationKey: string | null;
  pageCount: number;
  hasNextPage: boolean;
  isFetching: boolean;
  fetchNextPage: () => Promise<{ isError: boolean }>;
}) {
  const previousTop = useRef(0);
  const pending = useRef<{
    key: string | null;
    pageCount: number;
    height: number;
    top: number;
  } | null>(null);
  const inFlight = useRef(false);
  const touchY = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    previousTop.current = 0;
    pending.current = null;
  }, [conversationKey]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    const anchor = pending.current;
    if (
      element &&
      anchor?.key === conversationKey &&
      anchor.pageCount !== pageCount
    ) {
      element.scrollTop = anchor.top + element.scrollHeight - anchor.height;
      previousTop.current = element.scrollTop;
      pending.current = null;
    }
  }, [containerRef, conversationKey, pageCount]);

  const loadOlder = async () => {
    const element = containerRef.current;
    if (!element || !hasNextPage || isFetching || inFlight.current) return;
    const anchor = {
      key: conversationKey,
      pageCount,
      height: element.scrollHeight,
      top: element.scrollTop,
    };
    pending.current = anchor;
    inFlight.current = true;
    try {
      const result = await fetchNextPage();
      if (result.isError && pending.current === anchor) pending.current = null;
    } catch (error) {
      if (pending.current === anchor) pending.current = null;
      throw error;
    } finally {
      inFlight.current = false;
    }
  };

  return {
    loadOlder,
    handleWheel: (event: WheelEvent<HTMLDivElement>) => {
      if (event.deltaY < 0 && event.currentTarget.scrollTop <= 80) {
        void loadOlder().catch(() => undefined);
      }
    },
    handleTouchStart: (event: TouchEvent<HTMLDivElement>) => {
      touchY.current = event.touches[0]?.clientY;
    },
    handleTouchMove: (event: TouchEvent<HTMLDivElement>) => {
      const y = event.touches[0]?.clientY;
      if (
        y !== undefined &&
        touchY.current !== undefined &&
        y > touchY.current &&
        event.currentTarget.scrollTop <= 80
      ) {
        void loadOlder().catch(() => undefined);
      }
      touchY.current = y;
    },
    handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        event.target === event.currentTarget &&
        ["ArrowUp", "PageUp", "Home"].includes(event.key) &&
        event.currentTarget.scrollTop <= 80
      ) {
        event.preventDefault();
        void loadOlder().catch(() => undefined);
      }
    },
    handleScroll: () => {
      const element = containerRef.current;
      if (!element) return;
      const top = element.scrollTop;
      if (pending.current?.key === conversationKey) {
        pending.current.top = top;
      }
      const movingUp = top < previousTop.current;
      previousTop.current = top;
      if (movingUp && top <= 80) void loadOlder().catch(() => undefined);
    },
  };
}
