// Only counts backed by a positive trigger belong in the attention list.
export function activeAttentionItems(items) {
  return items.filter((item) => Number.isFinite(item.count) && item.count > 0);
}
