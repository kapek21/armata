import { useHudStore } from './hud-store.js';
import { levelByIndex, levelCount, chapterCount } from '../levels/index.js';
import { countKeystones } from '../levels/normalize.js';
import { POWERUP_DEFS } from '../game/powerups.js';
import { POWERUP_COST } from '../meta/economy.js';
import { buyPowerup, saveProfile, shouldShowAimHint } from '../meta/profile.js';
import { getWeeklyLeaderboard } from '../meta/leaderboard.js';
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
  const showAimHint = phase === 'aiming' && shouldShowAimHint(profile);

  const buyPowerupItem = (type: PowerupType): void => {
    const next = buyPowerup(profile, type);
    if (!next) return;
    saveProfile(next);
    setProfile(next);
  };

  const helpOverlay = helpOpen ? <HelpDialog onClose={onCloseHelp} /> : null;
  const weekly = getWeeklyLeaderboard(profile.levels[snap.levelId]?.bestScore ?? snap.runScore);

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
            <p className="mt-1 text-center text-xs text-white/60">Oblężenie zamku — traf kluczowy moduł</p>
            <p className="mt-1 text-center text-xs text-amber-200/80">🪙 {profile.coins} monet</p>

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
                Wygrana z 2★ lub 3★ też daje losowy power-up
              </p>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto">
              {Array.from({ length: chapterCount() }, (_, ch) => ch + 1).map((chapter) => (
                <div key={chapter} className="mb-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                    Rozdział {chapter}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {Array.from({ length: levelCount() }, (_, i) => i)
                      .filter((i) => levelByIndex(i).chapter === chapter)
                      .map((i) => {
                        const lvl = levelByIndex(i);
                        const locked = i >= profile.unlockedLevels;
                        const best = profile.levels[lvl.id];
                        return (
                          <li key={lvl.id}>
                            <button
                              type="button"
                              disabled={locked}
                              className="btn-secondary w-full text-left text-sm disabled:opacity-40"
                              onClick={() => onStartLevel(i)}
                            >
                              <span>{i + 1}. {lvl.name}</span>
                              {countKeystones(lvl) > 1 && (
                                <span className="ml-1 text-[10px] text-amber-300">
                                  🛡×{countKeystones(lvl)}
                                </span>
                              )}
                              {locked ? (
                                <span className="float-right text-white/40">🔒</span>
                              ) : (
                                <span className="float-right text-amber-300">
                                  {'★'.repeat(best?.stars ?? 0) || '—'}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </div>

            <details className="mt-2 text-xs text-white/60">
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
      {snap.message && phase === 'simulating' && (
        <div className="pointer-events-none absolute inset-x-0 top-[18%] z-10 flex justify-center">
          <span className="panel px-4 py-2 text-sm text-amber-200">{snap.message}</span>
        </div>
      )}

      {(phase === 'won' || phase === 'lost') && (
        <div className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center px-4">
          <div className="panel max-w-xs px-6 py-5 text-center">
            <p className="text-2xl">{phase === 'won' ? '🏰' : '💥'}</p>
            <p className="mt-2 font-display text-lg text-amber-200">
              {phase === 'won' ? 'Zamek zdobyty!' : 'Oblężenie nieudane'}
            </p>
            {phase === 'won' && (
              <>
                <p className="mt-1 text-amber-300">{'★'.repeat(snap.starsEarned) || '—'}</p>
                <p className="mt-1 text-sm text-white/70">Wynik: {snap.finalScore}</p>
              </>
            )}
          </div>
        </div>
      )}

      {showAimHint && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[5.5rem] z-10 text-center text-[10px] text-white/45 safe-bottom">
          Traf złotą tarczę — kluczowy moduł zamku wroga
        </p>
      )}

      {helpOverlay}
    </>
  );
}
