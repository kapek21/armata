import { create } from 'zustand';
import type { GamePhase, HudSnapshot } from '../core/types.js';
import { runTarget, RUN_TARGET_COUNT } from '../levels/run/index.js';
import { totalCampaignTimeSec } from '../meta/campaign-time.js';
import { loadProfile } from '../meta/profile.js';

const profile = loadProfile();
const lvl0 = runTarget(1, 1);

const initial: HudSnapshot = {
  phase: 'loading',
  levelId: lvl0.id,
  levelName: lvl0.name,
  levelIndex: 0,
  levelCount: RUN_TARGET_COUNT,
  chapter: 1,
  runTargetIndex: 1,
  runTargetCount: RUN_TARGET_COUNT,
  runDifficulty: 1,
  runVariant: 1,
  runComplete: false,
  runEnded: false,
  ammoLeft: lvl0.ammoLimit,
  ammoTotal: lvl0.ammoLimit,
  timeLeftSec: totalCampaignTimeSec(),
  timeLimitSec: totalCampaignTimeSec(),
  runScore: 0,
  keystoneHp: 100,
  keystoneHpMax: 100,
  keystoneTotal: 1,
  keystoneCleared: 0,
  stabilityPct: 100,
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
  /** Plansza instrukcji przed startem (pauzuje czas). */
  briefingOpen: boolean;
  setSnapshot: (patch: Partial<HudSnapshot>) => void;
  setProfile: (profile: ReturnType<typeof loadProfile>) => void;
  reloadProfile: () => void;
  setHelpOpen: (open: boolean) => void;
  setBriefingOpen: (open: boolean) => void;
}

export const useHudStore = create<HudStore>((set) => ({
  snapshot: initial,
  profile: loadProfile(),
  helpOpen: false,
  briefingOpen: false,
  setSnapshot: (patch) => set((s) => ({ snapshot: { ...s.snapshot, ...patch } })),
  setProfile: (profile) => set({ profile }),
  reloadProfile: () => set({ profile: loadProfile() }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setBriefingOpen: (open) => set({ briefingOpen: open }),
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
