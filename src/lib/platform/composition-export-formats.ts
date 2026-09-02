/**
 * The delivery formats the engine encodes, and which of them this origin can
 * actually deliver.
 *
 * `COMPOSITION_EXPORT_FORMATS` is the schema's own enum in list form: what a
 * composition may declare. `availableCompositionExportFormats` is narrower on
 * the hosted origin. ProRes 4444 is an ffmpeg lane, and a Worker has no ffmpeg,
 * so there the browser encodes WebM and nothing else
 * ([ADR-0052](../../../docs/adr/0052-public-runtime-and-retention-architecture.md)
 * amendment). The Format select, the `transport.set-format` operation, and the
 * export plan all read this one answer, so a format that cannot be delivered
 * here is neither offered nor accepted rather than failing at the encoder.
 */
import { IS_HOSTED_ORIGIN } from './hosted-origin';

import type { Transport } from './engine-schema';

/** The delivery formats the engine encodes. */
export const COMPOSITION_EXPORT_FORMATS: readonly Transport['format'][] = ['webm', 'prores'];

/** What the Format select calls each format. */
export const COMPOSITION_EXPORT_FORMAT_LABELS: Readonly<Record<Transport['format'], string>> = {
	webm: 'WebM VP9',
	prores: 'MOV ProRes 4444'
};

/** The formats this origin delivers: both locally, WebM alone on the hosted origin. */
export function availableCompositionExportFormats(): readonly Transport['format'][] {
	return IS_HOSTED_ORIGIN
		? COMPOSITION_EXPORT_FORMATS.filter((format) => format === 'webm')
		: COMPOSITION_EXPORT_FORMATS;
}

export function isCompositionExportFormatAvailable(format: Transport['format']): boolean {
	return availableCompositionExportFormats().includes(format);
}

/**
 * Why a declared format cannot be delivered from this origin, worded as the
 * corrective step: the refusal names the lane that works here and the origin
 * that has the other one.
 */
export function unavailableCompositionExportFormatMessage(format: Transport['format']): string {
	return `"${format}" is not delivered by the hosted origin, which has no ffmpeg. Set the format to "webm" to export here, or open the piece on the local GFX origin for ProRes 4444.`;
}
