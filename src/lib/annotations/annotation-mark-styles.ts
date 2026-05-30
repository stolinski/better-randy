export type AnnotationMarkStyle =
	| 'highlight'
	| 'circle'
	| 'underline'
	| 'strike'
	| 'box'
	| 'side-note'
	| 'magnify'
	| 'lift-out'
	| 'tear-out'
	| 'isolate';

export type AnnotationMarkKind = 'decorative' | 'focal';

export const DECORATIVE_ANNOTATION_STYLES: readonly AnnotationMarkStyle[] = [
	'highlight',
	'underline',
	'strike',
	'circle',
	'box',
	'side-note'
];

export const FOCAL_ANNOTATION_STYLES: readonly AnnotationMarkStyle[] = [
	'magnify',
	'lift-out',
	'tear-out',
	'isolate'
];

export const ANNOTATION_MARK_STYLES: readonly AnnotationMarkStyle[] = [
	...DECORATIVE_ANNOTATION_STYLES,
	...FOCAL_ANNOTATION_STYLES
];

export const ANNOTATION_MARK_ATTRIBUTE = 'data-annotation-mark';

export function getAnnotationMarkKind(style: AnnotationMarkStyle): AnnotationMarkKind {
	return FOCAL_ANNOTATION_STYLES.includes(style) ? 'focal' : 'decorative';
}

export function isAnnotationMarkStyle(
	value: string | null | undefined
): value is AnnotationMarkStyle {
	return ANNOTATION_MARK_STYLES.includes(value as AnnotationMarkStyle);
}
