export const MATCHING_TOPICS = [
  {
    label: "雑談",
    prompts: ["最近よかった小さな出来事は？", "今週楽しみにしていることは？"],
    value: "CASUAL",
  },
  {
    label: "ゲーム",
    prompts: ["最近遊んでいるゲームは？", "一緒に遊んでみたいジャンルは？"],
    value: "GAME",
  },
  {
    label: "悩み事",
    prompts: ["まず、聞いてほしいか意見がほしいかを伝えてみましょう"],
    value: "WORRIES",
  },
] as const;

export type MatchingTopic = (typeof MATCHING_TOPICS)[number]["value"];

export const MATCHING_SAFETY_NOTICE =
  "この機能は緊急支援や専門相談の代わりではありません。個人情報は急いで共有せず、嫌だと感じたら会話を終了・ブロック・通報できます。";

export const SAFETY_RESOURCES = {
  officialUrl: "https://www.mhlw.go.jp/mamorouyokokoro/soudan/",
  phone: "0570-064-556",
  phoneHref: "tel:+81570064556",
} as const;
