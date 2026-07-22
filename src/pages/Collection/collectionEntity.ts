import type { SortOrder } from "@/services/invoke";
import type { CollectionEntitySortField } from "@/types/collection";

interface SortableCollectionEntity {
	id: string | number;
	name: string;
	game_count: number;
	stableKey?: string;
}

function compareCollectionEntityIdentity(
	a: SortableCollectionEntity,
	b: SortableCollectionEntity,
	collator: Intl.Collator,
): number {
	const nameComparison = collator.compare(a.name, b.name);
	if (nameComparison !== 0) return nameComparison;

	return collator.compare(
		a.stableKey ?? String(a.id),
		b.stableKey ?? String(b.id),
	);
}

export function sortCollectionEntityNames<T extends SortableCollectionEntity>(
	entities: readonly T[],
	order: SortOrder,
	collator: Intl.Collator,
): T[] {
	return entities.toSorted((a, b) => {
		const comparison = collator.compare(a.name, b.name);
		return comparison === 0
			? collator.compare(
					a.stableKey ?? String(a.id),
					b.stableKey ?? String(b.id),
				)
			: order === "asc"
				? comparison
				: -comparison;
	});
}

export function sortDeveloperCategories<T extends SortableCollectionEntity>(
	entities: readonly T[],
	field: CollectionEntitySortField,
	order: SortOrder,
	collator: Intl.Collator,
): T[] {
	if (field !== "game_count") {
		return sortCollectionEntityNames(entities, order, collator);
	}

	return entities.toSorted((a, b) => {
		const comparison = a.game_count - b.game_count;
		return comparison === 0
			? compareCollectionEntityIdentity(a, b, collator)
			: order === "asc"
				? comparison
				: -comparison;
	});
}

export function normalizeCollectionSearch(
	value: string,
	locale?: string,
): string {
	return value.trim().toLocaleLowerCase(locale);
}

export function matchesCollectionSearch(
	name: string,
	normalizedSearch: string,
	locale?: string,
): boolean {
	return name.toLocaleLowerCase(locale).includes(normalizedSearch);
}
