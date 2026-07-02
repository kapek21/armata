import type { QualityTier } from '../core/types.js';

export function detectQualityTier(): QualityTier {
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse && (cores <= 4 || memory <= 4)) return 'low';
  if (coarse) return 'medium';
  return 'high';
}

export function pixelRatioForTier(tier: QualityTier): number {
  const dpr = window.devicePixelRatio || 1;
  if (tier === 'low') return Math.min(dpr, 1);
  if (tier === 'medium') return Math.min(dpr, 1.5);
  return Math.min(dpr, 2);
}

export function maxBodiesForTier(tier: QualityTier): number {
  if (tier === 'low') return 80;
  if (tier === 'medium') return 120;
  return 200;
}
