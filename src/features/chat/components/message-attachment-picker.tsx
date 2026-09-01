/* Hallmark · pre-emit critique: P5 H4 E5 S5 R5 V4 */
/* Hallmark · component: chat composer actions · genre: modern-minimal · theme: connect locked system
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (40–41) · mobile: pass (320 / 375 / 414 / 768)
 */
"use client";

import {
  FileText,
  ImageIcon,
  Link as LinkIcon,
  LoaderCircle,
  Plus,
  Smile,
  X,
} from "lucide-react";
import { useId, useState, type ChangeEvent, type RefObject } from "react";
import { Popover } from "radix-ui";

import { cn } from "~/lib/utils";

const MAX_ATTACHMENTS = 4;
const COMPOSER_EMOJIS = [
  "😀",
  "😂",
  "😍",
  "👍",
  "🎉",
  "🙏",
  "🔥",
  "❤️",
  "😮",
  "😢",
  "🤔",
  "✅",
] as const;

export type PendingAttachment = {
  fileName: string;
  id: string;
  kind: "IMAGE" | "LINK" | "PDF";
  mimeType: string;
  size: number;
  url: string;
};

export type MessageAttachmentPickerProps = {
  attachments: PendingAttachment[];
  disabled?: boolean;
  onChange: (attachments: PendingAttachment[]) => void;
  onError: (message: string) => void;
};

type AttachmentResponse = {
  attachment?: PendingAttachment;
  message?: string;
};

async function getUploadedAttachment(response: Response, fallback: string) {
  const result = (await response.json().catch(() => undefined)) as
    | AttachmentResponse
    | undefined;
  if (!response.ok || !result?.attachment) {
    throw new Error(result?.message ?? fallback);
  }
  return result.attachment;
}

function getAttachmentMeta(attachment: PendingAttachment) {
  if (attachment.kind === "LINK") return "URLカード";
  const size = Math.max(1, Math.ceil(attachment.size / 1024));
  return `${attachment.kind === "IMAGE" ? "画像" : "PDF"} · ${size.toLocaleString("ja-JP")} KB`;
}

function AttachmentIcon({ kind }: { kind: PendingAttachment["kind"] }) {
  if (kind === "IMAGE") return <ImageIcon aria-hidden className="size-4" />;
  if (kind === "LINK") return <LinkIcon aria-hidden className="size-4" />;
  return <FileText aria-hidden className="size-4" />;
}

export function MessageAttachmentPicker({
  attachments,
  disabled = false,
  onChange,
  onError,
}: MessageAttachmentPickerProps) {
  const fileInputId = useId();
  const statusId = useId();
  const [error, setError] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);
  const atLimit = attachments.length >= MAX_ATTACHMENTS;
  const controlsDisabled = disabled || isUploading || atLimit;

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0 || disabled || isUploading) return;

    const availableSlots = MAX_ATTACHMENTS - attachments.length;
    if (files.length > availableSlots) {
      const message = `添付は最大${MAX_ATTACHMENTS}件です。選択するファイルを減らしてください。`;
      setError(message);
      onError(message);
      return;
    }

    setError(undefined);
    setIsUploading(true);
    const uploaded: PendingAttachment[] = [];
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        try {
          const response = await fetch("/api/attachments", {
            body: formData,
            method: "POST",
          });
          uploaded.push(
            await getUploadedAttachment(
              response,
              `${file.name}を添付できませんでした。画像またはPDFを選択してください。`,
            ),
          );
        } catch (uploadError) {
          const message =
            uploadError instanceof Error
              ? uploadError.message
              : `${file.name}を添付できませんでした。もう一度お試しください。`;
          setError(message);
          onError(message);
        }
      }
      if (uploaded.length > 0) onChange([...attachments, ...uploaded]);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <label
      aria-disabled={controlsDisabled}
      aria-label="ファイルを追加"
      className={cn(
        "text-connect-muted has-[:focus-visible]:outline-connect-action relative flex size-11 shrink-0 items-center justify-center rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
        controlsDisabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-connect-highlight hover:text-connect-ink active:bg-connect-navigation",
      )}
      htmlFor={fileInputId}
      title={atLimit ? `添付は最大${MAX_ATTACHMENTS}件です` : "ファイルを追加"}
    >
      {isUploading ? (
        <LoaderCircle aria-hidden className="size-5 animate-spin" />
      ) : (
        <Plus aria-hidden className="size-6" />
      )}
      {attachments.length > 0 && !isUploading && (
        <span className="bg-connect-action text-connect-surface absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold tabular-nums">
          {attachments.length}
        </span>
      )}
      <input
        id={fileInputId}
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
        aria-describedby={statusId}
        aria-label="ファイルを追加"
        className="sr-only"
        disabled={controlsDisabled}
        multiple
        onChange={(event) => void uploadFiles(event)}
        type="file"
      />
      <span id={statusId} aria-live="polite" className="sr-only" role="status">
        {error ??
          (isUploading
            ? "ファイルをアップロード中です。"
            : `${attachments.length}件のファイルを添付しています。`)}
      </span>
    </label>
  );
}

