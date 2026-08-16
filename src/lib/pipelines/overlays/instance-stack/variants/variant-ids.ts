export const VARIANT_IDS = ['vertical-stack', 'horizontal-train'] as const;

export type InstanceStackVariantId = (typeof VARIANT_IDS)[number];
