// Focused fixtures for scripts/planning-state-checks.ts — one deliberately
// dirty fixture per planning-drift class plus a clean baseline, so the
// @supers/repo-audit audit-planning method is proven to go red with actionable
// paths and green on a reconciled repository.
//
// Run: node --experimental-strip-types --test scripts/planning-state-checks.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	classifyAdrStatus,
	runPlanningStateChecks,
	type PlanningDexTask,
	type PlanningStateInputs
} from './planning-state-checks.ts';

function adrDoc(number: string, statusLine: string): { path: string; markdown: string } {
	return {
		path: `docs/adr/${number}-fixture-decision.md`,
		markdown: `# ADR-${number} — Fixture decision\n\n## Status\n\n**${statusLine}**\n\n## Context\n\nFixture.\n`
	};
}

function adrIndexRow(number: string, statusCell: string): string {
	return `| [${number}](${number}-fixture-decision.md) | ${statusCell} | Fixture decision |`;
}

function dexTask(overrides: Partial<PlanningDexTask> & { id: string }): PlanningDexTask {
	return {
		parentId: null,
		name: `Task ${overrides.id}`,
		description: '',
		priority: 1,
		completed: false,
		started: false,
		blockedBy: [],
		...overrides
	};
}

function cleanInputs(): PlanningStateInputs {
	return {
		roadmap: {
			path: 'docs/roadmap.md',
			markdown: [
				'# Roadmap',
				'',
				'1. ✅ **shipped** ([ADR-0001](adr/0001-fixture-decision.md)) — the fixture arc.',
				'2. Designed backlog: [ADR-0002](adr/0002-fixture-decision.md).'
			].join('\n')
		},
		adrIndex: {
			path: 'docs/adr/README.md',
			markdown: [
				'# ADR index',
				'',
				'| ADR | Status | Decision |',
				'| --- | --- | --- |',
				adrIndexRow('0001', 'Canon (built)'),
				adrIndexRow('0002', 'Designed, not built')
			].join('\n')
		},
		adrDocs: [adrDoc('0001', 'Canon (built).'), adrDoc('0002', 'Designed, not built.')],
		briefDocs: [
			{
				path: 'docs/briefs/pending-piece.md',
				markdown: '# Pending piece\n\n**Kind:** preset\n**Slug:** pending-piece\n'
			}
		],
		ideaIndex: {
			path: 'docs/ideas/README.md',
			markdown: '# Ideas\n\n- [`speculative-thing.md`](speculative-thing.md) — pure speculation.\n'
		},
		ideaDocs: [
			{
				path: 'docs/ideas/speculative-thing.md',
				markdown: '# Speculative thing\n\nNot designed or scheduled.\n'
			}
		],
		historyIndex: {
			path: 'docs/history/README.md',
			markdown: '# History\n\n- [`old-exploration.md`](old-exploration.md) — settled.\n'
		},
		historyDocs: [
			{ path: 'docs/history/old-exploration.md', markdown: '# Old exploration\n\nSettled.\n' }
		],
		presets: [
			{ slug: 'shipped-deliverable', kind: 'deliverable' },
			{ slug: 'reflow-proof', kind: 'fixture' }
		],
		dexTasks: [
			dexTask({ id: 'epicroot', name: 'Fixture epic' }),
			dexTask({ id: 'leafnext', parentId: 'epicroot', name: 'Next strategic move' }),
			dexTask({
				id: 'gatedone',
				parentId: 'epicroot',
				blockedBy: ['leafnext'],
				name: 'Gated follow-up'
			}),
			dexTask({ id: 'lowprio', priority: 5, name: 'Demand-pulled polish' })
		]
	};
}

test('clean baseline produces no findings and no advisories', () => {
	const result = runPlanningStateChecks(cleanInputs());
	assert.deepEqual(result.findings, []);
	assert.deepEqual(result.advisories, []);
	assert.deepEqual(result.runway, {
		activeTaskId: null,
		activeTaskName: null,
		activeEpicId: 'epicroot',
		nextTaskId: 'leafnext',
		nextTaskName: 'Next strategic move',
		topPriority: 1,
		readyLeafCount: 2
	});
});

