import { useHudStore } from './hud-store.js';
import { POWERUP_DEFS } from '../game/powerups.js';
import { POWERUP_COST } from '../meta/economy.js';
import { buyPowerup, saveProfile } from '../meta/profile.js';
import { getWeeklyLeaderboard } from '../meta/leaderboard.js';
import { RUN_TARGET_COUNT } from '../meta/run-state.js';
import type { GamePhase, PowerupType } from '../core/types.js';
import { HelpDialog } from './help-dialog.js';

interface HudProps {
  phase: GamePhase;
  helpOpen: boolean;
  onCloseHelp: () => void;
  onRetry: () => void;
  onNext: () => void;
  onMenu: () => void;
  onCloseMenu: () => void;
  onStartLevel: (index: number) => void;
}

export function Hud({
  phase,
  helpOpen,
  onCloseHelp,
  onCloseMenu,
  onStartLevel,
}: HudProps): JSX.Element {
  const snap = useHudStore((s) => s.snapshot);
  const profile = useHudStore((s) => s.profile);
  const setProfile = useHudStore((s) => s.setProfile);

  const buyPowerupItem = (type: PowerupType): void => {
    const next = buyPowerup(profile, type);
    if (!next) return;
    saveProfile(next);
    setProfile(next);
  };

  const helpOverlay = helpOpen ? <HelpDialog onClose={onCloseHelp} /> : null;
  const weekly = getWeeklyLeaderboard(profile.bestRunScore ?? snap.runScore);

  if (phase === 'menu') {
    return (
      <>
        <div
          className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-3 safe-top safe-bottom"
          onClick={onCloseMenu}
          role="presentation"
        >
          <div
            className="panel relative flex max-h-[90vh] w-full max-w-sm flex-col p-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-title"
          >
            <button
              type="button"
              className="btn-secondary absolute right-2 top-2 min-h-11 min-w-11 px-0 text-lg leading-none"
              aria-label="Zamknij menu"
              onClick={onCloseMenu}
            >
              ×
            </button>
            <h1 id="menu-title" className="font-display text-center text-xl text-amber-300 pr-10">
              ARMATA
            </h1>
            <p className="mt-1 text-center text-xs text-white/60">
              3 minuty · {RUN_TARGET_COUNT} celów · trudność rośnie
            </p>
            <p className="mt-1 text-center text-xs text-amber-200/80">🪙 {profile.coins} monet</p>
            {(profile.bestRunScore ?? 0) > 0 && (
              <p className="mt-1 text-center text-xs text-emerald-300/90">
                Najlepszy run: {profile.bestRunScore} pkt
              </p>
            )}

            <button
              type="button"
              className="btn-primary mt-4 w-full min-h-12"
              onClick={() => onStartLevel(0)}
            >
              Nowa rozgrywka (3:00)
            </button>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2">
              <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">
                Sklep power-upów
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {POWERUP_DEFS.map((p) => {
                  const owned = profile.powerups[p.id] ?? 0;
                  const cost = POWERUP_COST[p.id];
                  const canBuy = profile.coins >= cost;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!canBuy}
                      className="btn-secondary min-h-11 px-2 text-xs disabled:opacity-35"
                      onClick={() => buyPowerupItem(p.id)}
                      title={p.description}
                    >
                      <span className="block text-base">{p.icon}</span>
                      <span className="block text-[10px] text-white/55">masz {owned}</span>
                      <span className="block text-[10px] text-amber-200">🪙 {cost}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-center text-[10px] text-white/45">
                2+ zniszczone cele lub ukończony run daje power-upy
              </p>
            </div>

            <details className="mt-3 text-xs text-white/60">
              <summary className="cursor-pointer text-amber-200/90">Ranking tygodnia</summary>
              <ol className="mt-1 space-y-0.5">
                {weekly.slice(0, 5).map((e) => (
                  <li key={e.rank}>
                    {e.rank}. {e.name} — {e.score}
                  </li>
                ))}
              </ol>
            </details>

            <button
              type="button"
              className="btn-secondary mt-3 w-full"
              onClick={() => useHudStore.getState().setHelpOpen(true)}
            >
              Jak grać
            </button>
            <button type="button" className="btn-primary mt-2 w-full" onClick={onCloseMenu}>
              Wróć do gry
            </button>
          </div>
        </div>
        {helpOverlay}
      </>
    );
  }

  return (
    <>
      {snap.message && (phase === 'simulating' || phase === 'won') && (
        <div className="pointer-events-none absolute inset-x-0 top-[18%] z-10 flex justify-center">
          <span className="panel px-4 py-2 text-sm text-amber-200">{snap.message}</span>
        </div>
      )}

      {(phase === 'won' || phase === 'lost') && snap.runEnded && (
        <div className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center px-4">
          <div className="panel max-w-xs px-6 py-5 text-center">
            <p className="text-2xl">{phase === 'won' ? '🏰' : '💥'}</p>
            <p className="mt-2 font-display text-lg text-amber-200">
              {phase === 'won' ? 'Run ukończony!' : 'Run zakończony'}
            </p>
            <p className="mt-1 text-sm text-white/70">Wynik: {snap.finalScore}</p>
            {snap.message && (
              <p className="mt-2 text-xs text-amber-200/80">{snap.message}</p>
            )}
          </div>
        </div>
      )}

      {helpOverlay}
    </>
  );
}
