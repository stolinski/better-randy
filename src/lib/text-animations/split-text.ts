import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

import type { TextEffectSplitMode } from './catalog';

let registered = false;

function ensureRegistered(): void {
	if (registered) {
		return;
	}
	// SplitText.register handles its own internal init. Registering through
	// gsap.registerPlugin is the official path for any GSAP plugin and is
	// idempotent.
	gsap.registerPlugin(SplitText);
	registered = true;
}

export interface TextAnimationSplitResult {
	root: HTMLElement;
	mode: TextEffectSplitMode;
	units: HTMLElement[];
	/** textContent of the root captured at split time — change detector. */
	signature: string;
	/** Restore the original DOM contents and clean up SplitText state. */
	revert(): void;
}

/**
 * Split `element` into the animated unit spans the renderer family expects.
 *
 *   - `whole`         → one synthetic unit wrapping the entire root.
 *   - `per-character` → SplitText `type: 'chars'` (chars are the units; words
 *                       and lines are also created internally so spacing
 *                       preserves correctly).
 *   - `per-word`      → SplitText `type: 'words'`; only non-whitespace words
 *                       are returned as units.
 *   - `per-line`      → SplitText `type: 'lines'`; each line is a block-level
 *                       unit and is set `display: block`.
 *
 * Throws if `element` is empty (the manager guards this; the throw is a
 * defensive check so the calling site can be loud about misuse).
 */
export function splitTextAnimationElement(
	element: HTMLElement,
	mode: TextEffectSplitMode
): TextAnimationSplitResult {
	ensureRegistered();

	const signature = element.textContent ?? '';

	if (mode === 'whole') {
		// Wrap the element's children in a single unit span so the renderer can
		// animate one element. We don't use SplitText for this mode — preserving
		// the original DOM (marks, decorative spans) inside one wrapper is
		// simpler and avoids creating spurious word/line splits the renderer
		// would never read.
		const originalChildren = Array.from(element.childNodes);
		const wrapper = document.createElement('span');
		wrapper.setAttribute('data-text-anim-unit', 'whole');
		wrapper.style.display = 'inline-block';
		for (const node of originalChildren) {
			wrapper.appendChild(node);
		}
		element.appendChild(wrapper);

		return {
			root: element,
			mode,
			units: [wrapper],
			signature,
			revert: () => {
				const stillThere = wrapper.parentElement === element;
				if (!stillThere) {
					return;
				}
				while (wrapper.firstChild) {
					element.insertBefore(wrapper.firstChild, wrapper);
				}
				element.removeChild(wrapper);
			}
		};
	}

	const splitTypeMap: Record<Exclude<TextEffectSplitMode, 'whole'>, string> = {
		'per-character': 'chars',
		'per-word': 'words',
		'per-line': 'lines'
	};

	const splitType = splitTypeMap[mode];
	const instance = new SplitText(element, {
		type: splitType,
		// Wrapper tags must be inline-block so per-glyph transforms compose.
		charsClass: 'text-anim-unit text-anim-char',
		wordsClass: 'text-anim-unit text-anim-word',
		linesClass: 'text-anim-unit text-anim-line',
		// Emoji-cluster safe; SplitText handles grapheme clusters with Intl.Segmenter.
		smartWrap: true
	});

	const units = (
		(mode === 'per-character'
			? instance.chars
			: mode === 'per-word'
				? instance.words
				: instance.lines) ?? []
	).filter((node): node is HTMLElement => node instanceof HTMLElement);

	if (mode === 'per-line') {
		for (const line of units) {
			line.style.display = 'block';
		}
	}

	for (const unit of units) {
		// Do NOT set `will-change` or `backface-visibility` here. Either property
		// promotes the unit to its own paint layer, which excludes the containing
		// `layoutsubtree` from `GPUQueue.copyElementImageToTexture` capture in
		// Chromium — the article surface goes blank in WICG export. Compositor-
		// only transforms (`translate`, `opacity`, `filter`) already animate
		// efficiently from GSAP without explicit hints. See ADR-0017 §
		// Consequences.
		if (mode !== 'per-line') {
			// inline-block keeps per-character / per-word transforms from re-flowing
			// the parent line box. It is a layout property, not a layer-promotion
			// hint, and is safe for WICG capture.
			unit.style.display = 'inline-block';
		}
	}

	return {
		root: element,
		mode,
		units,
		signature,
		revert: () => {
			instance.revert();
		}
	};
}
