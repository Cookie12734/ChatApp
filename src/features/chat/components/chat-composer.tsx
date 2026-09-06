"use client";

import { Send } from "lucide-react";
import {
  getMessageSendAttempt,
  type MessageSendAttempt,
} from "~/features/chat/message-send-attempt";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  EmojiPickerButton,
  MessageAttachmentPicker,
  PendingAttachmentList,
  type PendingAttachment,
} from "~/features/chat/components/message-attachment-picker";

export type ChatComposerHandle = {
  quote: (content: string) => void;
};

export type ChatComposerSubmission = {
  attachmentIds: string[];
  clientId: string;
  content: string;
};

type ChatComposerProps = {
  disabled?: boolean;
  joinedToReply?: boolean;
  onError: (message: string) => void;
  onSubmit: (submission: ChatComposerSubmission) => Promise<void>;
  onTypingChange?: (isTyping: boolean) => void;
  placeholder: string;
  replyToId?: string;
  storageKey: string | null;
};

function persistDraft(key: string | null, value: string) {
  if (!key || typeof window === "undefined") return;
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer(
    {
      disabled = false,
      joinedToReply = false,
      onError,
      onSubmit,
      onTypingChange,
      placeholder,
      replyToId,
      storageKey,
    },
    ref,
  ) {
    const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
    const [draft, setDraft] = useState("");
    const [isSending, setIsSending] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const inputHintId = useId();
    const draftRef = useRef({ key: storageKey, value: draft });
    const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const lastTypingSentAtRef = useRef(0);
    const sendAttempt = useRef<MessageSendAttempt | undefined>(undefined);

    const updateDraft = useCallback(
      (value: string) => {
        draftRef.current = { key: storageKey, value };
        setDraft(value);

        if (!onTypingChange) return;
        if (!value.trim()) {
          if (typingStopTimerRef.current) {
            clearTimeout(typingStopTimerRef.current);
          }
          lastTypingSentAtRef.current = 0;
          onTypingChange(false);
          return;
        }

        const now = Date.now();
        if (now - lastTypingSentAtRef.current >= 10_000) {
          lastTypingSentAtRef.current = now;
          onTypingChange(true);
        }
        if (typingStopTimerRef.current) {
          clearTimeout(typingStopTimerRef.current);
        }
        typingStopTimerRef.current = setTimeout(() => {
          lastTypingSentAtRef.current = 0;
          onTypingChange(false);
        }, 1600);
      },
      [onTypingChange, storageKey],
    );

    useEffect(() => {
      const value = storageKey ? (localStorage.getItem(storageKey) ?? "") : "";
      draftRef.current = { key: storageKey, value };
      setDraft(value);
    }, [storageKey]);

    useImperativeHandle(
      ref,
      () => ({
        quote(content) {
          const quoted = content
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
          updateDraft(
            `${draftRef.current.value.trimEnd()}${draftRef.current.value ? "\n" : ""}${quoted}\n`.slice(
              0,
              1000,
            ),
          );
          requestAnimationFrame(() => textareaRef.current?.focus());
        },
      }),
      [updateDraft],
    );

    useEffect(() => {
      const timer = setTimeout(
        () => persistDraft(storageKey, draftRef.current.value),
        400,
      );
      return () => clearTimeout(timer);
    }, [draft, storageKey]);

    useEffect(
      () => () => {
        persistDraft(draftRef.current.key, draftRef.current.value);
        if (typingStopTimerRef.current) {
          clearTimeout(typingStopTimerRef.current);
        }
        if (lastTypingSentAtRef.current > 0) onTypingChange?.(false);
      },
      [onTypingChange],
    );

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (disabled || isSending || (!draft.trim() && attachments.length === 0))
        return;

      const previousDraft = draft;
      const previousAttachments = attachments;
      const content = draft.trim() || "添付ファイル";
      const attachmentIds = previousAttachments.map(({ id }) => id);
      const attempt = getMessageSendAttempt(sendAttempt.current, {
        attachmentIds,
        content,
        conversationId: storageKey ?? "",
        replyToId,
      });
      sendAttempt.current = attempt;
      updateDraft("");
      setAttachments([]);
      persistDraft(storageKey, "");
      setIsSending(true);

      try {
        await onSubmit({
          attachmentIds,
          clientId: attempt.clientId,
          content,
        });
        sendAttempt.current = undefined;
      } catch (error) {
        setDraft((current) => {
          if (current) return current;
          draftRef.current = { key: storageKey, value: previousDraft };
          return previousDraft;
        });
        setAttachments((current) =>
          current.length > 0 ? current : previousAttachments,
        );
        persistDraft(storageKey, previousDraft);
        onError(error instanceof Error ? error.message : "送信に失敗しました");
      } finally {
        setIsSending(false);
      }
    };

    return (
      <form
        data-chat-composer
        onSubmit={(event) => void submit(event)}
        className={`border-connect-ink/15 bg-connect-paper flex flex-col border ${joinedToReply ? "rounded-b-md" : "rounded-md"}`}
      >
        <PendingAttachmentList
          attachments={attachments}
          disabled={isSending}
          onChange={setAttachments}
        />
        <div className="flex min-w-0 items-end gap-1 px-2 py-1.5">
          <MessageAttachmentPicker
            attachments={attachments}
            disabled={disabled || isSending}
            onChange={setAttachments}
            onError={onError}
          />
          <textarea
            ref={textareaRef}
            data-chat-input
            aria-describedby={inputHintId}
            value={draft}
            onChange={(event) => updateDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className="text-connect-ink placeholder:text-connect-placeholder max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2 leading-6 outline-none focus:outline-none focus-visible:outline-none"
            placeholder={placeholder}
            disabled={disabled}
            maxLength={1000}
          />
          <EmojiPickerButton
            disabled={disabled || isSending}
            onChange={updateDraft}
            textareaRef={textareaRef}
            value={draft}
          />
          <button
            type="submit"
            disabled={
              disabled ||
              isSending ||
              (!draft.trim() && attachments.length === 0)
            }
            className="bg-connect-ink text-connect-paper focus-visible:outline-connect-action enabled:hover:bg-connect-ink-2 flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 enabled:active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="送信"
          >
            <Send className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p id={inputHintId} className="text-connect-muted px-3 pb-2 text-xs">
          Enterで送信 · Shift+Enterで改行
        </p>
      </form>
    );
  },
);
