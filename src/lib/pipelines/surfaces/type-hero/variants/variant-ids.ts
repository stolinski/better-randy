export const VARIANT_IDS = ['single', 'pair'] as const;

export type TypeHeroVariantId = (typeof VARIANT_IDS)[number];
