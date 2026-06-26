#!/usr/bin/env node
/**
 * url-to-preset — authoring-time scaffold for the `web-document` Surface.
 *
 * Takes a real URL, detects the site (twitter / reddit / wikipedia), scrapes the
 * page's content into the per-site content slots, and emits a valid `hiviz@1`
 * Preset JSON under src/lib/presets/. The engine never fetches at runtime
 * (frame-determinism) — this baking step runs once at authoring time and writes
 * static content the Preset carries.
 *
 * The hero `[highlight]` span is left for the author to mark by hand: the body is
 * emitted as plain prose and the script prints how to wrap your chosen line.
 *
 *   node scripts/url-to-preset.mjs <url> [--vertical] [--force] [--dry-run]
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

const HERE = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(HERE, '..', 'src', 'lib', 'presets');

// A descriptive UA (some sites gate on it); Accept json where the API offers it.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) hiviz-url-to-preset/1.0';

const SITE_LABEL = { twitter: 'Twitter', reddit: 'Reddit', wikipedia: 'Wikipedia' };

// Per-site page palette — matches the canonical web-document presets so the
// luminance-driven highlight mode picks dark-ink-punch (twitter/reddit) vs
// multiply (wikipedia, a light page) automatically.
const SITE_TYPOGRAPHY = {
	twitter: { paperColor: '#15202b', inkColor: '#f7f9f9' },
	reddit: { paperColor: '#1a1a1b', inkColor: '#d7dadc' },
	wikipedia: { paperColor: '#ffffff', inkColor: '#202122' }
};

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
	return null;
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
	const text = (raw ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
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

/** Drop empty-string slots so the emitted content carries only what it uses. */
function pruneContent(content) {
	return Object.fromEntries(Object.entries(content).filter(([, value]) => value !== ''));
}

function buildPreset({ site, orientation, titleForName, content }) {
	return {
		schema: 'hiviz@1',
		name: `Web document — ${SITE_LABEL[site]}: ${titleForName} (${orientation})`,
		description: `Authored from a URL by scripts/url-to-preset.mjs. Faithful ${SITE_LABEL[site]} look on a transparent overlay; the hero [highlight] span is hand-marked. Emissive screen optics come from the web-document shaderPass, not Pack chrome. ~6s: card settles in, the highlighter draws over the hero line, then a static hold a creator can freeze/extend.`,
		pack: 'syntax',
		state: {
			transport: { orientation, durationSeconds: 6, fps: 30, format: 'webm' },
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
		fail('usage: node scripts/url-to-preset.mjs <url> [--vertical] [--force] [--dry-run]');
	}

	let site;
	try {
		site = detectSite(url);
	} catch {
		fail(`not a valid URL: ${url}`);
	}
	if (!site) {
		fail(`unsupported site — URL must be twitter/x, reddit, or wikipedia: ${url}`);
	}

	const orientation = flags.has('--vertical') ? 'vertical' : 'horizontal';
	// Date.now() is fine here — this is a one-shot authoring step, not engine render.
	const nowMs = Date.now();

	let scraped;
	let note = '';
	try {
		if (site === 'wikipedia') {
			scraped = await scrapeWikipedia(url);
		} else if (site === 'reddit') {
			scraped = await scrapeReddit(url, nowMs);
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
		orientation,
		titleForName: scraped.titleForName,
		content: scraped.content
	});

	const suffix = orientation === 'vertical' ? '-vertical' : '';
	const fileName = `web-document-${site}-${scraped.slug}${suffix}.json`;
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
	console.log(`  site: ${site} · slug: ${scraped.slug} · ${orientation}`);
	if (note) {
		console.log(`  note: ${note}`);
	}
	console.log(`  next: open /p/${fileName.replace(/\.json$/, '')} and wrap your hero line in [highlight]…[/highlight].`);
}

main().catch((error) => fail(error.message));
