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

import {
  MessageAttachmentPicker,
  type PendingAttachment,
} from "./message-attachment-picker";

export type ChatComposerHandle = {
  clear: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
};

type ChatComposerProps = {
  attachments: PendingAttachment[];
  attachmentsDisabled: boolean;
  disabled: boolean;
  hasReply: boolean;
  onAttachmentsChange: (attachments: PendingAttachment[]) => void;
  onAttachmentError: (message: string) => void;
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
      attachments,
      attachmentsDisabled,
      disabled,
      hasReply,
      onAttachmentsChange,
      onAttachmentError,
      onSubmit,
      onValueChange,
      placeholder,
      storageKey,
    },
    ref,
  ) {
    const [value, setValue] = useState("");
    const hasAttachments = attachments.length > 0;
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
        data-chat-composer
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || (!value.trim() && !hasAttachments)) return;
          onSubmit(value);
        }}
        className={`border-connect-ink/15 bg-connect-paper focus-within:border-connect-action min-w-0 border px-2 py-1.5 ${hasReply ? "rounded-b-md" : "rounded-md"}`}
      >
        <MessageAttachmentPicker
          attachments={attachments}
          disabled={disabled || attachmentsDisabled}
          onChange={onAttachmentsChange}
          onError={onAttachmentError}
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
            className="text-connect-ink placeholder:text-connect-placeholder focus-visible:ring-connect-action max-h-36 min-h-11 min-w-0 flex-1 resize-none rounded-sm bg-transparent py-2 leading-6 outline-none focus-visible:ring-2"
            placeholder={placeholder}
            disabled={disabled}
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={disabled || (!value.trim() && !hasAttachments)}
            className="bg-connect-ink text-connect-paper hover:bg-connect-ink-2 focus-visible:outline-connect-action flex size-11 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="送信"
          >
            <Send className="h-5 w-5" aria-hidden="true" />
          </button>
        </MessageAttachmentPicker>
      </form>
    );
  },
);

export const ChatComposer = memo(ChatComposerBase);
