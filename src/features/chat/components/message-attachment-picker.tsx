"use client";

import {
  AlertCircle,
  CirclePlus,
  FileText,
  ImageIcon,
  Link as LinkIcon,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { cn } from "~/lib/utils";

const MAX_ATTACHMENTS = 4;

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
  children: ReactNode;
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
  if (kind === "IMAGE") return <ImageIcon aria-hidden className="size-5" />;
  if (kind === "LINK") return <LinkIcon aria-hidden className="size-5" />;
  return <FileText aria-hidden className="size-5" />;
}

export function MessageAttachmentPicker({
  attachments,
  children,
  disabled = false,
  onChange,
  onError,
}: MessageAttachmentPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const helperId = useId();
  const urlInputId = useId();
  const [error, setError] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);
  const [isUrlInvalid, setIsUrlInvalid] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const atLimit = attachments.length >= MAX_ATTACHMENTS;
  const controlsDisabled = disabled || isUploading || atLimit;

  const reportError = (message: string, urlInvalid = false) => {
    setError(message);
    setIsUrlInvalid(urlInvalid);
    onError(message);
  };

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0 || disabled || isUploading) return;

    const availableSlots = MAX_ATTACHMENTS - attachments.length;
    if (files.length > availableSlots) {
      reportError(
        `添付は最大${MAX_ATTACHMENTS}件です。選択するファイルを減らしてください。`,
      );
      return;
    }

    setError(undefined);
    setIsUrlInvalid(false);
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
          reportError(
            uploadError instanceof Error
              ? uploadError.message
              : `${file.name}を添付できませんでした。もう一度お試しください。`,
          );
        }
      }
      if (uploaded.length > 0) onChange([...attachments, ...uploaded]);
    } finally {
      setIsUploading(false);
    }
  };

  const addUrl = async () => {
    if (disabled || isUploading || atLimit) return;
    const value = urlDraft.trim();
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      reportError("有効なHTTPS URLを入力してください。", true);
      return;
    }
    if (url.protocol !== "https:") {
      reportError("URLカードにはHTTPS URLを入力してください。", true);
      return;
    }

    setError(undefined);
    setIsUrlInvalid(false);
    setIsUploading(true);
    try {
      const response = await fetch("/api/attachments", {
        body: JSON.stringify({ url: url.href }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const attachment = await getUploadedAttachment(
        response,
        "URLカードを追加できませんでした。URLを確認して、もう一度お試しください。",
      );
      onChange([...attachments, attachment]);
      setUrlDraft("");
      urlInputRef.current?.form
        ?.querySelector<HTMLTextAreaElement>("textarea[data-chat-input]")
        ?.focus();
      setShowUrlInput(false);
    } catch (uploadError) {
      reportError(
        uploadError instanceof Error
          ? uploadError.message
          : "URLカードを追加できませんでした。もう一度お試しください。",
        true,
      );
    } finally {
      setIsUploading(false);
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setError(undefined);
    setIsUrlInvalid(false);
    onChange(
      attachments.filter((attachment) => attachment.id !== attachmentId),
    );
  };

  return (
    <section
      aria-busy={isUploading}
      aria-label="メッセージの添付"
      className="text-connect-ink grid min-w-0 gap-2"
    >
      {attachments.length > 0 && (
        <ul aria-label="選択済みの添付" className="grid gap-2 pt-1">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="border-connect-ink/15 bg-connect-surface flex min-w-0 items-center rounded-md border ps-3"
            >
              <span className="text-connect-action shrink-0">
                <AttachmentIcon kind={attachment.kind} />
              </span>
              <span className="min-w-0 flex-1 px-3 py-2">
                <span
                  className="block truncate text-sm font-semibold"
                  title={attachment.fileName}
                >
                  {attachment.fileName}
                </span>
                <span className="text-connect-muted block text-sm tabular-nums">
                  {getAttachmentMeta(attachment)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`${attachment.fileName}を削除`}
                className="focus-visible:outline-connect-action enabled:hover:bg-connect-danger-soft enabled:hover:text-connect-danger enabled:active:bg-connect-danger-hover flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled || isUploading}
                onClick={() => removeAttachment(attachment.id)}
              >
                <X aria-hidden className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showUrlInput && (
        <div className="border-connect-ink/15 bg-connect-surface grid min-w-0 gap-2 rounded-md border p-2">
          <label className="text-sm font-semibold" htmlFor={urlInputId}>
            HTTPS URL
          </label>
          <div className="flex min-w-0 gap-2">
            <input
              id={urlInputId}
              ref={urlInputRef}
              autoFocus
              aria-describedby={helperId}
              aria-invalid={isUrlInvalid}
              className={cn(
                "border-connect-ink/50 bg-connect-paper placeholder:text-connect-muted min-h-11 min-w-0 flex-1 rounded-md border px-3 text-base disabled:cursor-not-allowed disabled:opacity-50",
                isUrlInvalid && "border-connect-danger",
              )}
              disabled={controlsDisabled}
              inputMode="url"
              onChange={(event) => {
                setUrlDraft(event.target.value);
                if (isUrlInvalid) {
                  setError(undefined);
                  setIsUrlInvalid(false);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addUrl();
                } else if (event.key === "Escape") {
                  setShowUrlInput(false);
                  triggerRef.current?.focus();
                }
              }}
              placeholder="https://example.com"
              type="url"
              value={urlDraft}
            />
            <button
              type="button"
              className="bg-connect-action text-connect-surface focus-visible:outline-connect-action enabled:hover:bg-connect-action-hover min-h-11 shrink-0 rounded-md px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={controlsDisabled || urlDraft.trim().length === 0}
              onClick={() => void addUrl()}
            >
              URLを追加
            </button>
            <button
              type="button"
              aria-label="URL入力を閉じる"
              className="focus-visible:outline-connect-action hover:bg-connect-highlight flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => {
                setShowUrlInput(false);
                triggerRef.current?.focus();
              }}
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 items-end gap-2">
        <input
          ref={fileInputRef}
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
          aria-label="ファイルを追加"
          className="hidden"
          disabled={controlsDisabled}
          multiple
          onChange={(event) => void uploadFiles(event)}
          type="file"
        />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              ref={triggerRef}
              type="button"
              aria-label="添付を追加"
              aria-describedby={helperId}
              title="添付を追加"
              className="text-connect-muted focus-visible:outline-connect-action enabled:hover:bg-connect-highlight enabled:hover:text-connect-ink flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={controlsDisabled}
            >
              {isUploading ? (
                <LoaderCircle
                  aria-hidden
                  className="size-6 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <CirclePlus aria-hidden className="size-6" />
              )}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              side="top"
              sideOffset={8}
              onCloseAutoFocus={(event) => {
                if (showUrlInput) {
                  event.preventDefault();
                  urlInputRef.current?.focus();
                }
              }}
              className="border-connect-ink/15 bg-connect-surface text-connect-ink z-[var(--z-dropdown)] w-60 max-w-[calc(100vw-2rem)] rounded-md border p-1 shadow-md"
            >
              <DropdownMenu.Item
                className="data-highlighted:bg-connect-highlight flex min-h-11 cursor-pointer items-center gap-2 rounded px-3 text-sm outline-none"
                onSelect={() => fileInputRef.current?.click()}
              >
                <Upload aria-hidden className="size-5" />
                ファイルをアップロード
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="data-highlighted:bg-connect-highlight flex min-h-11 cursor-pointer items-center gap-2 rounded px-3 text-sm outline-none"
                onSelect={() => setShowUrlInput(true)}
              >
                <LinkIcon aria-hidden className="size-5" />
                URLカードを追加
              </DropdownMenu.Item>
              <p className="text-connect-muted px-3 py-2 text-xs">
                画像・PDF、HTTPS URLを最大4件まで
              </p>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {children}
      </div>

      <p
        id={helperId}
        className={cn(
          "text-connect-muted flex items-start gap-2 text-sm",
          error && "text-connect-danger",
          !error && !isUploading && !atLimit && "sr-only",
        )}
        role={error ? "alert" : "status"}
      >
        {error ? (
          <>
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </>
        ) : isUploading ? (
          "アップロード中…"
        ) : atLimit ? (
          `添付は最大${MAX_ATTACHMENTS}件です。削除すると別の添付を追加できます。`
        ) : (
          `添付${attachments.length}件。画像・PDF、またはHTTPS URLを最大4件まで追加できます。`
        )}
      </p>
    </section>
  );
}
