#!/usr/bin/env -S deno run --no-config --allow-import=raw.githubusercontent.com,jsr.io --allow-read
/** Fixed CLI wrapper for the code-owned Pi lifecycle/session artifact verifier. */
import { resolve } from 'node:path';

import {
	inspectPiRuntimeReceipts,
	PiDispatchOutboxSchema,
	type PiDispatchOutboxContext
} from '../extensions/models/factory-pi-dispatch-outbox.ts';

export async function verifyFactoryPiRuntimeReceipt(input: {
	outbox: unknown;
	repoDir: string;
	piRunId?: string;
	piAsyncRoots?: readonly string[];
	piSessionRoots?: readonly string[];
}): Promise<Awaited<ReturnType<typeof inspectPiRuntimeReceipts>>> {
	const outbox = PiDispatchOutboxSchema.parse(input.outbox);
	const context: PiDispatchOutboxContext = {
		globalArgs: {
			sourceFactoryId: outbox.sourceFactoryId,
			profileModelName: outbox.profileModelName,
			adapters: {
				failureAuthorizer: { workflow: outbox.failureAuthorizerWorkflow }
			}
		},
		repoDir: resolve(input.repoDir),
		dataRepository: {
			getContent: () =>
				Promise.reject(new Error('Factory reads are not available in runtime-only verification.'))
		},
		readResource: () =>
			Promise.reject(new Error('Resource reads are not available in runtime-only verification.')),
		writeResource: () =>
			Promise.reject(new Error('Resource writes are not available in runtime-only verification.')),
		...(input.piAsyncRoots ? { piAsyncRoots: input.piAsyncRoots } : {}),
		...(input.piSessionRoots ? { piSessionRoots: input.piSessionRoots } : {})
	};
	return inspectPiRuntimeReceipts(outbox, context, input.piRunId);
}

function requiredArgument(args: readonly string[], name: string): string {
	const index = args.indexOf(name);
	const value = index >= 0 ? args[index + 1] : undefined;
	if (!value || value.startsWith('--')) {
		throw new Error(
			'Usage: factory-pi-runtime-receipt.ts --outbox <json-file> --repo <path> [--pi-run-id <id>] [--pi-async-root <path>] [--pi-session-root <path>]'
		);
	}
	return value;
}

function optionalArgument(args: readonly string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index < 0) return undefined;
	return requiredArgument(args, name);
}

if (import.meta.main) {
	const outboxPath = requiredArgument(Deno.args, '--outbox');
	const repoDir = requiredArgument(Deno.args, '--repo');
	const piRunId = optionalArgument(Deno.args, '--pi-run-id');
	const piAsyncRoot = optionalArgument(Deno.args, '--pi-async-root');
	const piSessionRoot = optionalArgument(Deno.args, '--pi-session-root');
	const outbox = JSON.parse(await Deno.readTextFile(outboxPath)) as unknown;
	const result = await verifyFactoryPiRuntimeReceipt({
		outbox,
		repoDir,
		...(piRunId ? { piRunId } : {}),
		...(piAsyncRoot ? { piAsyncRoots: [piAsyncRoot] } : {}),
		...(piSessionRoot ? { piSessionRoots: [piSessionRoot] } : {})
	});
	console.log(JSON.stringify(result, null, 2));
	if (!result.available || result.receipts.length !== 1 || result.relevantArtifactInvalid) {
		Deno.exitCode = 2;
	}
}
