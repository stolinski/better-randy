/**
 * Recovery for a browser tab that outlived the build it loaded (ADR-0058).
 *
 * Every integration rebuilds the origin, and the previous build's hashed chunks
 * disappear with it. SvelteKit gives route modules a full-page fallback when
 * their import fails; the app's own on-demand imports (renderers, stores,
 * lifecycle operations) get nothing, so this module gives them the same
 * treatment: ask the origin whether a newer build exists and reload onto it
 * once. The pure logic lives here; the SvelteKit and browser bindings live in
 * `$lib/platform/stale-build-recovery-runtime.ts`.
 */

/**
 * What Chromium, Firefox, and WebKit say when a dynamic `import()` cannot fetch
 * its module, plus Vite's own failure for a chunk's preloaded CSS. The match is
 * deliberately narrow: any other error is a real one the caller should show.
 */
const MODULE_LOAD_FAILURE_MESSAGES: readonly string[] = [
	'Failed to fetch dynamically imported module',
	'error loading dynamically imported module',
	'Importing a module script failed',
	'Unable to preload CSS'
];

export function isModuleLoadFailure(cause: unknown): boolean {
	if (!(cause instanceof Error)) return false;
	return MODULE_LOAD_FAILURE_MESSAGES.some((message) => cause.message.includes(message));
}

export interface StaleBuildRecoveryDependencies {
	/** `kit.version.name` baked into the build this page is running. */
	readonly buildVersion: string;
	/** Resolves true when the origin now serves a build other than `buildVersion`. */
	readonly hasNewerBuild: () => Promise<boolean>;
	readonly reload: () => void;
	/** Storage that survives the reload, or null when the browser refuses one. */
	readonly storage: () => Pick<Storage, 'getItem' | 'setItem'> | null;
}

export interface StaleBuildRecovery {
	/**
	 * Resolves true when the tab is reloading onto a newer build. Resolves false
	 * when this build is current, or when the tab already reloaded from it once;
	 * the caller then shows the failure it caught.
	 */
	reloadIfBuildIsStale(): Promise<boolean>;
}

// Survives the reload so the guard below can tell a second attempt from the
// same build apart from a later rebuild.
const RELOADED_FROM_BUILD_KEY = 'gfx-stale-build-reloaded-from';

export function createStaleBuildRecovery(
	dependencies: StaleBuildRecoveryDependencies
): StaleBuildRecovery {
	let pending: Promise<boolean> | null = null;

	async function recover(): Promise<boolean> {
		let hasNewerBuild: boolean;
		try {
			hasNewerBuild = await dependencies.hasNewerBuild();
		} catch (error) {
			console.error('Could not check the origin for a newer build.', error);
			return false;
		}
		if (!hasNewerBuild) return false;

		// One reload per build. Between a build finishing and the origin
		// restarting, the old process still serves this build's shell beside the
		// new version.json; a second reload from the same build would only loop.
		const storage = dependencies.storage();
		if (readReloadedFromBuild(storage) === dependencies.buildVersion) return false;
		writeReloadedFromBuild(storage, dependencies.buildVersion);

		console.warn('Reloading onto the current build.', {
			staleBuild: dependencies.buildVersion
		});
		dependencies.reload();
		return true;
	}

	return {
		reloadIfBuildIsStale(): Promise<boolean> {
			// Every import that fails in the same moment shares one check and one
			// reload; Vite's event and the route's catch both land here.
			pending ??= recover().finally(() => {
				pending = null;
			});
			return pending;
		}
	};
}

function readReloadedFromBuild(
	storage: Pick<Storage, 'getItem' | 'setItem'> | null
): string | null {
	try {
		return storage?.getItem(RELOADED_FROM_BUILD_KEY) ?? null;
	} catch {
		// A browser that blocks site data reads as "never reloaded".
		return null;
	}
}

function writeReloadedFromBuild(
	storage: Pick<Storage, 'getItem' | 'setItem'> | null,
	buildVersion: string
): void {
	try {
		storage?.setItem(RELOADED_FROM_BUILD_KEY, buildVersion);
	} catch {
		// Quota or blocked storage: the reload still happens, just unguarded.
	}
}
