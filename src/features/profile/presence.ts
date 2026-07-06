export const presenceStatuses = ["ONLINE", "IDLE", "DND", "INVISIBLE"] as const;

export type PresenceStatus = (typeof presenceStatuses)[number];

export const presenceOptions = [
  {
    dotClassName: "bg-green-500",
    label: "オンライン",
    value: "ONLINE",
  },
  {
    dotClassName: "bg-yellow-400",
    label: "離席中",
    value: "IDLE",
  },
  {
    dotClassName: "bg-red-500",
    label: "取り込み中",
    value: "DND",
  },
  {
    displayLabel: "オフライン",
    dotClassName: "bg-[#68716b]",
    label: "オンライン状態を隠す",
    value: "INVISIBLE",
  },
] satisfies {
  displayLabel?: string;
  dotClassName: string;
  label: string;
  value: PresenceStatus;
}[];

function getPresenceOption(status: PresenceStatus | null | undefined) {
  return (
    presenceOptions.find((option) => option.value === status) ??
    presenceOptions[presenceOptions.length - 1]!
  );
}

export function getPresenceDisplayLabel(
  status: PresenceStatus | null | undefined,
) {
  const option = getPresenceOption(status);
  return option.displayLabel ?? option.label;
}

export function getPresenceDotClassName(
  status: PresenceStatus | null | undefined,
) {
  return getPresenceOption(status).dotClassName;
}
