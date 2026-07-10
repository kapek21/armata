import { create } from 'zustand';
import type { GamePhase, HudSnapshot } from '../core/types.js';
import { levelByIndex, levelCount } from '../levels/index.js';
import { loadProfile } from '../meta/profile.js';
import { totalCampaignTimeSec } from '../meta/campaign-time.js';

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
  timeLeftSec: profile.campaignTimeLeftSec ?? totalCampaignTimeSec(),
  timeLimitSec: totalCampaignTimeSec(),
  runScore: 0,
  keystoneHp: 100,
  keystoneHpMax: 100,
  keystoneTotal: 1,
  keystoneCleared: 0,
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
  setProfile: (profile: ReturnType<typeof loadProfile>) => void;
  reloadProfile: () => void;
  setHelpOpen: (open: boolean) => void;
}

export const useHudStore = create<HudStore>((set) => ({
  snapshot: initial,
  profile: loadProfile(),
  helpOpen: false,
  setSnapshot: (patch) => set((s) => ({ snapshot: { ...s.snapshot, ...patch } })),
  setProfile: (profile) => set({ profile }),
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
