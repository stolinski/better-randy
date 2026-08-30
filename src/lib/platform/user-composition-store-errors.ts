/**
 * The refusals a User composition store raises about a slug, shared by both
 * backends so a caller can tell them apart without reading a message.
 *
 * These live beside the store rather than inside it because the store module is
 * the one every caller mocks; an error class a caller must narrow on has to
 * survive that.
 */

/**
 * A delete asked of a store that holds nothing at that slug — a 404 from the
 * origin store, an absent record in the browser-scoped one.
 *
 * Reverting a fork treats this as the end state it asked for: the fork is gone,
 * which is the whole point of the delete. Every other caller still hears a
 * refusal, so deleting a composition that was never there stays an error where
 * it should be one.
 */
export class UserCompositionNotHeldError extends Error {
	readonly slug: string;

	constructor(slug: string, message: string) {
		super(message);
		this.name = 'UserCompositionNotHeldError';
		this.slug = slug;
	}
}

export function isUserCompositionNotHeldError(
	value: unknown
): value is UserCompositionNotHeldError {
	return value instanceof UserCompositionNotHeldError;
}
