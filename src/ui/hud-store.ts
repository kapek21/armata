import { create } from 'zustand';
import type { GamePhase, HudSnapshot } from '../core/types.js';
import { levelByIndex, levelCount } from '../levels/index.js';
import { loadProfile } from '../meta/profile.js';

const profile = loadProfile();

const initial: HudSnapshot = {
  phase: 'loading',
  levelId: levelByIndex(0).id,
  levelName: levelByIndex(0).name,
  levelIndex: 0,
  levelCount: levelCount(),
  ammoLeft: levelByIndex(0).ammoLimit,
  ammoTotal: levelByIndex(0).ammoLimit,
  targetsLeft: levelByIndex(0).targets.length,
  targetsTotal: levelByIndex(0).targets.length,
  starsEarned: 0,
  message: '',
  ready: false,
  unlockedLevels: profile.unlockedLevels,
};

interface HudStore {
  snapshot: HudSnapshot;
  profile: ReturnType<typeof loadProfile>;
  setSnapshot: (patch: Partial<HudSnapshot>) => void;
  reloadProfile: () => void;
}

export const useHudStore = create<HudStore>((set) => ({
  snapshot: initial,
  profile: loadProfile(),
  setSnapshot: (patch) => set((s) => ({ snapshot: { ...s.snapshot, ...patch } })),
  reloadProfile: () => set({ profile: loadProfile() }),
}));

export function phaseLabel(phase: GamePhase): string {
  switch (phase) {
    case 'loading':
      return 'Ładowanie…';
    case 'menu':
      return 'Menu';
    case 'aiming':
      return 'Celuj';
    case 'simulating':
      return '…';
    case 'won':
      return 'Wygrana!';
    case 'lost':
      return 'Spróbuj ponownie';
  }
}