test('classifyAdrStatus prefix-matches and ignores qualifier text', () => {
	assert.equal(classifyAdrStatus('Canon (gate partly build-harness)'), 'canon');
	assert.equal(classifyAdrStatus('Superseded -> Starter templates in 0032'), 'superseded');
	assert.equal(classifyAdrStatus('Build-harness.'), 'build-harness');
	assert.equal(classifyAdrStatus('Designed, not built'), 'designed');
	assert.equal(classifyAdrStatus('Accepted'), 'unknown');
});

test('ADR missing from the index is a coverage finding', () => {
	const inputs = cleanInputs();
	inputs.adrDocs.push(adrDoc('0003', 'Canon.'));
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'adr-index-coverage');
	assert.match(result.findings[0].message, /ADR 0003/);
});

test('index row pointing at a missing ADR file is a coverage finding', () => {
	const inputs = cleanInputs();
	inputs.adrIndex.markdown += `\n${adrIndexRow('0009', 'Canon')}`;
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'adr-index-coverage');
	assert.match(result.findings[0].message, /0009/);
});

test('index/file status category disagreement is status drift', () => {
	const inputs = cleanInputs();
	inputs.adrDocs[1] = adrDoc('0002', 'Canon (built).');
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'adr-status-drift');
	assert.deepEqual(result.findings[0].paths, [
		'docs/adr/README.md',
		'docs/adr/0002-fixture-decision.md'
	]);
});

test('unclassifiable ADR status line is status drift', () => {
	const inputs = cleanInputs();
	inputs.adrDocs.push({
		path: 'docs/adr/0004-fixture-decision.md',
		markdown: '# ADR-0004\n\n## Status\n\n**Accepted.**\n'
	});
	inputs.adrIndex.markdown += `\n${adrIndexRow('0004', 'Canon')}`;
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'adr-status-drift');
	assert.deepEqual(result.findings[0].paths, ['docs/adr/0004-fixture-decision.md']);
});

test('roadmap reference to a nonexistent ADR is a reference finding', () => {
	const inputs = cleanInputs();
	inputs.roadmap.markdown += '\nAlso see ADR-0099 for the missing decision.';
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'roadmap-adr-reference');
	assert.match(result.findings[0].message, /ADR-0099/);
});

test('roadmap shipped claim against a designed ADR is a ship-claim finding', () => {
	const inputs = cleanInputs();
	inputs.roadmap.markdown += '\n3. ✅ **shipped** ([ADR-0002](adr/0002-fixture-decision.md)).';
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'roadmap-ship-claim');
	assert.deepEqual(result.findings[0].paths, [
		'docs/roadmap.md',
		'docs/adr/0002-fixture-decision.md'
	]);
});

test('Brief whose filename slug matches a shipped deliverable is stale', () => {
	const inputs = cleanInputs();
	inputs.briefDocs.push({
		path: 'docs/briefs/shipped-deliverable.md',
		markdown: '# Shipped deliverable\n\n**Kind:** preset\n**Slug:** shipped-deliverable\n'
	});
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'stale-brief');
	assert.deepEqual(result.findings[0].paths, [
		'docs/briefs/shipped-deliverable.md',
		'src/lib/presets/shipped-deliverable.json'
	]);
});

test('Brief with a shipped declared verification preset is stale; fixture targets are not', () => {
	const inputs = cleanInputs();
	inputs.briefDocs.push({
		path: 'docs/briefs/pipeline-idea.md',
		markdown:
			'# Pipeline idea\n\n**Kind:** pipeline\n**Slug:** pipeline-idea\n\nVerification preset: `shipped-deliverable`.\n'
	});
	inputs.briefDocs.push({
		path: 'docs/briefs/reflow-proof.md',
		markdown: '# Reflow proof\n\n**Kind:** preset\n**Slug:** reflow-proof\n'
	});
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'stale-brief');
	assert.match(result.findings[0].message, /pipeline-idea/);
});

test('idea file absent from the README index is an inventory finding', () => {
	const inputs = cleanInputs();
	inputs.ideaDocs.push({ path: 'docs/ideas/unlisted-idea.md', markdown: '# Unlisted idea\n' });
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'ideas-inventory');
	assert.match(result.findings[0].message, /unlisted-idea\.md/);
});

test('history README link without a file is an inventory finding', () => {
	const inputs = cleanInputs();
	inputs.historyDocs = [];
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'ideas-inventory');
	assert.match(result.findings[0].message, /old-exploration\.md/);
});

