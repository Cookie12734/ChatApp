import { Crown, UserMinus, X } from "lucide-react";
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
import {
  canChangeServerMemberRole,
  canRemoveServerMember,
  type ServerMemberRole,
} from "~/features/server/server/message-permissions";

type ServerMember = RouterOutputs["server"]["getMembers"][number];

type ServerMemberListProps = {
  currentUserId?: string;
  isOpen: boolean;
  currentRole?: ServerMemberRole;
  isRemoving: boolean;
  isUpdatingRole: boolean;
  members: ServerMember[];
  onClose: () => void;
  onProfileContextMenu: (
    event: MouseEvent<HTMLElement>,
    user: { name?: string | null; userId: string },
  ) => void;
  onRemove: (memberId: string, displayName: string) => void;
  onUpdateRole: (memberId: string, role: ServerMemberRole) => void;
  serverId: string;
};

export function ServerMemberList({
  currentUserId,
  isOpen,
  currentRole,
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
          className="bg-connect-ink/35 fixed inset-x-0 top-16 bottom-0 z-30"
          aria-label="メンバー一覧を閉じる"
        />
      )}
      <aside
        className={`${
          isOpen
            ? "fixed top-16 right-0 bottom-0 z-40 block shadow-xl"
            : "hidden"
        } border-connect-ink/15 bg-connect-navigation w-[min(22rem,100%)] shrink-0 overflow-y-auto border-l px-4 py-4`}
        aria-label="メンバー一覧"
      >
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-connect-muted hover:bg-connect-surface hover:text-connect-ink flex h-11 w-11 items-center justify-center rounded-md transition-colors"
            aria-label="メンバー一覧を閉じる"
            title="メンバー一覧を閉じる"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <h2 className="text-connect-warm-muted text-xs font-semibold tracking-wide uppercase">
            メンバー
          </h2>
        </div>
        <div className="space-y-2">
          {members.map((member) => {
            const displayName = getServerDisplayName(member);
            const isCurrentUser = member.user.id === currentUserId;
            const roleLabels: Record<ServerMemberRole, string> = {
              OWNER: "所有者",
              ADMIN: "管理者",
              MODERATOR: "モデレーター",
              MEMBER: "メンバー",
              READ_ONLY: "閲覧のみ",
            };
            const assignableRoles = (
              ["OWNER", "ADMIN", "MODERATOR", "MEMBER", "READ_ONLY"] as const
            ).filter(
              (role) =>
                role === member.role ||
                canChangeServerMemberRole(currentRole, member.role, role),
            );

            return (
              <div
                key={member.id}
                className="group text-connect-ink hover:bg-connect-ink/5 flex items-center gap-2 rounded-md px-3 py-2 transition-colors"
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
                    className="focus-visible:ring-connect-focus-soft flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left focus-visible:ring-2 focus-visible:outline-none"
                    aria-label={`${displayName}のプロフィールを開く`}
                  >
                    <span className="relative shrink-0">
                      <Avatar
                        user={member.user}
                        className="border-connect-ink/10 h-9 w-9 rounded-full border"
                      />
                      <span
                        className={`border-connect-navigation group-hover:border-connect-warm-rule absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 transition-colors ${getPresenceDotClassName(
                          member.user.presenceStatus,
                        )}`}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {displayName}
                      </span>
                      <span className="text-connect-neutral block truncate text-xs">
                        {getPresenceDisplayLabel(member.user.presenceStatus)} ・
                        {roleLabels[member.role]}
                      </span>
                    </span>
                  </button>
                </UserProfileDialog>
                {!isCurrentUser &&
                  (assignableRoles.length > 1 ||
                    canRemoveServerMember(currentRole, member.role)) && (
                    <div className="flex shrink-0 items-center gap-1">
                      <label
                        className="sr-only"
                        htmlFor={`member-role-${member.id}`}
                      >
                        {displayName}のロール
                      </label>
                      <select
                        id={`member-role-${member.id}`}
                        value={member.role}
                        onChange={(event) =>
                          onUpdateRole(
                            member.id,
                            event.target.value as ServerMemberRole,
                          )
                        }
                        disabled={isUpdatingRole}
                        className="border-connect-ink/15 bg-connect-surface min-h-10 max-w-32 rounded-md border px-2 text-xs font-semibold disabled:opacity-45"
                      >
                        {assignableRoles.map((role) => (
                          <option key={role} value={role}>
                            {role === "OWNER" ? "♛ " : ""}
                            {roleLabels[role]}
                          </option>
                        ))}
                      </select>
                      {member.role === "OWNER" && (
                        <Crown
                          className="text-connect-signal h-4 w-4"
                          aria-hidden="true"
                        />
                      )}
                      {canRemoveServerMember(currentRole, member.role) && (
                        <button
                          type="button"
                          onClick={() => onRemove(member.id, displayName)}
                          disabled={isRemoving}
                          className="text-connect-danger hover:bg-connect-danger-soft flex h-10 w-10 items-center justify-center rounded-md transition disabled:opacity-45"
                          aria-label="退出させる"
                          title="退出させる"
                        >
                          <UserMinus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
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
