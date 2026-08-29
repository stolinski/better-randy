/**
 * The id a newly added composition entity takes.
 *
 * Overlays, Effects, text animations, and Blocks each carry a stable id that a
 * Cascade anchor, a text-animation target, a timeline row, and an Operation
 * receipt all resolve through, so a new entity needs an id no sibling already
 * holds. The id is derived from the entity's own kind — `lower-third-2` reads
 * as a lower third — rather than from an opaque handle nobody can say out loud.
 */
export function createCompositionEntityId(prefix: string, takenIds: Iterable<string>): string {
	if (prefix.length === 0) {
		throw new TypeError('A composition entity id needs a non-empty prefix.');
	}
	const taken = new Set(takenIds);
	let counter = 1;
	while (taken.has(`${prefix}-${counter}`)) counter += 1;
	return `${prefix}-${counter}`;
}
