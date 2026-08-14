import assert from 'node:assert/strict';
import test from 'node:test';

import factoryCockpit from './index.ts';

test('extension registers telemetry lifecycle hooks and cockpit commands', () => {
	const events: string[] = [];
	const commands: string[] = [];
	const api = {
		on(name: string) {
			events.push(name);
		},
		registerCommand(name: string) {
			commands.push(name);
		}
	};

	factoryCockpit(api as never);

	assert.deepEqual(events, [
		'before_agent_start',
		'turn_start',
		'before_provider_request',
		'tool_execution_start',
		'tool_execution_end',
		'turn_end',
		'agent_end',
		'session_compact'
	]);
	assert.deepEqual(commands, ['factory-cockpit', 'factory-skills']);
});
