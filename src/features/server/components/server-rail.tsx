"use client";

import { LogOut, Plus, UserRound, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { type RouterOutputs, api } from "~/trpc/react";

type ServerMembership =
  RouterOutputs["server"]["getOverview"]["memberships"][number];

type ServerRailProps = {
  activeFriends?: boolean;
  memberships?: ServerMembership[];
  onSelectServer?: (membership: ServerMembership) => void;
  selectedServerId?: string | null;
};

export function ServerRail({
  activeFriends = false,
  memberships,
  onSelectServer,
  selectedServerId,
}: ServerRailProps) {
  const overview = api.server.getOverview.useQuery(undefined, {
    enabled: memberships === undefined,
    refetchInterval: memberships === undefined ? 15000 : false,
  });
  const items = memberships ?? overview.data?.memberships ?? [];

  return (
    <aside className="flex w-[72px] shrink-0 flex-col items-center gap-3 bg-[#18221f] px-3 py-4">
      <Link
        href="/"
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
      <Link
        href="/friends"
        className={`flex h-12 w-12 items-center justify-center rounded-2xl transition hover:rounded-xl hover:bg-[#d8efee] hover:text-[#114744] ${
          activeFriends
            ? "bg-[#d8efee] text-[#114744]"
            : "bg-[#2f3c37] text-[#d8efee]"
        }`}
        aria-label="Friends"
        title="Friends"
      >
        <Users className="h-5 w-5" aria-hidden="true" />
      </Link>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto">
        {items.map((membership) => {
          const label = membership.server.name;
          const className = `flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition hover:rounded-xl ${
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
