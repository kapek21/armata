import type { PowerupType } from '../core/types.js';

export interface PowerupDef {
  id: PowerupType;
  label: string;
  icon: string;
  description: string;
}

export const POWERUP_DEFS: PowerupDef[] = [
  {
    id: 'heavy',
    label: 'Ciężki',
    icon: '⚓',
    description: 'Większa masa i impuls — przebija mury.',
  },
  {
    id: 'explosive',
    label: 'Wybuch',
    icon: '💥',
    description: 'Fala uderzeniowa przy trafieniu.',
  },
  {
    id: 'trajectory',
    label: 'Celownik',
    icon: '🎯',
    description: 'Pełna trajektoria balistyczna.',
  },
  {
    id: 'breach',
    label: 'Wyłom',
    icon: '🔨',
    description: 'Niszczy statyczne mury i wieże — odsłania ukryty klucz.',
  },
];

export const IMPULSE_HEAVY_MULT = 1.6;
export const EXPLOSIVE_RADIUS = 1.8;
export const EXPLOSIVE_IMPULSE = 4.5;
export const BREACH_STATIC_DAMAGE = 999;

export function powerupLabel(id: PowerupType): string {
  return POWERUP_DEFS.find((p) => p.id === id)?.label ?? id;
}
