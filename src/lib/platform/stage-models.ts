// The registered models of the Dimensional Stage (ADR-0051 phase 2, the
// compiled-model lane). A model is an AUTHORED part — a nurb / build123d
// solid, never a downloaded asset — compiled once by
// `scripts/compile-stage-model.ts` into a bundled `.stagemesh` under
// `src/lib/assets/models/`, and registered here with the facts the stage needs
// before its bytes decode: its units, its material regions, and, for a screen,
// where the glass sits. Nothing at runtime reads a model file the registry
// does not name (ADR-0047 keeps the general importer rejected). This module
// stays free of app imports so the compile script can load it under Node.

export type StageModelVector = [number, number, number];

/** One material region of a model: an intrinsic object material, not a Pack Role. */
export interface StageModelMaterial {
	name: string;
	/** rgb 0..1 in the stage's display space (the space every capture and
	 *  plane composes in — the stage never linearises). */
	color: StageModelVector;
	/** 0 mirror .. 1 fully matte. */
	roughness: number;
}

/**
 * The tube's own optics, intrinsic to the object like its plastics: the
 * `crt-tube` Effect's physics fixed to the glass. A flat panel declares none.
 */
export interface StageScreenOptics {
	/** How far the glass domes toward the camera at its centre, as a fraction of the opening height. */
	dome: number;
	/** Barrel bulge of the picture across the dome, 0..1. */
	curvature: number;
	/** Scanlines of the drawn raster across the opening height. */
	lines: number;
	/** Beam spot size: 0 tight late-era beam, 1 fat early beam. */
	focus: number;
	mask: 'slot' | 'shadow' | 'grille';
	/** Triad pitch in 4K-reference glass pixels. */
	maskPitchPx: number;
	maskStrength: number;
	halation: number;
	vignette: number;
}

/** The rectangle of a model that displays the Surface: its glass. */
export interface StageModelScreen {
	/** Centre of the opening in model units. */
	center: StageModelVector;
	/** Opening width and height in model units. */
	width: number;
	height: number;
	/** How much the screen's own light spills onto the model and the planes (0 = off). */
	glow: number;
	optics?: StageScreenOptics;
}

/** The plane a model stands on: the stage lays a receiving floor at this height. */
export interface StageModelFloor {
	/** The model's underside in model units. */
	y: number;
}

export interface StageModelDefinition {
	slug: string;
	label: string;
	/** Model units per world metre are irrelevant; the stage scales by the screen. */
	units: 'mm';
	/** Provenance of the compiled bytes. */
	source: {
		part: string;
		exportedOn: string;
		sha256: string;
	};
	/** Expected geometry of the compiled file, asserted by tests and at load. */
	triangles: number;
	vertices: number;
	/** Region order matches the vertex stream's region index. */
	materials: readonly StageModelMaterial[];
	/** Assign a triangle to a region from its centroid in model units. */
	regionOf(centroid: StageModelVector): number;
	screen: StageModelScreen;
	floor?: StageModelFloor;
}

/** A #rrggbb colour as the rgb triple the stage lights, in its display space. */
export function stageModelColor(hex: string): StageModelVector {
	const value = Number.parseInt(hex.slice(1), 16);
	return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

const STAGE_MODELS: Record<string, StageModelDefinition> = {
	// Scott's widescreen Trinitron in the construction language of the Sony
	// GDM-FW900: face, shoulder, neck, concealed control barrel, articulated
	// pedestal, and base as one solid. Authored as a nurb / build123d part in
	// the mental-health talk repo (parts/crt_monitor.py) and exported at true
	// scale in millimetres: X width, Y up, screen facing +Z, front face at Z 0.
	// The opening, its centre, and the pocket floor are that part's runtime
	// contract and must match it exactly.
	'crt-fw900': {
		slug: 'crt-fw900',
		label: 'CRT monitor (FW900)',
		units: 'mm',
		source: {
			part: 'content/talks/mental-health/parts/crt_monitor.py',
			exportedOn: '2026-08-26',
			sha256: 'bcea74bd8310e3666a4c02ca47896e486a7b0399fcd2d05a2047981afb360704'
		},
		triangles: 20424,
		// After the region split (19,241 in the part).
		vertices: 19429,
		// The moulded subassemblies as the talk lit them: warm graphite shell,
		// the darkest stepped face and bezel so the glass wins the frame, a
		// slightly lighter stand, and near-black vent recesses that cannot catch
		// a highlight (their boolean rims would read as torn dashes).
		materials: [
			{ name: 'shell', color: stageModelColor('#2b2d32'), roughness: 0.62 },
			{ name: 'face', color: stageModelColor('#1e2025'), roughness: 0.52 },
			{ name: 'stand', color: stageModelColor('#33363c'), roughness: 0.46 },
			{ name: 'vents', color: stageModelColor('#131417'), roughness: 0.94 }
		],
		regionOf([x, y, z]) {
			const ventField = Math.abs(x) > 262 && y > 2 && y < 96 && z > -220 && z < -122;
			if (ventField) return 3;
			if (y < -180) return 2;
			if (z > -36) return 1;
			return 0;
		},
		// The opening is 523×295 centred at X 0 / Y −17 with its pocket floor at
		// Z −12; the glass sits 2 mm proud of that floor so it never shares a
		// depth with the housing.
		screen: {
			center: [0, -17, -10],
			width: 523,
			height: 295,
			glow: 1,
			// A Trinitron: aperture grille, a gentle barrel, a fine late-era raster.
			optics: {
				dome: 0.045,
				curvature: 0.16,
				lines: 900,
				focus: 0.5,
				mask: 'grille',
				maskPitchPx: 6,
				maskStrength: 0.2,
				halation: 0.12,
				vignette: 0.34
			}
		},
		// The stand's underside: the desk-contact contract of the part.
		floor: { y: -288 }
	}
};

export function isStageModel(slug: string): boolean {
	return slug in STAGE_MODELS;
}

export function listStageModels(): readonly string[] {
	return Object.keys(STAGE_MODELS);
}

export function getStageModel(slug: string): StageModelDefinition | null {
	return STAGE_MODELS[slug] ?? null;
}
