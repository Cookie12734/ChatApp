"use client";

import { LogOut, Plus, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

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
    refetchInterval: memberships === undefined ? 15000 : false,
  });
  const items = memberships ?? overview.data?.memberships ?? [];

  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-3 bg-[#18221f] px-2 py-4 sm:w-[72px] sm:px-3">
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
      <div className="h-px w-8 bg-[#f6f0e4]/25" />
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto">
        {items.map((membership) => {
          const label = membership.server.name;
          const unreadCount = membership.server.channels.reduce(
            (total, channel) => total + channel.unreadCount,
            0,
          );
          const className = `relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition hover:rounded-xl ${
            membership.server.id === selectedServerId
              ? "bg-[#d8efee] text-[#114744]"
              : "bg-[#2f3c37] text-[#d8efee] hover:bg-[#d8efee] hover:text-[#114744]"
          }`;

          if (onSelectServer) {
            return (
              <button
                key={membership.id}
                type="button"
                onClick={() => onSelectServer(membership)}
                className={className}
                aria-label={label}
                title={label}
              >
                {label.slice(0, 2).toUpperCase()}
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#18221f] bg-[#cc5f2f] px-1 text-[11px] text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          }

          return (
            <Link
              key={membership.id}
              href={`/?serverId=${encodeURIComponent(membership.server.id)}`}
              className={className}
              aria-label={label}
              title={label}
            >
              {label.slice(0, 2).toUpperCase()}
              {unreadCount > 0 && (
                <span className="absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#18221f] bg-[#cc5f2f] px-1 text-[11px] text-white">
                  {unreadCount}
                </span>
              )}
            </Link>
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
        <Link
          href="/profile"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f3c37] text-[#f6f0e4] transition hover:rounded-xl hover:bg-[#fff8ed] hover:text-[#18221f]"
          aria-label="Profile"
          title="Profile"
        >
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </Link>
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
