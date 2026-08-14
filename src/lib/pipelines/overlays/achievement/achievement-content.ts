import { z } from 'zod';

import { VARIANT_IDS } from './variants/variant-ids';

export const AchievementContentSchema = z.strictObject({
	variant: z.enum(VARIANT_IDS).default('checklist-complete'),
	kicker: z.string().min(1),
	title: z.string().min(1),
	beat: z.number().min(0).max(1).default(0.3375)
});

export type AchievementContent = z.infer<typeof AchievementContentSchema>;
