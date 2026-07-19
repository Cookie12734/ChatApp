import { Shield, ShieldOff, UserMinus, X } from "lucide-react";
import type { MouseEvent } from "react";

import {
  Avatar,
  getServerDisplayName,
} from "~/features/chat/components/chat-message";
import { UserProfileDialog } from "~/features/profile/components/user-profile-dialog";
import {
  getPresenceDisplayLabel,
  getPresenceDotClassName,
} from "~/features/profile/presence";
import type { RouterOutputs } from "~/trpc/react";

type ServerMember = RouterOutputs["server"]["getMembers"][number];

type ServerMemberListProps = {
  currentUserId?: string;
  isOpen: boolean;
  isOwner: boolean;
  isRemoving: boolean;
  isUpdatingRole: boolean;
  members: ServerMember[];
  onClose: () => void;
  onProfileContextMenu: (
    event: MouseEvent<HTMLElement>,
    user: { name?: string | null; userId: string },
  ) => void;
  onRemove: (memberId: string, displayName: string) => void;
  onUpdateRole: (memberId: string, role: "MEMBER" | "OWNER") => void;
  serverId: string;
};

export function ServerMemberList({
  currentUserId,
  isOpen,
  isOwner,
  isRemoving,
  isUpdatingRole,
  members,
  onClose,
  onProfileContextMenu,
  onRemove,
  onUpdateRole,
  serverId,
}: ServerMemberListProps) {
  return (
    <>
      {isOpen && (
        <button
          type="button"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/35 lg:hidden"
          aria-label="メンバー一覧を閉じる"
        />
      )}
      <aside
        className={`${
          isOpen ? "fixed inset-y-0 right-0 z-40 block shadow-xl" : "hidden"
        } w-64 shrink-0 overflow-y-auto border-l border-[#18221f]/15 bg-[#f1e4d0] px-4 py-4 lg:static lg:z-auto lg:block lg:shadow-none`}
      >
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#fff8ed] hover:text-[#18221f] lg:hidden"
            aria-label="メンバー一覧を閉じる"
            title="メンバー一覧を閉じる"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <h2 className="text-xs font-semibold tracking-wide text-[#7b6757] uppercase">
            メンバー
          </h2>
        </div>
        <div className="space-y-2">
          {members.map((member) => {
            const displayName = getServerDisplayName(member);
            const isCurrentUser = member.user.id === currentUserId;

            return (
              <div
                key={member.id}
                className="group flex items-center gap-2 rounded-md px-3 py-2 text-[#18221f] transition-colors hover:bg-black/5"
              >
                <UserProfileDialog
                  userId={member.user.userId}
                  serverId={serverId}
                >
                  <button
                    type="button"
                    onContextMenu={(event) =>
                      onProfileContextMenu(event, {
                        ...member.user,
                        name: displayName,
                      })
                    }
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left focus-visible:ring-2 focus-visible:ring-[#d8efee] focus-visible:outline-none"
                    aria-label={`${displayName}のプロフィールを開く`}
                  >
                    <span className="relative shrink-0">
                      <Avatar
                        user={member.user}
                        className="h-9 w-9 rounded-full border border-black/10"
                      />
                      <span
                        className={`absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#f1e4d0] transition-colors group-hover:border-[#e5d8c3] ${getPresenceDotClassName(
                          member.user.presenceStatus,
                        )}`}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {displayName}
                      </span>
                      <span className="block truncate text-xs text-[#68716b]">
                        {getPresenceDisplayLabel(member.user.presenceStatus)} ・
                        {member.role === "OWNER" ? "所有者" : "メンバー"}
                      </span>
                    </span>
                  </button>
                </UserProfileDialog>
                {isOwner && !isCurrentUser && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateRole(
                          member.id,
                          member.role === "OWNER" ? "MEMBER" : "OWNER",
                        )
                      }
                      disabled={isUpdatingRole}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-[#53615a] transition hover:bg-[#e4f2dc] hover:text-[#114744] disabled:opacity-45"
                      aria-label={
                        member.role === "OWNER"
                          ? "メンバーに戻す"
                          : "所有権を移譲"
                      }
                      title={
                        member.role === "OWNER"
                          ? "メンバーに戻す"
                          : "所有権を移譲"
                      }
                    >
                      {member.role === "OWNER" ? (
                        <ShieldOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Shield className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(member.id, displayName)}
                      disabled={isRemoving}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-[#9f4122] transition hover:bg-[#fff1e8] disabled:opacity-45"
                      aria-label="退出させる"
                      title="退出させる"
                    >
                      <UserMinus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
