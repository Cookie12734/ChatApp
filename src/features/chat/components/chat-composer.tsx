"use client";

import { Send } from "lucide-react";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type ChatComposerHandle = {
  clear: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
};

type ChatComposerProps = {
  disabled: boolean;
  hasAttachments: boolean;
  hasReply: boolean;
  onSubmit: (value: string) => void;
  onValueChange?: (value: string) => void;
  placeholder: string;
  storageKey?: string;
};

type PendingDraftSave = {
  key: string;
  value: string;
};

function persistDraft({ key, value }: PendingDraftSave) {
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

const ChatComposerBase = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer(
    {
      disabled,
      hasAttachments,
      hasReply,
      onSubmit,
      onValueChange,
      placeholder,
      storageKey,
    },
    ref,
  ) {
    const [value, setValue] = useState("");
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSaveRef = useRef<PendingDraftSave | null>(null);

    const cancelPendingSave = useCallback(() => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      pendingSaveRef.current = null;
    }, []);

    const flushPendingSave = useCallback(() => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingSaveRef.current) persistDraft(pendingSaveRef.current);
      saveTimerRef.current = null;
      pendingSaveRef.current = null;
    }, []);

    const scheduleSave = useCallback((key: string, nextValue: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      pendingSaveRef.current = { key, value: nextValue };
      saveTimerRef.current = setTimeout(() => {
        if (pendingSaveRef.current) persistDraft(pendingSaveRef.current);
        saveTimerRef.current = null;
        pendingSaveRef.current = null;
      }, 400);
    }, []);

    const updateValue = useCallback(
      (nextValue: string) => {
        setValue(nextValue);
        if (storageKey) scheduleSave(storageKey, nextValue);
        onValueChange?.(nextValue);
      },
      [onValueChange, scheduleSave, storageKey],
    );

    useEffect(() => {
      flushPendingSave();
      setValue(storageKey ? (localStorage.getItem(storageKey) ?? "") : "");

      return flushPendingSave;
    }, [flushPendingSave, storageKey]);

    useImperativeHandle(
      ref,
      () => ({
        clear: () => {
          cancelPendingSave();
          if (storageKey) localStorage.removeItem(storageKey);
          setValue("");
        },
        getValue: () => value,
        setValue: updateValue,
      }),
      [cancelPendingSave, storageKey, updateValue, value],
    );

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || (!value.trim() && !hasAttachments)) return;
          onSubmit(value);
        }}
        className={`border-connect-ink/15 bg-connect-paper flex items-end gap-2 border px-3 py-1.5 ${hasReply ? "rounded-b-md" : "rounded-md"}`}
      >
        <textarea
          data-chat-input
          value={value}
          onChange={(event) => updateValue(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          className="text-connect-ink placeholder:text-connect-placeholder max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2 leading-6 outline-none focus:outline-none focus-visible:outline-none"
          placeholder={placeholder}
          disabled={disabled}
          maxLength={1000}
        />
        <button
          type="submit"
          disabled={disabled || (!value.trim() && !hasAttachments)}
          className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="送信"
        >
          <Send className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
    );
  },
);

export const ChatComposer = memo(ChatComposerBase);
