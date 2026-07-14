"use client";

import { Camera, Save, UserRound } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";

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
      <div className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-6 text-sm text-[#68716b]">
        読み込み中...
      </div>
    );
  }

  if (profile.error) {
    return (
      <div className="rounded-md border border-[#cc5f2f]/25 bg-[#fff1e8] p-6 text-sm text-[#9f4122]">
        {profile.error.message}
      </div>
    );
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        className="rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-5 shadow-[8px_8px_0_#d8efee]"
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
            <span className="mb-2 block text-sm font-semibold text-[#53615a]">
              アイコン
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#18221f]/20 bg-white px-4 py-2 text-sm font-semibold text-[#18221f] transition hover:border-[#18221f]/45">
                <Camera className="h-4 w-4 text-[#cc5f2f]" aria-hidden="true" />
                {isUploading ? "アップロード中..." : "画像を選択"}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={isUploading}
                  onChange={uploadIcon}
                />
              </label>
              <span className="text-sm text-[#68716b]">PNG / JPG、5MBまで</span>
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#53615a]">
              名前
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[#18221f]/20 bg-white px-4 py-2 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
              placeholder="表示名"
              required
              maxLength={50}
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-[#53615a]">
              <span>ステータス</span>
              <span className="font-normal text-[#68716b]">
                {statusMessage.length}/80
              </span>
            </span>
            <input
              value={statusMessage}
              onChange={(event) => setStatusMessage(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[#18221f]/20 bg-white px-4 py-2 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
              placeholder="いまの気分や作業状況"
              maxLength={80}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#53615a]">
              オンライン状態
            </span>
            <select
              value={presenceStatus}
              onChange={(event) =>
                setPresenceStatus(event.target.value as PresenceStatus)
              }
              className="min-h-11 w-full rounded-md border border-[#18221f]/20 bg-white px-4 py-2 text-[#18221f] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
            >
              {presenceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-[#53615a]">
              <span>自己紹介</span>
              <span className="font-normal text-[#68716b]">
                {bio.length}/160
              </span>
            </span>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="min-h-32 w-full resize-y rounded-md border border-[#18221f]/20 bg-white px-4 py-3 leading-7 text-[#18221f] placeholder:text-[#9aa49e] focus:border-[#114744] focus:ring-2 focus:ring-[#d8efee] focus:outline-none"
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
                ? "border-sky-200 bg-sky-50 text-sky-900"
                : "border-[#cc5f2f]/25 bg-[#fff1e8] text-[#9f4122]"
            }`}
          >
            {message}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {updateProfile.isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </form>

      <aside className="rounded-md border border-[#18221f]/15 bg-[#f1e4d0] p-5">
        <h2 className="mb-4 text-base font-semibold">プレビュー</h2>
        <div className="rounded-md border border-[#18221f]/10 bg-[#fff8ed] p-4">
          <div className="flex items-center gap-3">
            {image && !imageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="h-16 w-16 rounded-md border border-[#18221f]/15 object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-md bg-[#18221f] text-xl font-semibold text-[#f6f0e4]">
                {initial}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">
                {name.trim() || "名前未設定"}
              </p>
              <p className="font-mono text-sm text-[#68716b]">
                @{profile.data?.userId}
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#68716b]">
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
            <p className="mt-3 rounded-md border border-[#18221f]/10 bg-white px-3 py-2 text-sm text-[#53615a]">
              {statusMessage.trim()}
            </p>
          )}
          <div className="mt-4 rounded-md border border-[#18221f]/10 bg-white p-3 text-sm leading-6 text-[#53615a]">
            {bio.trim() || (
              <span className="inline-flex items-center gap-2 text-[#68716b]">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                自己紹介は未設定です
              </span>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}