export function PendingAttachmentList({
  attachments,
  disabled = false,
  onChange,
}: {
  attachments: PendingAttachment[];
  disabled?: boolean;
  onChange: (attachments: PendingAttachment[]) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <ul
      aria-label="選択済みの添付"
      className="border-connect-ink/10 flex min-w-0 flex-wrap gap-2 border-b px-2 py-2"
    >
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className="border-connect-ink/15 bg-connect-surface flex max-w-full min-w-0 items-center rounded-md border ps-2"
        >
          <span className="text-connect-action shrink-0">
            <AttachmentIcon kind={attachment.kind} />
          </span>
          <span className="min-w-0 px-2 py-1.5">
            <span
              className="block max-w-48 truncate text-xs font-semibold"
              title={attachment.fileName}
            >
              {attachment.fileName}
            </span>
            <span className="text-connect-muted block text-[11px] tabular-nums">
              {getAttachmentMeta(attachment)}
            </span>
          </span>
          <button
            type="button"
            aria-label={`${attachment.fileName}を削除`}
            className="focus-visible:outline-connect-action enabled:hover:bg-connect-danger-soft enabled:hover:text-connect-danger enabled:active:bg-connect-danger-hover flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onClick={() =>
              onChange(attachments.filter(({ id }) => id !== attachment.id))
            }
          >
            <X aria-hidden className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function EmojiPickerButton({
  disabled = false,
  maxLength = 1000,
  onChange,
  textareaRef,
  value,
}: {
  disabled?: boolean;
  maxLength?: number;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? start;
    const nextValue = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    if (nextValue.length > maxLength) return;

    onChange(nextValue);
    setIsOpen(false);
    requestAnimationFrame(() => {
      const caretPosition = start + emoji.length;
      textarea?.focus();
      textarea?.setSelectionRange(caretPosition, caretPosition);
    });
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="絵文字を入力"
          className="text-connect-muted focus-visible:outline-connect-action enabled:hover:bg-connect-highlight enabled:hover:text-connect-ink enabled:active:bg-connect-navigation flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          title="絵文字を入力"
        >
          <Smile aria-hidden className="size-5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          aria-label="絵文字を選択"
          className="border-connect-ink/15 bg-connect-surface text-connect-ink z-50 grid grid-cols-4 gap-1 rounded-md border p-2 shadow-xl outline-none"
          side="top"
          sideOffset={8}
        >
          {COMPOSER_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`${emoji}を入力`}
              className="focus-visible:outline-connect-action hover:bg-connect-highlight active:bg-connect-navigation flex size-11 items-center justify-center rounded-md text-xl focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => insertEmoji(emoji)}
            >
              {emoji}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
