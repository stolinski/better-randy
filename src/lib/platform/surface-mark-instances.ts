import { listMarkInstances, type MarkInstance, type SurfaceState } from './engine-schema';
import { getSurfaceDefinition } from './pipelines/definition-registry';

/**
 * Every mark instance a Surface produces, in document order: the headline's
 * marks first when the Surface's definition declares `titleMarks` (its
 * CanvasSource renders `content.title` through the bracket-tag parser), then
 * the body-projected marks. This is the one enumeration the marks renderer,
 * timeline, sound cues, operations, and lint share — it is what keeps
 * `marks.timings[]` indices aligned with the DOM order of the
 * `data-annotation-mark` spans that `getAnnotationMarkLayouts` walks.
 */
export function listSurfaceMarkInstances(surface: SurfaceState): MarkInstance[] {
	return listMarkInstances(surface.content, {
		titleMarks: getSurfaceDefinition(surface.type)?.titleMarks === true
	});
}
