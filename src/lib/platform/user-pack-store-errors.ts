/**
 * The refusals the User Pack store raises, typed so a caller can act on them
 * without reading a message (ADR-0055). They live beside the store rather than
 * inside it for the same reason the composition store's do: the store module is
 * the one every caller mocks, and an error class a caller narrows on has to
 * survive that.
 */
import type { PackValidationIssue } from './packs/validation';

/** A save the origin refused, with the issues it would have stored otherwise — named per role so the GUI can point at them. */
export class UserPackValidationError extends Error {
	readonly slug: string;
	readonly issues: readonly PackValidationIssue[];

	constructor(slug: string, issues: readonly PackValidationIssue[], message: string) {
		super(message);
		this.name = 'UserPackValidationError';
		this.slug = slug;
		this.issues = issues;
	}
}

/** The document changed underneath the caller's observed revision (ADR-0054): the save applied nothing. */
export class UserPackRevisionConflictError extends Error {
	readonly slug: string;
	readonly currentContentHash: string;

	constructor(slug: string, currentContentHash: string, message: string) {
		super(message);
		this.name = 'UserPackRevisionConflictError';
		this.slug = slug;
		this.currentContentHash = currentContentHash;
	}
}

/** A delete asked of a store that holds nothing at that slug. */
export class UserPackNotHeldError extends Error {
	readonly slug: string;

	constructor(slug: string, message: string) {
		super(message);
		this.name = 'UserPackNotHeldError';
		this.slug = slug;
	}
}
