/**
 * Standing with the town, derived. Phase-22 — ADR-034 §1.
 *
 * Never a stored score: standing is a READING of `contractStats.fulfilled`,
 * the counter phase-20 saved for exactly this (ADR-032 §6). Fulfilled only,
 * deliberately — a missed contract already costs its premium, and standing
 * that decayed while the player was away would punish absence (`VISION.md`
 * §2.2). The player's whole rule fits in one sentence: every delivery raises
 * your name, and nothing lowers it.
 */

import type { ContractStats } from './contracts';

export type Standing = 'newcomer' | 'friend' | 'pillar';

/** Deliveries at which the town's trust steps up (ADR-034 §1). */
export const FRIEND_AT = 3;
export const PILLAR_AT = 10;

const RANK: Readonly<Record<Standing, number>> = { newcomer: 0, friend: 1, pillar: 2 };

export function standingOf(stats: ContractStats): Standing {
  if (stats.fulfilled >= PILLAR_AT) return 'pillar';
  if (stats.fulfilled >= FRIEND_AT) return 'friend';
  return 'newcomer';
}

/** Tier comparison for gates — a Pillar passes every Friend door. */
export function standingAtLeast(standing: Standing, required: Standing): boolean {
  return RANK[standing] >= RANK[required];
}

/** The fulfilled count the next tier asks for, or null at the top. */
export function nextStandingAt(stats: ContractStats): number | null {
  if (stats.fulfilled >= PILLAR_AT) return null;
  return stats.fulfilled >= FRIEND_AT ? PILLAR_AT : FRIEND_AT;
}
