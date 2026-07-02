import { useHudStore } from './hud-store.js';
import { levelByIndex, levelCount } from '../levels/index.js';
import type { GamePhase } from '../core/types.js';

interface HudProps {
  phase: GamePhase;
  onRetry: () => void;
  onNext: () => void;
  onMenu: () => void;
  onStartLevel: (index: number) => void;
}

export function Hud({ phase, onRetry, onNext, onMenu, onStartLevel }: HudProps): JSX.Element {
  const snap = useHudStore((s) => s.snapshot);
  const profile = useHudStore((s) => s.profile);

  if (phase === 'menu') {
    return (
      <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-4 safe-top safe-bottom">
        <div className="panel w-full max-w-sm p-5">
          <h1 className="font-display text-center text-xl text-amber-300">ARMATA</h1>
          <p className="mt-1 text-center text-xs text-white/60">Physics puzzler — przewróć cele</p>
          <ul className="mt-4 flex flex-col gap-2">
            {Array.from({ length: levelCount() }, (_, i) => {
              const lvl = levelByIndex(i);
              const locked = i >= profile.unlockedLevels;
              const best = profile.levels[lvl.id]?.stars ?? 0;
              return (
                <li key={lvl.id}>
                  <button
                    type="button"
                    disabled={locked}
                    className="btn-secondary w-full text-left disabled:opacity-40"
                    onClick={() => onStartLevel(i)}
                  >
                    <span className="font-semibold">{i + 1}. {lvl.name}</span>
                    {locked ? (
                      <span className="float-right text-white/40">🔒</span>
                    ) : (
                      <span className="float-right text-amber-300">{'★'.repeat(best) || '—'}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-center text-[11px] text-white/45">
            Przeciągnij palcem, puść — strzał
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between gap-2 p-3 safe-top">
        <div className="panel px-3 py-2 text-xs">
          <div className="font-semibold text-amber-200">{snap.levelName}</div>
          <div className="text-white/60">
            Poziom {snap.levelIndex + 1}/{snap.levelCount}
          </div>
        </div>
        <div className="panel px-3 py-2 text-center text-xs">
          <div className="text-white/60">Amunicja</div>
          <div className="text-lg font-bold text-amber-300">
            {snap.ammoLeft}/{snap.ammoTotal}
          </div>
        </div>
        <div className="panel px-3 py-2 text-center text-xs">
          <div className="text-white/60">Cele</div>
          <div className="text-lg font-bold text-red-300">
            {snap.targetsLeft}/{snap.targetsTotal}
          </div>
        </div>
      </div>

      {snap.message && phase === 'simulating' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/4 z-10 flex justify-center">
          <span className="panel px-4 py-2 text-sm text-amber-200">{snap.message}</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center gap-3 p-3 safe-bottom">
        <button type="button" className="pointer-events-auto btn-secondary" onClick={onMenu}>
          Menu
        </button>
        {(phase === 'won' || phase === 'lost') && (
          <button type="button" className="pointer-events-auto btn-primary" onClick={onRetry}>
            Retry
          </button>
        )}
        {phase === 'won' && snap.levelIndex + 1 < snap.levelCount && (
          <button type="button" className="pointer-events-auto btn-primary" onClick={onNext}>
            Dalej
          </button>
        )}
      </div>

      {(phase === 'won' || phase === 'lost') && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <div className="panel px-8 py-6 text-center">
            <p className="text-2xl">{phase === 'won' ? '🎯' : '💥'}</p>
            <p className="mt-2 font-display text-lg text-amber-200">
              {phase === 'won' ? 'Wygrana!' : 'Porażka'}
            </p>
            {phase === 'won' && (
              <p className="mt-1 text-amber-300">{'★'.repeat(snap.starsEarned) || '—'}</p>
            )}
          </div>
        </div>
      )}

      {phase === 'aiming' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center safe-bottom">
          <p className="text-[11px] text-white/50">Przeciągnij i puść, aby strzelić</p>
        </div>
      )}
    </>
  );
}
