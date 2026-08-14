export const VARIANT_IDS = ['checklist-complete', 'unlocked'] as const;

export type AchievementVariantId = (typeof VARIANT_IDS)[number];
