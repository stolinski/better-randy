#!/usr/bin/env node
/**
 * url-to-preset — authoring-time scaffold for the `web-document` Surface.
 *
 * Takes a real URL, detects the site (twitter / reddit / wikipedia), scrapes the
 * page's content into the per-site content slots, and emits a valid `supers@1`
 * Preset JSON under src/lib/presets/. The engine never fetches at runtime
 * (frame-determinism) — this baking step runs once at authoring time and writes
 * static content the Preset carries.
 *
 * The hero `[highlight]` span is left for the author to mark by hand: the body is
 * emitted as plain prose and the script prints how to wrap your chosen line.
 *
 *   node scripts/url-to-preset.mjs <url> --pack=<slug> [--force] [--dry-run]
 *
 * Site notes:
 * - wikipedia: clean REST summary API (title + lead extract). Robust.
 * - reddit: the post's `.json` endpoint (subreddit / author / title / selftext).
 *   Reddit blocks some datacenter IPs with a 403 — run from a normal connection;
 *   on block the script falls back to a URL-derived skeleton you fill by hand.
 * - twitter/x: auth-walled, JS-rendered — no clean public scrape. The script
 *   derives the handle + status id from the URL and leaves the tweet body for you.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPackRegistrySlugsFromSource } from '../src/lib/utils/pack-registry-source.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = join(HERE, '..');
const PRESETS_DIR = join(REPOSITORY_ROOT, 'src', 'lib', 'presets');
const PACK_SLUGS = new Set(readPackRegistrySlugsFromSource(REPOSITORY_ROOT));

// A descriptive UA (some sites gate on it); Accept json where the API offers it.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) supers-url-to-preset/1.0';

const SITE_LABEL = {
	twitter: 'Twitter',
	reddit: 'Reddit',
	wikipedia: 'Wikipedia',
	hackernews: 'Hacker News',
	github: 'GitHub',
	youtube: 'YouTube',
	news: 'News article'
};

// Per-site page palette — matches the canonical web-document presets so the
// luminance-driven highlight mode picks dark-ink-punch (dark pages) vs multiply
// (light pages) automatically.
const SITE_TYPOGRAPHY = {
	twitter: { paperColor: '#15202b', inkColor: '#f7f9f9' },
	reddit: { paperColor: '#1a1a1b', inkColor: '#d7dadc' },
	wikipedia: { paperColor: '#ffffff', inkColor: '#202122' },
	hackernews: { paperColor: '#f6f6ef', inkColor: '#1a1a1a' },
	github: { paperColor: '#0d1117', inkColor: '#e6edf3' },
	youtube: { paperColor: '#0f0f0f', inkColor: '#f1f1f1' },
	news: { paperColor: '#ffffff', inkColor: '#121212' }
};

// Known news/editorial outlets → the `news` mock. Any other article URL can be
// forced with `--site=news`.
const NEWS_HOSTS = [
	'theverge.com',
	'nytimes.com',
	'arstechnica.com',
	'wired.com',
	'techcrunch.com',
	'theguardian.com',
	'bbc.com',
	'bbc.co.uk'
];

function fail(message) {
	console.error(`✗ ${message}`);
	process.exit(1);
}

function detectSite(url) {
	const host = new URL(url).hostname.replace(/^www\./, '');
	if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.twitter.com')) {
		return 'twitter';
	}
	if (host === 'reddit.com' || host.endsWith('.reddit.com')) {
		return 'reddit';
	}
	if (host.endsWith('wikipedia.org')) {
		return 'wikipedia';
	}
	if (host === 'news.ycombinator.com') {
		return 'hackernews';
	}
	if (host === 'github.com' || host.endsWith('.github.com')) {
		return 'github';
	}
	if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
		return 'youtube';
	}
	if (NEWS_HOSTS.some((newsHost) => host === newsHost || host.endsWith(`.${newsHost}`))) {
		return 'news';
	}
	return null;
}

/** Strip HTML to plain text (HN comment bodies arrive as HTML). */
function htmlToText(html) {
	return (html ?? '')
		.replace(/<\s*p\s*>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&gt;/g, '>')
		.replace(/&lt;/g, '<')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&nbsp;/g, ' ')
		.trim();
}

