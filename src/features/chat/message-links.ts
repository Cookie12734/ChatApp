export type MessagePart = {
  kind: "link" | "text";
  value: string;
};

const externalLinkPattern = /https?:\/\/[^\s<>"']+/gi;
const trailingPunctuationPattern = /[.,!?;:\u3001\u3002\uFF01\uFF1F]+$/u;

function appendText(parts: MessagePart[], value: string) {
  if (!value) return;

  const previous = parts.at(-1);
  if (previous?.kind === "text") {
    previous.value += value;
    return;
  }

  parts.push({ kind: "text", value });
}

export function splitMessageLinks(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let cursor = 0;

  for (const match of content.matchAll(externalLinkPattern)) {
    const rawValue = match[0];
    const trailingPunctuation =
      trailingPunctuationPattern.exec(rawValue)?.[0] ?? "";
    const value = rawValue.slice(
      0,
      rawValue.length - trailingPunctuation.length,
    );

    try {
      const url = new URL(value);
      if (
        !url.hostname ||
        (url.protocol !== "http:" && url.protocol !== "https:")
      ) {
        continue;
      }
    } catch {
      continue;
    }

    appendText(parts, content.slice(cursor, match.index));
    parts.push({ kind: "link", value });
    appendText(parts, trailingPunctuation);
    cursor = match.index + rawValue.length;
  }

  appendText(parts, content.slice(cursor));
  return parts;
}
