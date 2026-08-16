export const VARIANT_IDS = ['standard', 'cinematic'] as const;

export type LowerThirdVariantId = (typeof VARIANT_IDS)[number];
