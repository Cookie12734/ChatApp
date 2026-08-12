"use client";

import {
  Bell,
  Ellipsis,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";

import { ProfileSettingsDialog } from "~/features/profile/components/profile-settings-dialog";
import { NotificationSettingsDialog } from "~/features/notification/components/notification-settings-dialog";
import { type RouterOutputs, api } from "~/trpc/react";

type ServerMembership =
  RouterOutputs["server"]["getOverview"]["memberships"][number];

type ServerRailProps = {
  memberships?: ServerMembership[];
  onSelectHome?: () => void;
  onSearch?: () => void;
  onSelectServer?: (membership: ServerMembership) => void;
  selectedServerId?: string | null;
};

export function ServerRail({
  memberships,
  onSelectHome,
  onSearch,
  onSelectServer,
  selectedServerId,
}: ServerRailProps) {
  const overview = api.server.getOverview.useQuery(undefined, {
    enabled: memberships === undefined,
    refetchInterval: (query) =>
      query.state.status === "error"
        ? false
        : memberships === undefined
          ? 15000
          : false,
  });
  const items = memberships ?? overview.data?.memberships ?? [];
  const unsubscribePush = api.notification.unsubscribePush.useMutation();
  const handleSignOut = async () => {
    try {
      const registration =
        await navigator.serviceWorker?.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        try {
          await subscription.unsubscribe();
        } catch {
          // Still remove the server record when browser cleanup fails.
        }
        try {
          await unsubscribePush.mutateAsync({ endpoint });
        } catch {
          // Server cleanup is best effort; signing out must still complete.
        }
      }
    } finally {
      await signOut({ redirectTo: "/auth/login" });
    }
  };
  return (
    <header
      className="border-connect-paper/15 bg-connect-ink text-connect-paper col-span-full row-start-1 flex h-16 min-w-0 items-center gap-2 border-b px-2 [--connect-focus:var(--color-focus-on-dark)] sm:px-3"
      aria-label="メインナビゲーション"
    >
      <div className="flex shrink-0 items-center">
        <Link
          href="/"
          onClick={onSelectHome}
          className={`hover:bg-connect-ink-2 flex h-11 items-center gap-2 rounded-md px-2 transition-colors ${
            selectedServerId ? "" : "bg-connect-surface text-connect-ink"
          }`}
          aria-current={selectedServerId ? undefined : "page"}
          aria-label="connect ホーム"
        >
          <Image
            src="/connect-icon.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-md object-cover"
            priority
          />
          <span className="hidden text-sm font-bold tracking-tight sm:block">
            connect
          </span>
        </Link>
      </div>
      <div className="bg-connect-paper/20 h-7 w-px shrink-0" />
      <nav
        className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        aria-label="スペース"
      >
        {memberships === undefined && overview.isError && (
          <button
            type="button"
            onClick={() => void overview.refetch()}
            disabled={overview.isFetching}
            className="border-connect-focus-soft/30 bg-connect-ink-2 text-connect-focus-soft hover:bg-connect-focus-soft hover:text-connect-action flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 transition-colors disabled:opacity-50"
            aria-label="サーバー一覧を再読み込み"
            title="サーバー一覧を再読み込み"
          >
            <RefreshCw
              className={`h-5 w-5 ${overview.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span className="hidden whitespace-nowrap lg:inline">
              再読み込み
            </span>
          </button>
        )}
        {items.map((membership) => {
          const label = membership.server.name;
          const unreadCount = membership.server.channels.reduce(
            (total, channel) => total + channel.unreadCount,
            0,
          );
          const isSelected = membership.server.id === selectedServerId;
          const unreadLabel =
            unreadCount > 0 ? `${label}、未読${unreadCount}件` : label;
          const className = `flex h-11 max-w-44 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-semibold transition-colors ${
            isSelected
              ? "bg-connect-highlight text-connect-action"
              : "bg-connect-ink-2 text-connect-focus-soft hover:bg-connect-highlight hover:text-connect-action"
          }`;
          const content = (
            <>
              <span className="bg-connect-navigation text-connect-ink flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-bold">
                {membership.server.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={membership.server.image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  label.slice(0, 2).toUpperCase()
                )}
              </span>
              <span className="max-w-24 truncate whitespace-nowrap">
                {label}
              </span>
              {unreadCount > 0 && (
                <span className="bg-connect-danger text-connect-surface flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-bold">
                  {unreadCount}
                </span>
              )}
            </>
          );

          if (onSelectServer) {
            return (
              <button
                key={membership.id}
                type="button"
                onClick={() => onSelectServer(membership)}
                className={className}
                aria-current={isSelected ? "page" : undefined}
                aria-label={unreadLabel}
                title={unreadLabel}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={membership.id}
              href={`/?serverId=${encodeURIComponent(membership.server.id)}`}
              className={className}
              aria-current={isSelected ? "page" : undefined}
              aria-label={unreadLabel}
              title={unreadLabel}
            >
              {content}
            </Link>
          );
        })}
        <Link
          href="/servers/new"
          className="border-connect-focus-soft/30 text-connect-focus-soft hover:bg-connect-focus-soft hover:text-connect-action flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 transition-colors"
          aria-label="スペースを作成"
          title="スペースを作成"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          <span className="hidden whitespace-nowrap xl:inline">新規</span>
        </Link>
      </nav>
      <div className="border-connect-paper/20 flex shrink-0 items-center gap-1 border-l pl-2">
        {onSearch ? (
          <button
            type="button"
            onClick={onSearch}
            className="text-connect-paper hover:bg-connect-ink-2 flex h-11 items-center justify-center gap-2 rounded-md px-3 transition-colors"
            aria-label="横断検索"
            title="横断検索（Ctrl / ⌘ + K）"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
            <span className="hidden text-sm font-semibold lg:inline">検索</span>
          </button>
        ) : (
          <Link
            href="/?search=1"
            className="text-connect-paper hover:bg-connect-ink-2 flex h-11 w-11 items-center justify-center rounded-md transition-colors"
            aria-label="横断検索"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </Link>
        )}
        <div className="hidden items-center gap-1 sm:flex">
          <NotificationSettingsDialog>
            <button
              type="button"
              className="text-connect-paper hover:bg-connect-ink-2 flex h-11 w-11 items-center justify-center rounded-md transition-colors"
              aria-label="通知設定"
              title="通知設定"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
            </button>
          </NotificationSettingsDialog>
          <Link
            href="/safety"
            className="text-connect-paper hover:bg-connect-ink-2 flex h-11 w-11 items-center justify-center rounded-md transition-colors"
            aria-label="安全に利用するための案内"
            title="安全に利用するための案内"
          >
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </Link>
          <ProfileSettingsDialog>
            <button
              type="button"
              className="text-connect-paper hover:bg-connect-ink-2 flex h-11 w-11 items-center justify-center rounded-md transition-colors"
              aria-label="プロフィール設定"
              title="プロフィール設定"
            >
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </button>
          </ProfileSettingsDialog>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-connect-paper hover:bg-connect-ink-2 flex h-11 w-11 items-center justify-center rounded-md transition-colors"
            aria-label="ログアウト"
            title="ログアウト"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <details className="group relative sm:hidden">
          <summary className="text-connect-paper hover:bg-connect-ink-2 flex h-11 w-11 list-none items-center justify-center rounded-md transition-colors [&::-webkit-details-marker]:hidden">
            <Ellipsis className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">その他の操作</span>
          </summary>
          <div className="border-connect-ink/15 bg-connect-surface text-connect-ink absolute top-12 right-0 z-50 w-56 rounded-md border p-1 shadow-xl">
            <NotificationSettingsDialog>
              <button
                type="button"
                className="hover:bg-connect-highlight flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                通知設定
              </button>
            </NotificationSettingsDialog>
            <Link
              href="/safety"
              className="hover:bg-connect-highlight flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold"
            >
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              安全案内
            </Link>
            <ProfileSettingsDialog>
              <button
                type="button"
                className="hover:bg-connect-highlight flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold"
              >
                <UserRound className="h-5 w-5" aria-hidden="true" />
                プロフィール設定
              </button>
            </ProfileSettingsDialog>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="text-connect-danger hover:bg-connect-danger-soft flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
              ログアウト
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
