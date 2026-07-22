/**
 * Identity Spec types — shared vocabulary per ADR-0015, extended with the
 * via-pack clause per ADR-0019. Every visible Pipeline (Surface, Block,
 * Annotation, Overlay) ships an `identity.ts` next to its `index.ts`
 * declaring an `IdentitySpec` of this shape. The registration validator
 * (Phase 1.4 of the motion-primitives plan) walks each spec at engine boot
 * and refuses Pipelines whose dimensions are neither `implementation`-
 * declared nor `viaPack`-declared, and refuses Packs whose manifests do not
 * resolve every `viaPack` role referenced by registered Pipelines.
 */

export type IdentityKind = 'material' | 'graphic' | 'tool';

export type IdentityProbe =
	| { kind: 'script'; path: string }
	| { kind: 'named-observation'; region: string; expectation: string };

/**
 * A dimension is either implemented intrinsically by the Pipeline
 * (`implementation` carries a code-pointer string) or resolved via the active
 * Pack (`viaPack` names a Role the Pack manifest must enumerate). Exactly one
 * of the two fields must be present; the runtime registration validator
 * (`validateIdentityRegistry`) refuses dimensions that carry both or
 * neither. We keep the type structural rather than a discriminated union so
 * downstream code can inspect either field without narrowing gymnastics.
 */
export interface IdentityDimension {
	name: string;
	definition: string;
	probe: IdentityProbe;
	implementation?: string;
	viaPack?: string;
}

/**
 * Declared Pack-immunity per ADR-0038. A Pipeline whose appearance is the
 * faithful artifact or authored content itself declares immunity here so it
 * is a registry-visible fact — never an unwired accident indistinguishable
 * from a Pack-plumbing bug.
 *
 * Semantics: an immune Surface or Overlay artifact skips Pack appearance-var
 * injection in its Layer mount. Treatments layered around it — annotation
 * marks, edge treatment, depth shadow, Effects — still resolve from the active
 * Pack.
 * The rationale is part of the declaration: immunity without a stated "why"
 * is unrepresentable.
 */
export interface PackImmunity {
	rationale: string;
}

export interface IdentitySpec {
	kind: IdentityKind;
	claim: string;
	dimensions: readonly IdentityDimension[];
	/**
	 * Present ⇒ this Pipeline's artifact is Pack-immune (see {@link PackImmunity}).
	 * Absent ⇒ the Pipeline participates fully in Pack appearance resolution,
	 * and the Critic's two-Pack pixel-diff check may demand it visibly respond.
	 */
	packImmunity?: PackImmunity;
}

/**
 * Collect every `viaPack` role referenced by a spec. Used by the Pack
 * manifest validator to confirm every reference resolves.
 */
export function collectViaPackRoles(spec: IdentitySpec): readonly string[] {
	const roles: string[] = [];
	for (const dim of spec.dimensions) {
		if (dim.viaPack !== undefined) {
			roles.push(dim.viaPack);
		}
	}
	return roles;
}
