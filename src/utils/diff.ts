export function getDiff(
	current: string,
	original: string | undefined,
): string | null | undefined {
	const normOriginal = (original ?? "").trim();
	const normCurrent = current.trim();

	if (normOriginal === normCurrent) return undefined;
	if (normCurrent === "") return null;
	return normCurrent;
}

export function getArrayDiff<T>(
	current: T[],
	original: T[] | null | undefined,
): T[] | null | undefined {
	const normOriginal = original ?? [];

	if (
		current.length === normOriginal.length &&
		current.every((value, index) => Object.is(value, normOriginal[index]))
	) {
		return undefined;
	}

	if (current.length === 0) {
		return null;
	}

	return current;
}

export function getBoolDiff(
	current: boolean,
	original: boolean | null | undefined,
): boolean | undefined {
	const normOriginal = original ?? false;

	if (current === normOriginal) {
		return undefined;
	}

	return current;
}

export function getNumberDiff(
	current: number | null | undefined,
	original: number | null | undefined,
	options?: { clearValue?: number; precision?: number },
): number | null | undefined {
	const normalize = (value: number | null | undefined) => {
		if (typeof value !== "number" || !Number.isFinite(value)) {
			return null;
		}

		const nextValue =
			options?.precision === undefined
				? value
				: Math.round(value * 10 ** options.precision) / 10 ** options.precision;
		return nextValue === options?.clearValue ? null : nextValue;
	};

	const normCurrent = normalize(current);
	const normOriginal = normalize(original);

	if (normCurrent === normOriginal) {
		return normCurrent === null && original != null ? null : undefined;
	}

	return normCurrent;
}
