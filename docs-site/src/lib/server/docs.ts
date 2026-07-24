import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, posix } from 'node:path';

import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import Shiki from '@shikijs/markdown-it';
import type { BundledLanguage } from 'shiki';

// shiki accepts the special 'txt' language at runtime; the plugin's option type doesn't admit it
const PLAINTEXT = 'txt' as unknown as BundledLanguage;

const DOCS_DIR = resolve(process.cwd(), '..', 'docs');
const REPO_BLOB = 'https://github.com/stolinski/better-randy/blob/main';

/** docs/aesthetic.md is a redirect stub — every link to it should land on the real doc. */
const LINK_ALIASES: Record<string, string> = {
	'aesthetic.md': 'packs/syntax/aesthetic.md'
};

const TITLE_OVERRIDES: Record<string, string> = {
	'README.md': 'Overview',
	'CONTEXT.md': 'Glossary',
	'roadmap.md': 'Roadmap',
	'adr/README.md': 'ADR index',
	'briefs/README.md': 'Writing a Brief',
	'packs/syntax/aesthetic.md': 'Syntax',
	'packs/crt-terminal/aesthetic.md': 'CRT Terminal',
	'packs/editorial-mono/aesthetic.md': 'Editorial Mono',
	'packs/clean-light/aesthetic.md': 'Clean Light'
};

export interface DocMeta {
	file: string;
	href: string;
	title: string;
	section: string;
	badge?: string;
}

export interface NavSection {
	label: string;
	items: DocMeta[];
}

export interface DocHeading {
	depth: number;
	id: string;
	text: string;
}

export interface DocPage {
	meta: DocMeta;
	html: string;
	headings: DocHeading[];
	prev: DocMeta | null;
	next: DocMeta | null;
}

export interface SearchEntry {
	title: string;
	href: string;
	section: string;
	text: string;
}

function listDir(dir: string, filter: (name: string) => boolean = () => true): string[] {
	const abs = resolve(DOCS_DIR, dir);
	if (!existsSync(abs)) return [];
	return readdirSync(abs)
		.filter((name) => name.endsWith('.md') && filter(name))
		.sort()
		.map((name) => posix.join(dir, name));
}

function fileToHref(file: string): string {
	if (file === 'README.md') return '/overview';
	if (file.endsWith('/README.md')) return '/' + posix.dirname(file);
	return '/' + file.replace(/\.md$/, '');
}

