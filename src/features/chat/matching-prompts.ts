export const MATCHING_TOPICS = [
  {
    label: "雑談",
    value: "CASUAL",
  },
  {
    label: "ゲーム",
    value: "GAME",
  },
  {
    label: "悩み事",
    value: "WORRIES",
  },
] as const;

export type MatchingTopic = (typeof MATCHING_TOPICS)[number]["value"];
