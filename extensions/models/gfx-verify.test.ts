import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import { deriveVerificationSuites, model } from "./gfx-verify.ts";

const runChecks = model.methods.run_checks;

function silentContext() {
	return {
		repoDir: "/tmp",
		logger: { info: () => {} },
		writeResource: (_spec: string, name: string) => Promise.resolve({ name }),
		createFileWriter: (_spec: string, name: string) => ({
			writeText: () => Promise.resolve({ name }),
		}),
	};
}

function suiteNames(filesChanged: string[]): string[] {
	return deriveVerificationSuites(filesChanged).map((plan) => plan.name);
}

Deno.test("swamp/meta-only changes derive zero app suites", () => {
	assertEquals(
		suiteNames([
			"models/@swamp/software-factory/gfx-factory.yaml",
			"workflows/workflow-sentry-autofix.yaml",
			".claude/skills/gfx-factory/SKILL.md",
			"docs/roadmap.md",
		]),
		[],
	);
});

Deno.test("extension changes derive only the deno extension suite", () => {
	assertEquals(suiteNames(["extensions/models/gfx-verify.ts"]), ["extensions"]);
});

Deno.test("a single preset change derives check, test, and affected-scoped presets", () => {
	const plans = deriveVerificationSuites(["src/lib/presets/chapter-card.json"]);
	assertEquals(plans.map((plan) => plan.name), ["check", "test", "presets"]);
	const presets = plans.find((plan) => plan.name === "presets");
	assertEquals(presets?.command.includes("--affected"), true);
	assertEquals(presets?.command.includes("--all"), false);
	assertEquals(
		presets?.command.at(-1),
		JSON.stringify(["src/lib/presets/chapter-card.json"]),
	);
});

Deno.test("platform CSS changes pass only the CSS path to the presets selector", () => {
	const plans = deriveVerificationSuites([
		"src/routes/+layout.svelte",
		"docs/adr/0050-something.md",
	]);
	const presets = plans.find((plan) => plan.name === "presets");
	assertEquals(
		presets?.command.at(-1),
		JSON.stringify(["src/routes/+layout.svelte"]),
	);
});

Deno.test("docs/packs changes stay app-relevant for the presets selector", () => {
	const plans = deriveVerificationSuites(["docs/packs/syntax/aesthetic.md"]);
	assertEquals(plans.map((plan) => plan.name), ["check", "test", "presets"]);
});

Deno.test("run_checks arguments accept filesChanged without suites", () => {
	const parsed = runChecks.arguments.parse({
		worktreePath: "/tmp/somewhere",
		label: "task-1",
		filesChanged: ["src/lib/utils/thing.ts"],
	});
	assertEquals(parsed.suites, undefined);
	assertEquals(parsed.filesChanged, ["src/lib/utils/thing.ts"]);
});

Deno.test("run_checks arguments reject a path-unsafe label", () => {
	const result = runChecks.arguments.safeParse({
		worktreePath: "/tmp/somewhere",
		label: "../escape",
	});
	assertEquals(result.success, false);
});

Deno.test("run_checks arguments reject an unknown suite", () => {
	const result = runChecks.arguments.safeParse({
		worktreePath: "/tmp/somewhere",
		label: "task-1",
		suites: ["deploy"],
	});
	assertEquals(result.success, false);
});

Deno.test("run_checks fails fast when worktreePath is not a checkout root", async () => {
	const args = runChecks.arguments.parse({
		worktreePath: "/tmp/definitely-not-a-checkout-root",
		label: "task-1",
	});
	await assertRejects(
		() => runChecks.execute(args, silentContext()),
		TypeError,
		"not a checkout root",
	);
});

Deno.test("verification resource schema accepts a recorded outcome", () => {
	const verification = model.resources.verification.schema.parse({
		ranAt: new Date().toISOString(),
		worktreePath: "/tmp/worktree",
		label: "task-1",
		selection: "derived",
		suites: [{ name: "check", exitCode: 0, passed: true, durationMs: 1200 }],
		failedSuites: [],
		passed: true,
	});
	assertEquals(verification.passed, true);
});