function readTitle(file: string): string {
	const override = TITLE_OVERRIDES[file];
	if (override) return override;
	const src = readFileSync(resolve(DOCS_DIR, file), 'utf-8');
	const match = src.match(/^#\s+(.+)$/m);
	const raw = match ? match[1].replace(/[*`]/g, '').trim() : file;
	// nav titles stay short: drop ADR-number and Supers prefixes, then the "— subtitle" tail
	return raw
		.replace(/^ADR-\d+\s*[—:]\s*/, '')
		.replace(/^Supers\s+/, '')
		.replace(/\s*[—:]\s+.*$/, '');
}

function buildNav(): NavSection[] {
	const adrs = listDir('adr', (n) => n !== 'README.md');
	const briefs = listDir('briefs', (n) => n !== 'README.md');
	const ideas = listDir('ideas');
	const packs = ['packs/syntax', 'packs/crt-terminal', 'packs/editorial-mono', 'packs/clean-light']
		.flatMap((dir) => listDir(dir));

	const plan: Array<{ label: string; files: string[] }> = [
		{ label: 'Start', files: ['README.md', 'CONTEXT.md', 'roadmap.md'] },
		{ label: 'Engine', files: ['engine-architecture.md', 'html-in-canvas-typegpu.md'] },
		{ label: 'Authoring', files: ['preset-format.md', 'briefs/README.md', ...briefs] },
		{ label: 'Quality', files: ['quality-rubric.md', 'animation-rubric.md', 'critic.md'] },
		{ label: 'Packs', files: packs },
		{ label: 'Ideas', files: ideas },
		{ label: 'Decisions', files: ['adr/README.md', ...adrs] }
	];

	return plan.map(({ label, files }) => ({
		label,
		items: files
			.filter((file) => existsSync(resolve(DOCS_DIR, file)))
			.map((file) => {
				const adrNum = file.match(/^adr\/(\d{4})-/)?.[1];
				return {
					file,
					href: fileToHref(file),
					title: readTitle(file),
					section: label,
					...(adrNum ? { badge: adrNum } : {})
				};
			})
	}));
}

/** Every renderable doc, nav-listed or not (e.g. critic-captures, the aesthetic stub). */
function listAllFiles(): string[] {
	const walk = (dir: string): string[] => {
		const abs = resolve(DOCS_DIR, dir);
		return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
			const rel = dir ? posix.join(dir, entry.name) : entry.name;
			if (entry.isDirectory()) return entry.name === 'inspo' ? [] : walk(rel);
			return entry.name.endsWith('.md') ? [rel] : [];
		});
	};
	return walk('');
}

function rewriteHref(href: string, currentFile: string): string {
	if (/^(https?:|mailto:|#)/.test(href)) return href;
	const [path, hash] = href.split('#');
	const suffix = hash ? '#' + hash : '';
	const dir = posix.dirname(currentFile);
	let target = posix.normalize(posix.join(dir === '.' ? '' : dir, path));
	if (target.startsWith('..')) {
		const repoPath = posix.normalize(posix.join('docs', dir === '.' ? '' : dir, path));
		return repoPath.startsWith('..') ? href : `${REPO_BLOB}/${repoPath}${suffix}`;
	}
	target = LINK_ALIASES[target] ?? target;
	if (target.endsWith('.md')) {
		// stale links in historical ADRs point at deleted docs — send those to GitHub, not a 404
		if (!existsSync(resolve(DOCS_DIR, target))) return `${REPO_BLOB}/docs/${target}`;
		return fileToHref(target) + suffix;
	}
	if (existsSync(resolve(DOCS_DIR, target, 'README.md'))) return fileToHref(posix.join(target, 'README.md'));
	return `${REPO_BLOB}/docs/${target}${suffix}`;
}

let enginePromise: Promise<MarkdownIt> | null = null;

function getEngine(): Promise<MarkdownIt> {
	enginePromise ??= (async () => {
		// linkify stays off: bare file names like CLAUDE.md would autolink (.md is a TLD)
		const md = new MarkdownIt({ html: true });
		md.use(
			await Shiki({
				theme: 'poimandres',
				fallbackLanguage: PLAINTEXT,
				defaultLanguage: PLAINTEXT
			})
		);
		md.use(anchor, {
			// GitHub's slug algorithm — docs hand-author cross-links like `#q15-…--never-pop`,
			// so each removed punctuation run must leave its double hyphen behind
			slugify: (s: string) =>
				s
					.toLowerCase()
					.trim()
					.replace(/[^\w\s-]/g, '')
					.replace(/\s/g, '-'),
			permalink: anchor.permalink.linkInsideHeader({ symbol: '#', class: 'h-anchor', placement: 'after' })
		});

		md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
		md.renderer.rules.table_close = () => '</table></div>';

		const defaultLinkOpen =
			md.renderer.rules.link_open ??
			((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
		md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
			const token = tokens[idx];
			const href = token.attrGet('href');
			if (href) {
				const rewritten = rewriteHref(href, env.file as string);
				token.attrSet('href', rewritten);
				if (/^https?:/.test(rewritten)) {
					token.attrSet('target', '_blank');
					token.attrSet('rel', 'noopener');
				}
			}
			return defaultLinkOpen(tokens, idx, options, env, self);
		};
		return md;
	})();
	return enginePromise;
}

function extractHeadings(html: string): DocHeading[] {
	const headings: DocHeading[] = [];
	for (const match of html.matchAll(/<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)) {
		const text = match[3]
			.replace(/<a[^>]*class="h-anchor"[\s\S]*?<\/a>/g, '')
			.replace(/<[^>]+>/g, '')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.trim();
		headings.push({ depth: Number(match[1]), id: match[2], text });
	}
	return headings;
}

function flattenNav(nav: NavSection[]): DocMeta[] {
	return nav.flatMap((section) => section.items);
}

export function getNav(): NavSection[] {
	return buildNav();
}

export function getAllHrefs(): string[] {
	return listAllFiles().map(fileToHref);
}

export async function getDoc(slug: string): Promise<DocPage | null> {
	const href = '/' + slug;
	const file = listAllFiles().find((f) => fileToHref(f) === href);
	if (!file) return null;

	const md = await getEngine();
	const src = readFileSync(resolve(DOCS_DIR, file), 'utf-8');
	const html = md.render(src, { file });

	const nav = buildNav();
	const flat = flattenNav(nav);
	const index = flat.findIndex((item) => item.href === href);
	const meta = index >= 0 ? flat[index] : { file, href, title: readTitle(file), section: '' };

	return {
		meta,
		html,
		headings: extractHeadings(html),
		prev: index > 0 ? flat[index - 1] : null,
		next: index >= 0 && index < flat.length - 1 ? flat[index + 1] : null
	};
}

export function getSearchIndex(): SearchEntry[] {
	return flattenNav(buildNav()).map((item) => {
		const src = readFileSync(resolve(DOCS_DIR, item.file), 'utf-8');
		const text = src
			.replace(/```[\s\S]*?```/g, ' ')
			.replace(/^#.*$/m, ' ')
			.replace(/[#>*`_[\]|]/g, ' ')
			.replace(/\(([^)]*)\)/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 4000);
		return { title: item.title, href: item.href, section: item.section, text };
	});
}
