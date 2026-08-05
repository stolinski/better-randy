// Reads NUL-delimited `git status --porcelain=v1 -z` bytes from stdin.
import { classifyChangeImpact, parseGitWorkingTreeStatus } from './change-impact-classifier.ts';

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const markerIndex = process.argv.indexOf('--committed-paths-json');
if (markerIndex === -1 || !process.argv[markerIndex + 1]) {
	throw new TypeError(
		'Expected --committed-paths-json with a JSON array of project-relative paths'
	);
}
const committedPaths: unknown = JSON.parse(process.argv[markerIndex + 1]);
if (!Array.isArray(committedPaths) || !committedPaths.every((entry) => typeof entry === 'string')) {
	throw new TypeError('--committed-paths-json must be a JSON array of strings');
}
const paths = [
	...committedPaths,
	...parseGitWorkingTreeStatus(Buffer.concat(chunks).toString('utf8'))
];

console.log(
	JSON.stringify(
		{
			audit: 'change-impact',
			generatedAt: new Date().toISOString(),
			source: 'git-baseline-and-working-tree',
			...classifyChangeImpact(paths)
		},
		null,
		2
	)
);
