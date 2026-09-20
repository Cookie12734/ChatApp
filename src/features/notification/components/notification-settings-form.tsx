"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api, type RouterInputs } from "~/trpc/react";

type SettingsUpdate = RouterInputs["notification"]["updateSettings"];

function urlBase64ToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob(
    (value + padding).replaceAll("-", "+").replaceAll("_", "/"),
  );
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function NotificationSettingsForm() {
  const [subscribed, setSubscribed] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [message, setMessage] = useState<string>();
  const utils = api.useUtils();
  const settings = api.notification.getSettings.useQuery();
  const updateSettings = api.notification.updateSettings.useMutation({
    onSuccess: async () => utils.notification.getSettings.invalidate(),
  });
  const subscribePush = api.notification.subscribePush.useMutation();
  const unsubscribePush = api.notification.unsubscribePush.useMutation();
  const pushSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (!pushSupported) return;
    let cancelled = false;
    setCheckingSubscription(true);
    setSubscribed(false);
    void navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((registration) => registration?.pushManager.getSubscription())
      .then(async (subscription) =>
        subscription
          ? (
              await utils.notification.getPushSubscription.fetch(
                { endpoint: subscription.endpoint },
                { staleTime: 0 },
              )
            ).subscribed
          : false,
      )
      .then((active) => {
        if (!cancelled) setSubscribed(active);
      })
      .catch(() => {
        if (!cancelled) setMessage("プッシュ通知の状態を確認できませんでした");
      })
      .finally(() => {
        if (!cancelled) setCheckingSubscription(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pushSupported, utils.notification.getPushSubscription]);

  const save = (input: SettingsUpdate) => {
    setMessage(undefined);
    updateSettings.mutate(input, {
      onError: () => setMessage("通知設定を保存できませんでした"),
    });
  };

  const enablePush = async () => {
    const publicKey = settings.data?.vapidPublicKey;
    if (!pushSupported || !publicKey) return;
    setMessage(undefined);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("ブラウザで通知が許可されていません");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          applicationServerKey: urlBase64ToBytes(publicKey),
          userVisibleOnly: true,
        }));
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.auth || !json.keys.p256dh) {
        throw new Error("Push subscription is incomplete");
      }
      await subscribePush.mutateAsync({
        auth: json.keys.auth,
        endpoint: json.endpoint,
        expirationTime: json.expirationTime,
        p256dh: json.keys.p256dh,
      });
      setSubscribed(true);
      setMessage("この端末のプッシュ通知を有効にしました");
    } catch {
      setMessage("プッシュ通知を有効にできませんでした");
    }
  };

  const disablePush = async () => {
    setMessage(undefined);
    try {
      const registration =
        await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush.mutateAsync({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage("この端末のプッシュ通知を停止しました");
    } catch {
      setMessage("プッシュ通知を停止できませんでした");
    }
  };

  const categories: Array<{
    description: string;
    key: keyof Pick<
      SettingsUpdate,
      | "directMessages"
      | "friendRequests"
      | "groupMessages"
      | "matching"
      | "mentions"
    >;
    label: string;
  }> = [
    { description: "1対1の新着メッセージ", key: "directMessages", label: "DM" },
    {
      description: "プライベートグループの新着",
      key: "groupMessages",
      label: "グループDM",
    },
    {
      description: "サーバー内で自分が呼ばれた時",
      key: "mentions",
      label: "メンション",
    },
    {
      description: "申請を受け取った時",
      key: "friendRequests",
      label: "フレンド申請",
    },
    {
      description: "新しい相手とつながった時",
      key: "matching",
      label: "マッチング",
    },
  ];

  return (
    <div className="space-y-6 p-5">
      <section aria-labelledby="push-device-heading">
        <h3 id="push-device-heading" className="text-sm font-bold">
          この端末
        </h3>
        <p className="text-connect-muted mt-1 text-sm">
          メッセージ本文は初期設定ではロック画面に表示しません。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void (subscribed ? disablePush() : enablePush())}
            disabled={
              settings.isLoading ||
              checkingSubscription ||
              subscribePush.isPending ||
              unsubscribePush.isPending ||
              !pushSupported ||
              !settings.data?.pushConfigured
            }
            className="bg-connect-action text-connect-surface hover:bg-connect-action-hover inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {(subscribePush.isPending || unsubscribePush.isPending) && (
              <LoaderCircle
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {subscribed ? "プッシュ通知を停止" : "プッシュ通知を有効化"}
          </button>
          {!pushSupported && (
            <span className="text-connect-muted text-sm">
              このブラウザは未対応です
            </span>
          )}
          {pushSupported && settings.data && !settings.data.pushConfigured && (
            <span className="text-connect-muted text-sm">
              サーバー側の通知鍵が未設定です
            </span>
          )}
        </div>
      </section>

      <section
        className="border-connect-ink/15 border-t pt-5"
        aria-labelledby="notification-target-heading"
      >
        <h3 id="notification-target-heading" className="text-sm font-bold">
          通知対象
        </h3>
        <div className="divide-connect-ink/10 mt-2 divide-y">
          {categories.map((category) => (
            <label
              key={category.key}
              className="flex min-h-14 items-center justify-between gap-4 py-2"
            >
              <span>
                <span className="block text-sm font-semibold">
                  {category.label}
                </span>
                <span className="text-connect-muted block text-xs">
                  {category.description}
                </span>
              </span>
              <input
                type="checkbox"
                className="accent-connect-action h-5 w-5"
                checked={Boolean(settings.data?.[category.key])}
                disabled={!settings.data || updateSettings.isPending}
                onChange={(event) =>
                  save({ [category.key]: event.target.checked })
                }
              />
            </label>
          ))}
        </div>
      </section>

      <label className="border-connect-ink/15 flex min-h-14 items-center justify-between gap-4 border-t pt-5">
        <span>
          <span className="block text-sm font-semibold">本文プレビュー</span>
          <span className="text-connect-muted block text-xs">
            端末の通知にメッセージ本文を表示します
          </span>
        </span>
        <input
          type="checkbox"
          className="accent-connect-action h-5 w-5"
          checked={Boolean(settings.data?.showMessagePreview)}
          disabled={!settings.data || updateSettings.isPending}
          onChange={(event) =>
            save({ showMessagePreview: event.target.checked })
          }
        />
      </label>
      {message && (
        <p className="text-connect-muted text-sm" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
