export type ListSelectionIntent = "range" | "replace" | "toggle";

export const adjacentListItemId = (
  orderedIds: string[],
  currentId: string,
  direction: "next" | "previous",
) => {
  const currentIndex = orderedIds.indexOf(currentId);
  if (currentIndex < 0) return null;
  const nextIndex = currentIndex + (direction === "next" ? 1 : -1);
  return orderedIds[nextIndex] ?? null;
};

export const listItemIdAfterRemoval = ({
  orderedIds,
  removedIds,
}: {
  orderedIds: string[];
  removedIds: ReadonlySet<string>;
}) => {
  const removedIndexes = orderedIds.flatMap((id, index) =>
    removedIds.has(id) ? [index] : []
  );
  if (!removedIndexes.length) return null;

  const lastRemovedIndex = Math.max(...removedIndexes);
  const itemBelow = orderedIds.slice(lastRemovedIndex + 1).find((id) =>
    !removedIds.has(id)
  );
  if (itemBelow) return itemBelow;

  const firstRemovedIndex = Math.min(...removedIndexes);
  return orderedIds.slice(0, firstRemovedIndex).reverse().find((id) =>
    !removedIds.has(id)
  ) ?? null;
};

export const updateListSelection = ({
  anchorId,
  intent,
  itemId,
  orderedIds,
  selection,
}: {
  anchorId: string | null;
  intent: ListSelectionIntent;
  itemId: string;
  orderedIds: string[];
  selection: ReadonlySet<string>;
}) => {
  if (intent === "toggle") {
    const next = new Set(selection);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    return { anchorId: itemId, selection: next };
  }

  if (intent === "range" && anchorId) {
    const anchorIndex = orderedIds.indexOf(anchorId);
    const itemIndex = orderedIds.indexOf(itemId);
    if (anchorIndex >= 0 && itemIndex >= 0) {
      const start = Math.min(anchorIndex, itemIndex);
      const end = Math.max(anchorIndex, itemIndex);
      return {
        anchorId,
        selection: new Set(orderedIds.slice(start, end + 1)),
      };
    }
  }

  return { anchorId: itemId, selection: new Set([itemId]) };
};
