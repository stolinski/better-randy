import { randomUUID } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Publish complete JSON in one rename so concurrent readers never observe a partial write. */
export async function writeUserCompositionFileAtomically(
	path: string,
	contents: string
): Promise<void> {
	const temporaryPath = join(dirname(path), `.${randomUUID()}.tmp`);
	try {
		await writeFile(temporaryPath, contents, 'utf-8');
		await rename(temporaryPath, path);
	} catch (cause) {
		await unlink(temporaryPath).catch(() => undefined);
		throw cause;
	}
}
