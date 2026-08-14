import type { AchievementContent } from '../achievement-content';
import { checklistCompleteVariant } from './checklist-complete';
import type { AchievementVariant } from './types';
import { unlockedVariant } from './unlocked';

import { VARIANT_IDS as ACHIEVEMENT_VARIANT_IDS, type AchievementVariantId } from './variant-ids';

export const VARIANT_IDS = ACHIEVEMENT_VARIANT_IDS;

export const VARIANTS: Readonly<Record<AchievementVariantId, AchievementVariant>> = {
	'checklist-complete': checklistCompleteVariant,
	unlocked: unlockedVariant
};

export function isAchievementVariantId(value: string): value is AchievementVariantId {
	return VARIANT_IDS.some((id) => id === value);
}

export function setAchievementVariant(
	content: AchievementContent,
	variant: AchievementVariantId
): void {
	content.variant = variant;
}

export function setAchievementBeat(content: AchievementContent, beat: number): void {
	if (!Number.isFinite(beat)) {
		return;
	}
	content.beat = Math.round(Math.max(0, Math.min(1, beat)) * 10000) / 10000;
}
