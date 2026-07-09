import { create } from 'zustand';
import type { GamePhase, HudSnapshot } from '../core/types.js';
import { levelByIndex, levelCount } from '../levels/index.js';
import { loadProfile } from '../meta/profile.js';

const profile = loadProfile();
const lvl0 = levelByIndex(0);

const initial: HudSnapshot = {
  phase: 'loading',
  levelId: lvl0.id,
  levelName: lvl0.name,
  levelIndex: 0,
  levelCount: levelCount(),
  chapter: lvl0.chapter,
  ammoLeft: lvl0.ammoLimit,
  ammoTotal: lvl0.ammoLimit,
  timeLeftSec: lvl0.timeLimitSec,
  timeLimitSec: lvl0.timeLimitSec,
  runScore: 0,
  keystoneHp: 100,
  keystoneHpMax: 100,
  starsEarned: 0,
  finalScore: 0,
  message: '',
  ready: false,
  unlockedLevels: profile.unlockedLevels,
  activePowerup: null,
};

interface HudStore {
  snapshot: HudSnapshot;
  profile: ReturnType<typeof loadProfile>;
  helpOpen: boolean;
  setSnapshot: (patch: Partial<HudSnapshot>) => void;
  reloadProfile: () => void;
  setHelpOpen: (open: boolean) => void;
}

export const useHudStore = create<HudStore>((set) => ({
  snapshot: initial,
  profile: loadProfile(),
  helpOpen: false,
  setSnapshot: (patch) => set((s) => ({ snapshot: { ...s.snapshot, ...patch } })),
  reloadProfile: () => set({ profile: loadProfile() }),
  setHelpOpen: (open) => set({ helpOpen: open }),
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