test('idea doc declaring shipped status is a historical-tier finding', () => {
	const inputs = cleanInputs();
	inputs.ideaDocs[0].markdown += '\nStatus: shipped 2026-07-01.\n';
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'ideas-historical');
	assert.deepEqual(result.findings[0].paths, ['docs/ideas/speculative-thing.md']);
});

test('open task claiming completion in its NAME is a gating finding', () => {
	const inputs = cleanInputs();
	inputs.dexTasks.push(dexTask({ id: 'loudclaim', priority: 2, name: 'Depth stage ✅ COMPLETE' }));
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'dex-shipped-claim');
	assert.deepEqual(result.findings[0].paths, ['dex:loudclaim']);
});

test('open task describing DONE work in its description is an advisory, not a finding', () => {
	const inputs = cleanInputs();
	inputs.dexTasks.push(
		dexTask({
			id: 'halfdone',
			priority: 2,
			name: 'Probe gaps',
			description: 'TWO halves. (1) PROBES [DONE 2026-06-21, commit pending].'
		})
	);
	const result = runPlanningStateChecks(inputs);
	assert.deepEqual(result.findings, []);
	assert.equal(result.advisories.length, 1);
	assert.equal(result.advisories[0].check, 'dex-shipped-claim');
	assert.deepEqual(result.advisories[0].paths, ['dex:halfdone']);
});

test('prose-case "Done when" and "shipped" never trip the completion markers', () => {
	const inputs = cleanInputs();
	inputs.dexTasks.push(
		dexTask({
			id: 'prosetask',
			priority: 2,
			name: 'Wire the shipped-state gate',
			description: '## Done when\nThe gate matches shipped truth and is done.'
		})
	);
	const result = runPlanningStateChecks(inputs);
	assert.deepEqual(result.findings, []);
	assert.deepEqual(result.advisories, []);
});

test('completed task still blocked by an open task is a blocker contradiction', () => {
	const inputs = cleanInputs();
	inputs.dexTasks.push(
		dexTask({ id: 'sweptdone', completed: true, blockedBy: ['epicroot'], name: 'Early sweep' })
	);
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'dex-blocker-contradiction');
	assert.deepEqual(result.findings[0].paths, ['dex:sweptdone', 'dex:epicroot']);
});

test('open task whose blocker already completed is dex-normal, not drift', () => {
	const inputs = cleanInputs();
	inputs.dexTasks.push(
		dexTask({ id: 'formerblocker', completed: true, name: 'Landed dependency' }),
		dexTask({ id: 'nowready', priority: 2, blockedBy: ['formerblocker'], name: 'Follow-up' })
	);
	const result = runPlanningStateChecks(inputs);
	assert.deepEqual(result.findings, []);
});

test('two co-equal top-priority unstarted ready leaves break the runway rule', () => {
	const inputs = cleanInputs();
	inputs.dexTasks.push(dexTask({ id: 'rivalleaf', name: 'Co-equal strategic leaf' }));
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'dex-ready-runway');
	assert.deepEqual(result.findings[0].paths.sort(), ['dex:leafnext', 'dex:rivalleaf']);
});

test('a started leaf counts as being worked, not as a co-equal next move', () => {
	const inputs = cleanInputs();
	inputs.dexTasks.push(dexTask({ id: 'activeleaf', started: true, name: 'In-flight work' }));
	const result = runPlanningStateChecks(inputs);
	assert.deepEqual(result.findings, []);
	assert.equal(result.runway.activeTaskId, 'activeleaf');
	assert.equal(result.runway.activeEpicId, 'activeleaf');
	assert.equal(result.runway.nextTaskId, 'leafnext');
});

test('multiple started leaves break the factory WIP limit', () => {
	const inputs = cleanInputs();
	inputs.dexTasks.push(
		dexTask({ id: 'activeone', started: true, name: 'First active leaf' }),
		dexTask({ id: 'activetwo', started: true, name: 'Second active leaf' })
	);
	const result = runPlanningStateChecks(inputs);
	assert.equal(result.findings.length, 1);
	assert.equal(result.findings[0].check, 'dex-active-work');
	assert.equal(result.runway.activeTaskId, null);
});
