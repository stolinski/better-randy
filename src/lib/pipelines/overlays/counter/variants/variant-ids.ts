export const VARIANT_IDS = ['slot-machine-roll'] as const;

export type CounterVariantId = (typeof VARIANT_IDS)[number];
