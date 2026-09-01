/**
 * Pack role-override audit — how much of each built-in Pack's per-Pipeline
 * vocabulary is real.
 *
 * Every dotted role a Pack claims (`lower-third.ink`, `node.fill`, …) is
 * classified against the role-contract registry's ADR-0024 fallback chain:
 *
 *   - **restates** — the claimed value equals what the role would resolve to
 *     anyway through its fallback (`node.fill` → `fill-treatment`). Deleting
 *     the row changes no pixel.
 *   - **differs** — a genuine per-Pipeline claim the cores cannot express.
 *   - **no fallback** — the contract declares `fallback: none`, so the only
 *     way a Pack speaks there is an authored row (form dress, backdrops,
 *     mark fills, motion primitives).
 *
 * Measured 2026-09-01 for the planning pass on collapsing built-ins toward
 * their cores (User Packs epic finding): 541 dotted overrides across five
 * packs — 28% restate, 28% differ, 45% have no fallback. Run:
 *
 *   node --experimental-strip-types scripts/audit-pack-role-overrides.ts
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { registerGfxRuntimeModuleHooks } from './gfx-runtime-module-hooks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
registerGfxRuntimeModuleHooks(repoRoot);

const registryModule = await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/packs/registry.ts')).href
);
const contractModule = await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/packs/role-contract-registry.ts')).href
);

interface AuditedPackRole {
	kind: string;
	value: unknown;
}
interface AuditedPackManifest {
	slug: string;
	roles: Record<string, AuditedPackRole>;
}
interface AuditedRoleContract {
	role: string;
	fallback: { kind: 'none' } | { kind: 'role'; role: string };
}

const PACK_REGISTRY = registryModule.PACK_REGISTRY as Readonly<Record<string, AuditedPackManifest>>;
const PACK_ROLE_CONTRACT_REGISTRY = contractModule.PACK_ROLE_CONTRACT_REGISTRY as Readonly<
	Record<string, AuditedRoleContract>
>;

function canonicalRoleValue(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	const record = value as Record<string, unknown>;
	return JSON.stringify(record, Object.keys(record).sort());
}

/** Walks the fallback chain to the first role the manifest actually claims. */
function resolveFallbackClaim(
	manifest: AuditedPackManifest,
	role: string,
	seen: Set<string> = new Set()
): { role: string; value: unknown } | null {
	if (seen.has(role)) return null;
	seen.add(role);
	const contract = PACK_ROLE_CONTRACT_REGISTRY[role];
	if (!contract || contract.fallback.kind === 'none') return null;
	const target = contract.fallback.role;
	const claimed = manifest.roles[target];
	if (claimed) return { role: target, value: claimed.value };
	return resolveFallbackClaim(manifest, target, seen);
}

function countByPipeline(roles: readonly string[]): string {
	const counts = new Map<string, number>();
	for (const role of roles) {
		const pipeline = role.split('.')[0];
		counts.set(pipeline, (counts.get(pipeline) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((left, right) => right[1] - left[1])
		.map(([pipeline, count]) => `${pipeline}:${count}`)
		.join(' ');
}

const totals = { overrides: 0, restates: 0, differs: 0, noFallback: 0 };
for (const [slug, manifest] of Object.entries(PACK_REGISTRY)) {
	const dotted = Object.keys(manifest.roles).filter((role) => role.includes('.'));
	const restates: string[] = [];
	const differs: string[] = [];
	const noFallback: string[] = [];
	for (const role of dotted) {
		const target = resolveFallbackClaim(manifest, role);
		if (!target) {
			noFallback.push(role);
		} else if (canonicalRoleValue(target.value) === canonicalRoleValue(manifest.roles[role].value)) {
			restates.push(role);
		} else {
			differs.push(role);
		}
	}
	totals.overrides += dotted.length;
	totals.restates += restates.length;
	totals.differs += differs.length;
	totals.noFallback += noFallback.length;
	console.log(
		`\n${slug}: ${dotted.length} dotted overrides — ${restates.length} restate their fallback, ${differs.length} differ, ${noFallback.length} have no fallback`
	);
	console.log(`  restates by pipeline: ${countByPipeline(restates)}`);
	console.log(`  differs by pipeline:  ${countByPipeline(differs)}`);
	console.log(`  no-fallback roles:    ${noFallback.join(', ')}`);
}

const percent = (count: number): string =>
	`${Math.round((count / Math.max(totals.overrides, 1)) * 100)}%`;
console.log(
	`\nall packs: ${totals.overrides} overrides — ${totals.restates} restate (${percent(totals.restates)}), ${totals.differs} differ (${percent(totals.differs)}), ${totals.noFallback} have no fallback (${percent(totals.noFallback)})`
);
