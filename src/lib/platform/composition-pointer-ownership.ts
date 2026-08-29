/**
 * Which operation family owns a composition pointer, and whether one operation
 * was allowed to write it ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * Ownership is mechanical, not editorial: every family declares the composition
 * subtrees it alone writes, and the **longest declared pointer wins**. That one
 * rule is also what enforces `membership` scope — a family that owns
 * `/state/overlays` for membership cannot rewrite `/state/overlays/1/position`,
 * because `placement` declares the deeper pointer and therefore owns it.
 */
import {
	WEBMCP_OPERATION_FAMILIES,
	type WebmcpOperationFamilyName,
	type WebmcpOwnedCompositionPath
} from './webmcp-operation-inventory';

/**
 * A JSON pointer into a composition document, such as
 * `/state/overlays/1/content`. Every composition key is a schema-declared
 * identifier containing neither `/` nor `~`, so segments compare literally and
 * no JSON Pointer escaping is involved.
 */
export type CompositionPointer = string;

export interface CompositionPointerOwner {
	family: WebmcpOperationFamilyName;
	ownedPath: WebmcpOwnedCompositionPath;
}

/**
 * Why a written pointer was refused.
 *
 * - `unowned-pointer` — no family declares this subtree at all.
 * - `foreign-family` — another family owns the longest matching pointer.
 * - `undeclared-pointer` — the operation's own inventory row does not list it.
 */
export type CompositionWriteRejectionReason =
	'unowned-pointer' | 'foreign-family' | 'undeclared-pointer';

export interface CompositionWriteRejection {
	pointer: CompositionPointer;
	reason: CompositionWriteRejectionReason;
	owner: WebmcpOperationFamilyName | null;
}

function splitCompositionPointer(pointer: CompositionPointer): readonly string[] {
	return pointer.split('/').slice(1);
}

/**
 * True when `pattern` covers `pointer`: each pattern segment matches the
 * pointer segment at the same depth, a wildcard segment matching exactly one
 * segment, and a pattern may stop short so it covers everything beneath it.
 * `/state/overlays` covers `/state/overlays/1/type`, and the wildcard pattern
 * for an Overlay's content covers `/state/overlays/1/content/title`.
 */
export function coversCompositionPointer(
	pattern: CompositionPointer,
	pointer: CompositionPointer
): boolean {
	const patternSegments = splitCompositionPointer(pattern);
	const pointerSegments = splitCompositionPointer(pointer);
	if (patternSegments.length > pointerSegments.length) return false;
	return patternSegments.every(
		(segment, index) => segment === '*' || segment === pointerSegments[index]
	);
}

/**
 * The family that owns `pointer`, resolved by longest declared pointer, or
 * `null` when no family declares the subtree. Two families never declare the
 * same pointer (the inventory test proves it), so the longest match is unique.
 */
export function resolveCompositionPointerOwner(
	pointer: CompositionPointer
): CompositionPointerOwner | null {
	let owner: CompositionPointerOwner | null = null;
	let ownerDepth = -1;

	for (const family of WEBMCP_OPERATION_FAMILIES) {
		for (const ownedPath of family.ownedPaths) {
			if (!coversCompositionPointer(ownedPath.pointer, pointer)) continue;
			const depth = splitCompositionPointer(ownedPath.pointer).length;
			if (depth > ownerDepth) {
				ownerDepth = depth;
				owner = { family: family.name, ownedPath };
			}
		}
	}

	return owner;
}

/**
 * The pointers an operation of `family` was not allowed to write, given the
 * pointers its inventory row declares. An empty array means every written
 * pointer belonged to the operation. A non-empty one is a defect in the
 * operation, not caller input: the transaction core raises it rather than
 * committing a write that crossed a family boundary.
 */
export function rejectUnauthorizedCompositionWrites(
	pointers: readonly CompositionPointer[],
	family: WebmcpOperationFamilyName,
	declaredWrites: readonly CompositionPointer[]
): readonly CompositionWriteRejection[] {
	const rejections: CompositionWriteRejection[] = [];

	for (const pointer of pointers) {
		const owner = resolveCompositionPointerOwner(pointer);
		if (!owner) {
			rejections.push({ pointer, reason: 'unowned-pointer', owner: null });
			continue;
		}
		if (owner.family !== family) {
			rejections.push({ pointer, reason: 'foreign-family', owner: owner.family });
			continue;
		}
		if (!declaredWrites.some((declared) => coversCompositionPointer(declared, pointer))) {
			rejections.push({ pointer, reason: 'undeclared-pointer', owner: owner.family });
		}
	}

	return rejections;
}

export function formatCompositionWriteRejection(rejection: CompositionWriteRejection): string {
	switch (rejection.reason) {
		case 'unowned-pointer':
			return `${rejection.pointer} belongs to no operation family`;
		case 'foreign-family':
			return `${rejection.pointer} is owned by the ${rejection.owner} family`;
		case 'undeclared-pointer':
			return `${rejection.pointer} is not among the pointers the operation declares`;
	}
}
