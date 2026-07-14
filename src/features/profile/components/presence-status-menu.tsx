"use client";

import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { DropdownMenu } from "radix-ui";

import {
  presenceOptions,
  type PresenceStatus,
} from "~/features/profile/presence";
import { api } from "~/trpc/react";

type PresenceStatusMenuProps = {
  children: ReactNode;
  currentStatus: PresenceStatus;
};

export function PresenceStatusMenu({
  children,
  currentStatus,
}: PresenceStatusMenuProps) {
  const utils = api.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const updatePresence = api.profile.updatePresence.useMutation({
    onSuccess: async () => {
      setIsOpen(false);
      await Promise.all([
        utils.profile.getMine.invalidate(),
        utils.server.getOverview.invalidate(),
      ]);
    },
  });
  const selectedStatus = updatePresence.isPending
    ? updatePresence.variables.presenceStatus
    : currentStatus;

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="z-50 min-w-60 rounded-md border border-[#18221f]/15 bg-[#fff8ed] p-1.5 text-[#18221f] shadow-xl outline-none"
        >
          <DropdownMenu.Label className="px-3 py-2 text-xs font-semibold tracking-wide text-[#68716b] uppercase">
            オンライン状態
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={selectedStatus}
            onValueChange={(value) => {
              if (updatePresence.isPending) return;
              updatePresence.mutate({
                presenceStatus: value as PresenceStatus,
              });
            }}
          >
            {presenceOptions.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                disabled={updatePresence.isPending}
                onSelect={(event) => event.preventDefault()}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-3 text-sm font-medium transition outline-none data-disabled:cursor-wait data-disabled:opacity-60 data-highlighted:bg-[#e4f2dc]"
              >
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${option.dotClassName}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{option.label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check
                    className="h-4 w-4 text-[#114744]"
                    aria-hidden="true"
                  />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {updatePresence.error && (
            <p
              className="mx-2 mt-1 rounded border border-[#cc5f2f]/25 bg-[#fff1e8] px-2 py-1.5 text-xs text-[#9f4122]"
              role="alert"
            >
              {updatePresence.error.message}
            </p>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
