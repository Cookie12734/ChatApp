export function groupReactions<T extends { emoji: string }>(reactions: T[]) {
  const groups = new Map<string, T[]>();
  for (const reaction of reactions) {
    const group = groups.get(reaction.emoji);
    if (group) group.push(reaction);
    else groups.set(reaction.emoji, [reaction]);
  }
  return [...groups];
}
