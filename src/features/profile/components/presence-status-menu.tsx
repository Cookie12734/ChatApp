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
          className="border-connect-ink/15 bg-connect-surface text-connect-ink z-50 min-w-60 rounded-md border p-1.5 shadow-xl outline-none"
        >
          <DropdownMenu.Label className="text-connect-neutral px-3 py-2 text-xs font-semibold tracking-wide uppercase">
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
                className="data-highlighted:bg-connect-highlight flex min-h-11 cursor-pointer items-center gap-3 rounded px-3 text-sm font-medium transition outline-none data-disabled:cursor-wait data-disabled:opacity-60"
              >
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${option.dotClassName}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{option.label}</span>
                <DropdownMenu.ItemIndicator>
                  <Check
                    className="text-connect-action h-4 w-4"
                    aria-hidden="true"
                  />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {updatePresence.error && (
            <p
              className="border-connect-signal/25 bg-connect-danger-soft text-connect-danger mx-2 mt-1 rounded border px-2 py-1.5 text-xs"
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
