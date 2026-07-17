"use client";

import { LogOut, Plus, RefreshCw, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ProfileSettingsDialog } from "~/features/profile/components/profile-settings-dialog";
import { type RouterOutputs, api } from "~/trpc/react";

type ServerMembership =
  RouterOutputs["server"]["getOverview"]["memberships"][number];

type ServerRailProps = {
  memberships?: ServerMembership[];
  onSelectHome?: () => void;
  onSelectServer?: (membership: ServerMembership) => void;
  selectedServerId?: string | null;
};

export function ServerRail({
  memberships,
  onSelectHome,
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
  const homeIndicatorClass = `absolute top-1/2 left-0 z-10 -translate-y-1/2 rounded-r-full bg-white transition-all ${
    selectedServerId ? "h-0 w-0 group-hover:h-5 group-hover:w-1" : "h-10 w-1"
  }`;

  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-3 bg-[#18221f] py-4 sm:w-[72px]">
      <div className="group relative flex h-12 w-full justify-center">
        <span className={homeIndicatorClass} aria-hidden="true" />
        <Link
          href="/"
          onClick={onSelectHome}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff8ed] transition hover:rounded-xl"
          aria-label="connect"
        >
          <Image
            src="/connect-icon.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl object-cover"
            priority
          />
        </Link>
      </div>
      <div className="h-px w-8 bg-[#f6f0e4]/25" />
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto">
        {memberships === undefined && overview.isError && (
          <button
            type="button"
            onClick={() => void overview.refetch()}
            disabled={overview.isFetching}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#d8efee]/30 bg-[#2f3c37] text-[#d8efee] transition hover:rounded-xl hover:bg-[#d8efee] hover:text-[#114744] disabled:opacity-50"
            aria-label="サーバー一覧を再読み込み"
            title="サーバー一覧を再読み込み"
          >
            <RefreshCw
              className={`h-5 w-5 ${overview.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
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
          const indicatorClass = `absolute top-1/2 left-0 z-10 -translate-y-1/2 rounded-r-full bg-white transition-all ${
            isSelected
              ? "h-10 w-1"
              : unreadCount > 0
                ? "h-3 w-3 ring-2 ring-[#18221f] group-hover:h-5 group-hover:w-1"
                : "h-0 w-0 group-hover:h-5 group-hover:w-1"
          }`;
          const className = `flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition ${
            isSelected
              ? "bg-[#d8efee] text-[#114744]"
              : "bg-[#2f3c37] text-[#d8efee] hover:bg-[#d8efee] hover:text-[#114744]"
          }`;

          if (onSelectServer) {
            return (
              <div
                key={membership.id}
                className="group relative flex h-12 w-full justify-center"
              >
                <span className={indicatorClass} aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onSelectServer(membership)}
                  className={className}
                  aria-label={unreadLabel}
                  title={unreadLabel}
                >
                  {membership.server.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={membership.server.image}
                      alt=""
                      className="h-full w-full rounded-2xl object-cover"
                    />
                  ) : (
                    label.slice(0, 2).toUpperCase()
                  )}
                </button>
              </div>
            );
          }

          return (
            <div
              key={membership.id}
              className="group relative flex h-12 w-full justify-center"
            >
              <span className={indicatorClass} aria-hidden="true" />
              <Link
                href={`/?serverId=${encodeURIComponent(membership.server.id)}`}
                className={className}
                aria-label={unreadLabel}
                title={unreadLabel}
              >
                {membership.server.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={membership.server.image}
                    alt=""
                    className="h-full w-full rounded-2xl object-cover"
                  />
                ) : (
                  label.slice(0, 2).toUpperCase()
                )}
              </Link>
            </div>
          );
        })}
        <Link
          href="/servers/new"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#d8efee]/30 bg-[#2f3c37] text-[#d8efee] transition hover:rounded-xl hover:bg-[#d8efee] hover:text-[#114744]"
          aria-label="Create server"
          title="Create server"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-auto flex flex-col gap-3">
        <ProfileSettingsDialog>
          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f3c37] text-[#f6f0e4] transition hover:rounded-xl hover:bg-[#fff8ed] hover:text-[#18221f]"
            aria-label="Profile"
            title="Profile"
          >
            <UserRound className="h-5 w-5" aria-hidden="true" />
          </button>
        </ProfileSettingsDialog>
        <Link
          href="/api/auth/signout"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f3c37] text-[#f6f0e4] transition hover:rounded-xl hover:bg-[#fff8ed] hover:text-[#18221f]"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}