/** Lightly de-markdown GitHub bodies into plain prose for the card. */
function stripMarkdown(md) {
	return (md ?? '')
		.replace(/```[\s\S]*?```/g, '') // drop fenced code blocks
		.replace(/`([^`]+)`/g, '$1') // inline code
		.replace(/^#{1,6}\s+/gm, '') // headings
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
		.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // emphasis
		.replace(/^>\s?/gm, '') // blockquotes
		.replace(/\r/g, '')
		.trim();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO timestamp → "Jun 22". */
function formatShortDate(iso) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return '';
	}
	return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** ISO timestamp → "Jun 22, 2026". */
function formatLongDate(iso) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return '';
	}
	return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function decodeEntities(value) {
	return (value ?? '')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.trim();
}

async function fetchText(url) {
	const res = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} from ${stripUrl(url)}`);
	}
	return res.text();
}

/** Read a <meta property|name="key" content="…"> value (either attribute order). */
function readMeta(html, key) {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const forward = new RegExp(
		`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
		'i'
	);
	const reverse = new RegExp(
		`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`,
		'i'
	);
	const match = html.match(forward) ?? html.match(reverse);
	return match ? decodeEntities(match[1]) : '';
}

function stripUrl(value) {
	return value.replace(/^https?:\/\//, '').replace(/^www\./, '');
}

function slugify(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

/** Trim body copy to a few sentences, cutting on a sentence boundary when possible. */
function clampText(raw, max = 460) {
	const text = (raw ?? '')
		.replace(/\r/g, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	if (text.length <= max) {
		return text;
	}
	const window = text.slice(0, max);
	const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
	if (lastStop > max * 0.5) {
		return window.slice(0, lastStop + 1).trim();
	}
	return `${window.trim()}…`;
}

/** created_utc (seconds) → Reddit-style relative age ("6h", "2d", "3mo"). */
function timeAgo(unixSeconds, nowMs) {
	if (!unixSeconds) {
		return '';
	}
	const seconds = Math.max(0, Math.floor(nowMs / 1000 - unixSeconds));
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${Math.max(1, minutes)}m`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h`;
	}
	const days = Math.floor(hours / 24);
	if (days < 30) {
		return `${days}d`;
	}
	const months = Math.floor(days / 30);
	if (months < 12) {
		return `${months}mo`;
	}
	return `${Math.floor(months / 12)}y`;
}

async function fetchJson(url) {
	const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} from ${stripUrl(url)}`);
	}
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`non-JSON response from ${stripUrl(url)} (likely a block page)`);
	}
}

