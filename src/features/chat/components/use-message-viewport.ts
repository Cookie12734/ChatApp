"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 48;

export function useMessageViewport({
  conversationKey,
  firstUnreadMessageId,
  latestMessageId,
  onReadLatest,
  unreadCount,
}: {
  conversationKey: string | null;
  firstUnreadMessageId?: string;
  latestMessageId?: string;
  onReadLatest: () => Promise<unknown> | void;
  unreadCount: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const unreadRef = useRef<HTMLDivElement | null>(null);
  const initializedConversationRef = useRef<string | null>(null);
  const previousLatestMessageRef = useRef<string | undefined>(undefined);
  const readMessageRef = useRef<string | undefined>(undefined);
  const [isActive, setIsActive] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const updateScrollPosition = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;

    setIsAtBottom(
      element.scrollHeight - element.scrollTop - element.clientHeight <=
        BOTTOM_THRESHOLD_PX,
    );
  }, []);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, []);

  const scrollToNewMessages = useCallback(() => {
    (unreadRef.current ?? endRef.current)?.scrollIntoView({ block: "center" });
  }, []);

  useEffect(() => {
    const updateActivity = () => {
      setIsActive(
        document.visibilityState === "visible" && document.hasFocus(),
      );
    };

    updateActivity();
    document.addEventListener("visibilitychange", updateActivity);
    window.addEventListener("focus", updateActivity);
    window.addEventListener("blur", updateActivity);
    return () => {
      document.removeEventListener("visibilitychange", updateActivity);
      window.removeEventListener("focus", updateActivity);
      window.removeEventListener("blur", updateActivity);
    };
  }, []);

  useEffect(() => {
    initializedConversationRef.current = null;
    previousLatestMessageRef.current = undefined;
    readMessageRef.current = undefined;
  }, [conversationKey]);

  useEffect(() => {
    if (!conversationKey || !latestMessageId) return;

    if (initializedConversationRef.current !== conversationKey) {
      initializedConversationRef.current = conversationKey;
      previousLatestMessageRef.current = latestMessageId;
      requestAnimationFrame(() => {
        if (firstUnreadMessageId) {
          scrollToNewMessages();
        } else {
          scrollToBottom();
        }
        updateScrollPosition();
      });
      return;
    }

    if (previousLatestMessageRef.current === latestMessageId) return;
    previousLatestMessageRef.current = latestMessageId;
    if (isActive && isAtBottom) {
      requestAnimationFrame(() => {
        scrollToBottom();
        updateScrollPosition();
      });
    }
  }, [
    conversationKey,
    firstUnreadMessageId,
    isActive,
    isAtBottom,
    latestMessageId,
    scrollToBottom,
    scrollToNewMessages,
    updateScrollPosition,
  ]);

  useEffect(() => {
    if (
      !isActive ||
      !isAtBottom ||
      unreadCount === 0 ||
      !latestMessageId ||
      readMessageRef.current === latestMessageId
    ) {
      return;
    }

    const readMessageId = latestMessageId;
    readMessageRef.current = readMessageId;
    void Promise.resolve()
      .then(onReadLatest)
      .catch(() => {
        if (readMessageRef.current === readMessageId) {
          readMessageRef.current = undefined;
        }
      });
  }, [isActive, isAtBottom, latestMessageId, onReadLatest, unreadCount]);

  return {
    containerRef,
    endRef,
    handleScroll: updateScrollPosition,
    newMessageCount: isActive && isAtBottom ? 0 : unreadCount,
    scrollToBottom,
    scrollToNewMessages,
    unreadRef,
  };
}
