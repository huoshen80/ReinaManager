export function sortByIdOrder<T extends { id?: number }>(
	items: T[],
	orderIds: number[],
	order: "asc" | "desc" = "asc",
): T[] {
	if (items.length <= 1) return items;

	const sourceIndexMap = new Map<number, number>();
	items.forEach((item, index) => {
		if (item.id != null) sourceIndexMap.set(item.id, index);
	});

	const orderIndexMap = new Map<number, number>();
	orderIds.forEach((id, index) => {
		orderIndexMap.set(id, index);
	});

	const sorted = [...items].sort((a, b) => {
		const aIndex =
			a.id != null
				? (orderIndexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		const bIndex =
			b.id != null
				? (orderIndexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		if (aIndex !== bIndex) return aIndex - bIndex;

		const fallbackA =
			a.id != null
				? (sourceIndexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		const fallbackB =
			b.id != null
				? (sourceIndexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		return fallbackA - fallbackB;
	});

	return order === "desc" ? sorted.reverse() : sorted;
}