async function scrapeWikipedia(url) {
	const parsed = new URL(url);
	const title = decodeURIComponent(parsed.pathname.replace(/^\/wiki\//, ''));
	const api = `${parsed.origin}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
	const data = await fetchJson(api);
	const articleTitle = data.title ?? title.replace(/_/g, ' ');
	const pageUrl = data.content_urls?.desktop?.page ?? url;
	return {
		slug: slugify(articleTitle),
		titleForName: articleTitle,
		content: {
			title: articleTitle,
			// Section heading slot (`kicker`) — left empty for the author to set.
			sourceUrl: stripUrl(pageUrl),
			body: clampText(data.extract)
		}
	};
}

async function scrapeReddit(url, nowMs) {
	const parsed = new URL(url);
	const jsonUrl = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}.json`;
	const data = await fetchJson(jsonUrl);
	const post = Array.isArray(data) ? data?.[0]?.data?.children?.[0]?.data : undefined;
	if (!post) {
		throw new Error('could not find a post in the Reddit response');
	}
	const title = post.title ?? '';
	return {
		slug: slugify(title || post.id || 'post'),
		titleForName: title,
		content: {
			source: post.subreddit_name_prefixed ?? (post.subreddit ? `r/${post.subreddit}` : ''),
			author: post.author ? `u/${post.author}` : '',
			dateLabel: timeAgo(post.created_utc, nowMs),
			title,
			sourceUrl: stripUrl(`reddit.com${post.permalink ?? parsed.pathname}`),
			body: clampText(post.selftext) || '(This post had no body text — add a caption and mark the hero span.)'
		}
	};
}

function scrapeTwitterFromUrl(url) {
	const parsed = new URL(url);
	const parts = parsed.pathname.split('/').filter(Boolean);
	const handle = parts[0] ?? '';
	const statusId = parts[2] ?? '';
	return {
		slug: slugify(`${handle || 'tweet'}-${statusId}`),
		titleForName: handle ? `@${handle}` : 'tweet',
		needsManualBody: true,
		content: {
			author: handle,
			source: handle ? `@${handle}` : '',
			sourceUrl: stripUrl(url),
			body: 'Paste the tweet text here, then wrap your hero line in [highlight]…[/highlight].'
		}
	};
}

async function scrapeHackerNews(url, nowMs) {
	const id = new URL(url).searchParams.get('id');
	if (!id) {
		throw new Error('no item id in the Hacker News URL (?id=…)');
	}
	const item = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
	if (!item) {
		throw new Error(`Hacker News item ${id} not found`);
	}
	const isStory = item.type === 'story';
	const bodyText = isStory ? item.text ?? item.title ?? '' : htmlToText(item.text);
	return {
		slug: slugify(item.title ? item.title : `hn-${id}`),
		titleForName: item.title ?? item.by ?? `item ${id}`,
		content: {
			// Story headline as the context line for a comment; the story's own
			// title for a story post.
			title: isStory ? item.title ?? '' : '',
			source: item.by ?? '',
			dateLabel: timeAgo(item.time, nowMs),
			sourceUrl: stripUrl(`news.ycombinator.com/item?id=${id}`),
			body: clampText(htmlToText(bodyText)) || '(No text on this item — add a caption and mark the hero span.)'
		}
	};
}

async function scrapeGitHub(url) {
	const parsed = new URL(url);
	const parts = parsed.pathname.split('/').filter(Boolean);
	const [owner, repo, kind, number] = parts;
	if (!owner || !repo || !number || !(kind === 'issues' || kind === 'pull')) {
		throw new Error('expected a github.com/<owner>/<repo>/issues|pull/<number> URL');
	}
	// The issues endpoint serves both issues and PRs.
	const api = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
	const data = await fetchJson(api);
	const stateLabel = data.pull_request ? 'opened a pull request' : 'opened this issue';
	return {
		slug: slugify(`${repo}-${data.title ?? number}`),
		titleForName: data.title ?? `${repo}#${number}`,
		content: {
			source: `${owner}/${repo}`,
			title: data.title ?? '',
			author: data.user?.login ?? '',
			dateLabel: data.created_at ? `${stateLabel} · ${formatShortDate(data.created_at)}` : '',
			sourceUrl: stripUrl(data.html_url ?? url),
			body: clampText(stripMarkdown(data.body)) || '(No description — add a caption and mark the hero span.)'
		}
	};
}

async function scrapeYouTube(url) {
	// oEmbed gives the video title + channel (no comment data without the Data
	// API + key), so the comment author + body are left for the author to fill.
	const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
	const data = await fetchJson(oembed);
	const videoTitle = data.title ?? '';
	return {
		slug: slugify(videoTitle || 'youtube'),
		titleForName: videoTitle || data.author_name || 'video',
		needsManualBody: true,
		content: {
			title: videoTitle,
			author: '@your_handle',
			dateLabel: '2 days ago',
			sourceUrl: stripUrl(url),
			body: 'Paste the YouTube comment here, then wrap your hero line in [highlight]…[/highlight].'
		}
	};
}

async function scrapeNews(url) {
	const html = await fetchText(url);
	const title = readMeta(html, 'og:title') || readMeta(html, 'twitter:title');
	const publication = readMeta(html, 'og:site_name') || new URL(url).hostname.replace(/^www\./, '');
	const author = readMeta(html, 'article:author') || readMeta(html, 'author');
	const published = readMeta(html, 'article:published_time') || readMeta(html, 'date');
	const description = readMeta(html, 'og:description') || readMeta(html, 'description');
	if (!title) {
		throw new Error('no og:title meta tag found');
	}
	return {
		slug: slugify(title),
		titleForName: title,
		content: {
			source: publication,
			title,
			// article:author is sometimes a URL; only keep a plain name.
			author: /^https?:/i.test(author) ? '' : author,
			dateLabel: formatLongDate(published),
			sourceUrl: stripUrl(url),
			body: clampText(description) || 'Paste the article excerpt here, then mark the hero [highlight] span.'
		}
	};
}

/** Drop empty-string slots so the emitted content carries only what it uses. */
function pruneContent(content) {
	return Object.fromEntries(Object.entries(content).filter(([, value]) => value !== ''));
}

function buildPreset({ site, pack, titleForName, content }) {
	return {
		schema: 'supers@1',
		name: `Web document — ${SITE_LABEL[site]}: ${titleForName}`,
		description: `Authored from a URL by scripts/url-to-preset.mjs. Faithful ${SITE_LABEL[site]} look on a transparent overlay; the hero [highlight] span is hand-marked. Emissive screen optics come from the web-document shaderPass, not Pack chrome. ~6s: card settles in, the highlighter draws over the hero line, then a static hold a creator can freeze/extend.`,
		pack,
		kind: 'fixture',
		state: {
			transport: { orientation: 'horizontal', durationSeconds: 6, fps: 30, format: 'webm' },
			typography: { fontFamily: 'sans', ...SITE_TYPOGRAPHY[site] },
			marks: {
				defaults: { highlight: { color: '#fabf47', intensity: 0.62 } },
				timings: [{ start: 0.2, duration: 0.2, ease: 'smooth' }]
			},
			surface: {
				type: 'web-document',
				site,
				content: pruneContent(content),
				enter: { start: 0, duration: 0.07, ease: 'settled' }
			},
			overlays: [],
			effects: []
		}
	};
}

async function main() {
	const argv = process.argv.slice(2);
	const flags = new Set(argv.filter((a) => a.startsWith('--')));
	const url = argv.find((a) => !a.startsWith('--'));
	if (!url) {
		fail('usage: node scripts/url-to-preset.mjs <url> --pack=<slug> [--force] [--dry-run]');
	}
	const pack = (argv.find((a) => a.startsWith('--pack=')) ?? '').split('=')[1];
	if (!pack || !PACK_SLUGS.has(pack)) {
		fail(`--pack must name a registered Pack: ${[...PACK_SLUGS].sort().join(', ')}`);
	}

	// `--site=<name>` forces a site (e.g. a news outlet not in NEWS_HOSTS).
	const siteOverride = (argv.find((a) => a.startsWith('--site=')) ?? '').split('=')[1];
	let site;
	try {
		site = siteOverride || detectSite(url);
	} catch {
		fail(`not a valid URL: ${url}`);
	}
	if (!site || !SITE_TYPOGRAPHY[site]) {
		fail(
			`unsupported site — use a URL from a known host, or pass --site=<${Object.keys(SITE_TYPOGRAPHY).join('|')}>: ${url}`
		);
	}

	// Date.now() is fine here — this is a one-shot authoring step, not engine render.
	const nowMs = Date.now();

	let scraped;
	let note = '';
	try {
		if (site === 'wikipedia') {
			scraped = await scrapeWikipedia(url);
		} else if (site === 'reddit') {
			scraped = await scrapeReddit(url, nowMs);
		} else if (site === 'hackernews') {
			scraped = await scrapeHackerNews(url, nowMs);
		} else if (site === 'github') {
			scraped = await scrapeGitHub(url);
		} else if (site === 'youtube') {
			scraped = await scrapeYouTube(url);
			note = 'YouTube comments need the Data API — the comment author + body are placeholders; paste the real text.';
		} else if (site === 'news') {
			scraped = await scrapeNews(url);
		} else {
			scraped = scrapeTwitterFromUrl(url);
			note = 'X/Twitter is auth-walled — the tweet body is a placeholder; paste the real text.';
		}
	} catch (error) {
		if (site === 'twitter') {
			throw error;
		}
		// Reddit/Wikipedia fetch failed (block page, offline, deleted post) — emit a
		// URL-derived skeleton so authoring can continue by hand.
		const parsed = new URL(url);
		scraped = {
			slug: slugify(parsed.pathname.split('/').filter(Boolean).join('-') || site),
			titleForName: 'untitled',
			content: {
				sourceUrl: stripUrl(url),
				body: 'Fetch failed — fill the content slots by hand, then mark the hero [highlight] span.'
			}
		};
		note = `couldn't scrape ${SITE_LABEL[site]} (${error.message}); emitted a skeleton to fill by hand.`;
	}

	const preset = buildPreset({
		site,
		pack,
		titleForName: scraped.titleForName,
		content: scraped.content
	});

	const fileName = `web-document-${site}-${scraped.slug}.json`;
	const outPath = join(PRESETS_DIR, fileName);
	const json = `${JSON.stringify(preset, null, '\t')}\n`;

	if (flags.has('--dry-run')) {
		console.log(json);
		console.log(`(dry run — would write src/lib/presets/${fileName})`);
		return;
	}
	if (existsSync(outPath) && !flags.has('--force')) {
		fail(`${fileName} already exists — pass --force to overwrite.`);
	}
	writeFileSync(outPath, json);

	console.log(`✓ wrote src/lib/presets/${fileName}`);
	console.log(`  site: ${site} · slug: ${scraped.slug} · pack: ${pack}`);
	if (note) {
		console.log(`  note: ${note}`);
	}
	console.log(`  next: open /p/${fileName.replace(/\.json$/, '')} and wrap your hero line in [highlight]…[/highlight].`);
}

main().catch((error) => fail(error.message));
