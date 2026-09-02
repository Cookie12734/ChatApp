"use client";

import { Camera, Save, UserRound } from "lucide-react";
import {
  type ChangeEvent,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  deleteAccount,
  type DeleteAccountState,
} from "~/features/auth/actions";
import {
  getPresenceDisplayLabel,
  getPresenceDotClassName,
  presenceOptions,
  type PresenceStatus,
} from "~/features/profile/presence";
import { api } from "~/trpc/react";

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "プロフィールの更新に失敗しました";
}

export function ProfileForm() {
  const utils = api.useUtils();
  const profile = api.profile.getMine.useQuery();
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [bio, setBio] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [presenceStatus, setPresenceStatus] =
    useState<PresenceStatus>("ONLINE");
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteState, deleteAction, isDeleting] = useActionState<
    DeleteAccountState,
    FormData
  >(deleteAccount, {});

  useEffect(() => {
    if (!profile.data) return;

    setName(profile.data.name ?? "");
    setImage(profile.data.image ?? "");
    setImageFailed(false);
    setBio(profile.data.bio ?? "");
    setStatusMessage(profile.data.statusMessage ?? "");
    setPresenceStatus(profile.data.presenceStatus);
  }, [profile.data]);

  const initial = useMemo(() => {
    const trimmedName = name.trim();
    const initialSource =
      trimmedName.length > 0 ? trimmedName : (profile.data?.userId ?? "Y");

    return initialSource.slice(0, 1).toUpperCase();
  }, [name, profile.data?.userId]);

  const updateProfile = api.profile.updateMine.useMutation({
    onSuccess: async () => {
      setMessage("プロフィールを保存しました");
      await Promise.all([
        utils.profile.getByUserId.invalidate(),
        utils.profile.getMine.invalidate(),
        utils.server.getOverview.invalidate(),
      ]);
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const uploadIcon = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("icon", file);

    setIsUploading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/profile/icon", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        image?: string;
        message?: string;
      };

      if (!response.ok || !result.image) {
        throw new Error(
          result.message ?? "アイコンのアップロードに失敗しました",
        );
      }

      setImage(result.image);
      setImageFailed(false);
      setMessage("アイコンをアップロードしました");
      await Promise.all([
        utils.profile.getByUserId.invalidate(),
        utils.profile.getMine.invalidate(),
        utils.server.getOverview.invalidate(),
      ]);
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  if (profile.isLoading) {
    return (
      <div className="border-connect-ink/15 bg-connect-surface text-connect-neutral rounded-md border p-6 text-sm">
        読み込み中...
      </div>
    );
  }

  if (profile.error) {
    return (
      <div className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger rounded-md border p-6 text-sm">
        {profile.error.message}
      </div>
    );
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        className="border-connect-ink/15 bg-connect-surface rounded-md border p-5 shadow-[8px_8px_0_var(--color-focus-on-dark)]"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          updateProfile.mutate({
            bio,
            name,
            presenceStatus,
            statusMessage,
          });
        }}
      >
        <div className="space-y-5">
          <label className="block">
            <span className="text-connect-muted mb-2 block text-sm font-semibold">
              アイコン
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="border-connect-ink/20 bg-connect-surface text-connect-ink hover:border-connect-ink/45 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition">
                <Camera
                  className="text-connect-signal h-4 w-4"
                  aria-hidden="true"
                />
                {isUploading ? "アップロード中..." : "画像を選択"}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={isUploading}
                  onChange={uploadIcon}
                />
              </label>
              <span className="text-connect-neutral text-sm">
                PNG / JPG、256KBまで
              </span>
            </div>
          </label>

          <label className="block">
            <span className="text-connect-muted mb-2 block text-sm font-semibold">
              名前
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="border-connect-ink/20 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder focus:border-connect-ink/35 focus:ring-connect-ink/10 min-h-11 w-full rounded-md border px-4 py-2 focus:ring-2 focus:outline-none"
              placeholder="表示名"
              required
              maxLength={50}
            />
          </label>

          <label className="block">
            <span className="text-connect-muted mb-2 flex items-center justify-between gap-3 text-sm font-semibold">
              <span>ステータス</span>
              <span className="text-connect-neutral font-normal">
                {statusMessage.length}/80
              </span>
            </span>
            <input
              value={statusMessage}
              onChange={(event) => setStatusMessage(event.target.value)}
              className="border-connect-ink/20 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder focus:border-connect-ink/35 focus:ring-connect-ink/10 min-h-11 w-full rounded-md border px-4 py-2 focus:ring-2 focus:outline-none"
              placeholder="いまの気分や作業状況"
              maxLength={80}
            />
          </label>

          <label className="block">
            <span className="text-connect-muted mb-2 block text-sm font-semibold">
              オンライン状態
            </span>
            <select
              value={presenceStatus}
              onChange={(event) =>
                setPresenceStatus(event.target.value as PresenceStatus)
              }
              className="border-connect-ink/20 bg-connect-surface text-connect-ink focus:border-connect-ink/35 focus:ring-connect-ink/10 min-h-11 w-full rounded-md border px-4 py-2 focus:ring-2 focus:outline-none"
            >
              {presenceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-connect-muted mb-2 flex items-center justify-between gap-3 text-sm font-semibold">
              <span>自己紹介</span>
              <span className="text-connect-neutral font-normal">
                {bio.length}/160
              </span>
            </span>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="border-connect-ink/20 bg-connect-surface text-connect-ink placeholder:text-connect-placeholder focus:border-connect-ink/35 focus:ring-connect-ink/10 min-h-32 w-full resize-y rounded-md border px-4 py-3 leading-7 focus:ring-2 focus:outline-none"
              placeholder="好きなことや今話したいことを書いてください"
              maxLength={160}
            />
          </label>
        </div>

        {message && (
          <p
            className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              message.includes("保存しました") ||
              message.includes("アップロードしました")
                ? "border-connect-action/20 bg-connect-success-soft text-connect-action"
                : "border-connect-signal/25 bg-connect-danger-soft text-connect-danger"
            }`}
          >
            {message}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="bg-connect-action text-connect-surface hover:bg-connect-action-hover inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold transition disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {updateProfile.isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </form>

      <aside className="border-connect-ink/15 bg-connect-navigation rounded-md border p-5">
        <h2 className="mb-4 text-base font-semibold">プレビュー</h2>
        <div className="border-connect-ink/10 bg-connect-surface rounded-md border p-4">
          <div className="flex items-center gap-3">
            {image && !imageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="border-connect-ink/15 h-16 w-16 rounded-md border object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <span className="bg-connect-ink text-connect-paper flex h-16 w-16 items-center justify-center rounded-md text-xl font-semibold">
                {initial}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">
                {name.trim() || "名前未設定"}
              </p>
              <p className="text-connect-neutral font-mono text-sm">
                @{profile.data?.userId}
              </p>
              <p className="text-connect-neutral mt-1 inline-flex items-center gap-1.5 text-sm">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${getPresenceDotClassName(
                    presenceStatus,
                  )}`}
                />
                {getPresenceDisplayLabel(presenceStatus)}
              </p>
            </div>
          </div>
          {statusMessage.trim() && (
            <p className="border-connect-ink/10 bg-connect-surface text-connect-muted mt-3 rounded-md border px-3 py-2 text-sm">
              {statusMessage.trim()}
            </p>
          )}
          <div className="border-connect-ink/10 bg-connect-surface text-connect-muted mt-4 rounded-md border p-3 text-sm leading-6">
            {bio.trim() || (
              <span className="text-connect-neutral inline-flex items-center gap-2">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                自己紹介は未設定です
              </span>
            )}
          </div>
        </div>
      </aside>

      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (deleteConfirmation.trim() !== profile.data?.userId) {
            event.preventDefault();
            return;
          }
          if (
            !window.confirm(
              "アカウントを完全に削除しますか？この操作は取り消せません。",
            )
          ) {
            event.preventDefault();
          }
        }}
        className="border-connect-signal/35 bg-connect-danger-soft rounded-md border p-5 lg:col-span-2"
      >
        <h2 className="text-connect-danger text-lg font-semibold">
          アカウント削除
        </h2>
        <p className="text-connect-danger-strong mt-2 text-sm leading-6">
          この操作は取り消せません。所有中のサーバーがある場合は削除できないため、先に所有権を移譲するかサーバーを削除してください。
        </p>
        <label className="mt-4 block">
          <span className="text-connect-danger-strong mb-2 block text-sm font-semibold">
            確認のため現在のユーザーID「{profile.data?.userId}」を入力
          </span>
          <input
            name="userId"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            autoComplete="off"
            required
            className="border-connect-signal/35 bg-connect-surface text-connect-ink focus:border-connect-danger focus:ring-connect-danger-hover min-h-11 w-full rounded-md border px-4 py-2 focus:ring-2 focus:outline-none"
          />
        </label>
        {deleteState.error && (
          <p
            className="border-connect-signal/35 bg-connect-surface text-connect-danger mt-3 rounded-md border px-3 py-2 text-sm"
            role="alert"
          >
            {deleteState.error}
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={
              isDeleting || deleteConfirmation.trim() !== profile.data?.userId
            }
            className="bg-connect-danger text-connect-surface hover:bg-connect-danger-strong inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? "削除中..." : "アカウントを削除"}
          </button>
        </div>
      </form>
    </section>
  );
}
