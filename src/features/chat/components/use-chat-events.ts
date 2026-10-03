"use client";

import { useEffect, useRef } from "react";
import type { ChatEvent } from "~/server/chat-events";

export function useChatEvents({
  enabled = true,
  onEvent,
  onOpen,
  onConnectionChange,
}: {
  enabled?: boolean;
  onEvent: (event: ChatEvent) => void;
  onOpen: () => void;
  onConnectionChange: (connected: boolean) => void;
}) {
  const handlers = useRef({ onEvent, onOpen, onConnectionChange });
  handlers.current = { onEvent, onOpen, onConnectionChange };

  useEffect(() => {
    if (!enabled) return;
    const events = new EventSource("/api/chat/events");
    events.onopen = () => {
      handlers.current.onConnectionChange(true);
      handlers.current.onOpen();
    };
    events.onerror = () => handlers.current.onConnectionChange(false);
    events.addEventListener("chat", (event: MessageEvent<string>) => {
      let payload: ChatEvent;
      try {
        payload = JSON.parse(event.data) as ChatEvent;
      } catch {
        return;
      }
      handlers.current.onEvent(payload);
    });
    return () => {
      events.close();
      handlers.current.onConnectionChange(false);
    };
  }, [enabled]);
}
