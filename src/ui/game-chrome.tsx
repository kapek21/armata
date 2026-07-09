import { useHudStore } from './hud-store.js';
import type { GamePhase } from '../core/types.js';
import { POWERUP_DEFS } from '../game/powerups.js';
import { shouldShowAimHint } from '../meta/profile.js';

interface GameChromeTopProps {
  phase: GamePhase;
}

export function GameChromeTop({ phase }: GameChromeTopProps): JSX.Element {
  const snap = useHudStore((s) => s.snapshot);
  if (!snap.ready || phase === 'menu') return <></>;

  const urgent = snap.timeLeftSec <= 10;
  const warn = snap.timeLeftSec <= 25;
  const ended = phase === 'won' || phase === 'lost';

  return (
    <header className="game-chrome-top shrink-0 px-2 pt-2 safe-top">
      <div className="panel flex items-stretch justify-between gap-1 px-2 py-2 text-xs">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-amber-200">{snap.levelName}</div>
          <div className="text-white/55">
            R{snap.chapter} · {snap.levelIndex + 1}/{snap.levelCount}
          </div>
        </div>
        <div className="text-center px-2">
          <div className="text-white/55">Punkty</div>
          <div className="text-lg font-bold text-amber-300">{snap.runScore}</div>
        </div>
        <div className="text-center px-2">
          <div className="text-white/55">Czas</div>
          <div
            className={`text-lg font-bold tabular-nums ${
              urgent ? 'text-red-400 animate-pulse' : warn ? 'text-yellow-300' : 'text-emerald-300'
            }`}
          >
            {snap.timeLeftSec}s
          </div>
        </div>
        <div className="text-center px-2">
          <div className="text-white/55">Amunicja</div>
          <div className="text-lg font-bold text-amber-300">
            {snap.ammoLeft}/{snap.ammoTotal}
          </div>
        </div>
      </div>
      <div
        className={`mt-1 flex min-h-[1.125rem] items-center gap-2 px-1 ${ended ? 'invisible' : ''}`}
        aria-hidden={ended}
      >
        <span className="text-[10px] text-white/45">
          {snap.keystoneTotal > 1 ? 'Klucze:' : 'Klucz:'}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/40 border border-red-900/40">
          <div
            className="h-full bg-gradient-to-r from-red-700 to-red-400 transition-all duration-200"
            style={{
              width: `${snap.keystoneHpMax > 0 ? (snap.keystoneHp / snap.keystoneHpMax) * 100 : 0}%`,
            }}
          />
        </div>
        <span className="min-w-[2.25rem] text-right text-[10px] text-red-300 tabular-nums">
          {snap.keystoneTotal > 1
            ? `${snap.keystoneCleared}/${snap.keystoneTotal}`
            : snap.keystoneHp}
        </span>
      </div>
    </header>
  );
}

interface GameChromeBottomProps {
  phase: GamePhase;
  onMenu: () => void;
  onHelp: () => void;
  onRetry: () => void;
  onNext: () => void;
  onSelectPowerup: (id: import('../core/types.js').PowerupType) => void;
  onBonusShot: () => void;
}

export function GameChromeBottom({
  phase,
  onMenu,
  onHelp,
  onRetry,
  onNext,
  onSelectPowerup,
  onBonusShot,
}: GameChromeBottomProps): JSX.Element {
  const snap = useHudStore((s) => s.snapshot);
  const profile = useHudStore((s) => s.profile);

  if (!snap.ready) return <></>;

  const aimHint =
    phase === 'aiming' && shouldShowAimHint(profile)
      ? snap.keystoneTotal > 1
        ? 'Zniszcz wszystkie czerwone moduły kluczowe zamku'
        : 'Traf czerwony moduł kluczowy zamku wroga'
      : phase === 'aiming'
        ? 'Dotknij moduł zamku → odsuń palec → puść'
        : '';

  const showBonusShot = phase === 'lost' && !profile.adsRemoved;
  const showRetry = phase === 'won' || phase === 'lost';
  const showNext = phase === 'won' && snap.levelIndex + 1 < snap.levelCount;

  return (
    <footer className="game-chrome-bottom shrink-0 px-2 pb-2 safe-bottom">
      <p
        className={`mb-1 min-h-[2.5rem] flex items-center justify-center text-center text-[10px] text-white/45 ${
          aimHint ? '' : 'invisible'
        }`}
        aria-hidden={!aimHint}
      >
        {aimHint || '·'}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {POWERUP_DEFS.map((p) => {
          const count = profile.powerups[p.id] ?? 0;
          const active = snap.activePowerup === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={phase !== 'aiming' && phase !== 'simulating' || count <= 0}
              className={`btn-secondary min-h-11 px-2 text-xs ${active ? 'ring-2 ring-amber-400' : ''} disabled:opacity-35`}
              onClick={() => onSelectPowerup(p.id)}
              title={p.description}
            >
              {p.icon} {count}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex min-h-[6.75rem] flex-wrap content-center items-center justify-center gap-2">
        <button type="button" className="btn-secondary min-h-11" onClick={onMenu}>
          Menu
        </button>
        <button type="button" className="btn-secondary min-h-11 min-w-11" aria-label="Pomoc" onClick={onHelp}>
          ?
        </button>
        {showBonusShot && (
          <button type="button" className="btn-secondary min-h-11 text-xs" onClick={onBonusShot}>
            +1 strzał ▶
          </button>
        )}
        {showRetry && (
          <button type="button" className="btn-primary min-h-11" onClick={onRetry}>
            Retry
          </button>
        )}
        {showNext && (
          <button type="button" className="btn-primary min-h-11" onClick={onNext}>
            Dalej
          </button>
        )}
      </div>
    </footer>
  );
}
