import { useHudStore } from './hud-store.js';
import type { GamePhase } from '../core/types.js';
import { POWERUP_DEFS } from '../game/powerups.js';
import { POWERUP_COST, powerupTotal } from '../meta/economy.js';
import { formatCampaignClock } from '../meta/campaign-time.js';
import { shouldShowAimHint } from '../meta/profile.js';

/** „Cel 1 — Wieża…” / czyste nazwy siege → tytuł HUD */
function displayLevelTitle(name: string): string {
  let title = name.replace(/^Cel\s+\d+\s*[—–-]\s*/i, '').trim();
  title = title.replace(/\s+\d+$/, '').trim();
  return title || name;
}

interface GameChromeTopProps {
  phase: GamePhase;
}

export function GameChromeTop({ phase }: GameChromeTopProps): JSX.Element {
  const snap = useHudStore((s) => s.snapshot);
  if (!snap.ready || phase === 'menu') return <></>;

  const urgent = snap.timeLeftSec <= 30;
  const warn = snap.timeLeftSec <= 60;
  const ended = phase === 'won' || phase === 'lost';

  return (
    <header className="game-chrome-top shrink-0 px-2 pt-2 safe-top">
      <div className="panel game-chrome-stats relative grid items-center gap-x-1 px-2 py-2 text-xs">
        <div className="game-chrome-stats__title min-w-0 overflow-hidden">
          <div className="truncate font-semibold text-amber-200">
            {displayLevelTitle(snap.levelName)}
          </div>
          <div className="truncate tabular-nums text-white/55">
            {snap.runTargetIndex}/{snap.runTargetCount}
          </div>
        </div>
        <div className="game-chrome-stats__cell text-center">
          <div className="text-white/55">Punkty</div>
          <div className="text-lg font-bold tabular-nums text-amber-300">{snap.runScore}</div>
        </div>
        <div className="game-chrome-stats__cell text-center">
          <div className="text-white/55">Czas</div>
          <div
            className={`text-lg font-bold tabular-nums ${
              urgent ? 'text-red-400' : warn ? 'text-yellow-300' : 'text-emerald-300'
            }`}
          >
            {formatCampaignClock(snap.timeLeftSec)}
          </div>
        </div>
        <div className="game-chrome-stats__cell text-center">
          <div className="text-white/55">Strzały</div>
          <div className="text-lg font-bold text-amber-300 tabular-nums">
            {snap.ammoLeft}/{snap.ammoTotal}
          </div>
        </div>
      </div>
      <div
        className={`game-chrome-keystone mt-1 flex min-h-[1.125rem] items-center gap-2 px-1 ${ended ? 'invisible' : ''}`}
        aria-hidden={ended}
      >
        <span
          id="stability-label"
          className="game-chrome-keystone__label shrink-0 text-[10px] text-white/45"
        >
          Stabilność:
        </span>
        <div
          className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-black/40 border border-amber-900/50"
          role="progressbar"
          aria-labelledby="stability-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.max(0, Math.min(100, snap.stabilityPct ?? 100))}
          aria-valuetext={`${Math.max(0, Math.min(100, snap.stabilityPct ?? 100))} procent, tarcze ${Math.max(0, snap.keystoneTotal - snap.keystoneCleared)} z ${snap.keystoneTotal}`}
        >
          <div
            className="h-full bg-gradient-to-r from-amber-700 to-yellow-400 transition-all duration-200"
            style={{
              width: `${Math.max(0, Math.min(100, snap.stabilityPct ?? 100))}%`,
            }}
          />
        </div>
        <div
          className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold tabular-nums text-amber-300"
          title="Tarcze na celu"
        >
          <svg
            className="game-chrome-shield-icon"
            viewBox="0 0 24 28"
            width={14}
            height={16}
            aria-hidden
          >
            <path
              fill="#c4a878"
              stroke="#6a5538"
              strokeWidth="1.2"
              d="M12 1.5 L21 5.2 V13.5 C21 20 16.5 24.5 12 26.5 C7.5 24.5 3 20 3 13.5 V5.2 Z"
            />
            <path
              fill="none"
              stroke="#8b6914"
              strokeWidth="1.4"
              strokeLinecap="round"
              d="M12 8 V18 M8.5 13 H15.5"
            />
          </svg>
          <span>{Math.max(0, snap.keystoneTotal - snap.keystoneCleared)}</span>
        </div>
      </div>
    </header>
  );
}

interface GameChromeBottomProps {
  phase: GamePhase;
  musicMuted: boolean;
  onToggleMusic: () => void;
  onMenu: () => void;
  onHelp: () => void;
  onRetry: () => void;
  onNext: () => void;
  onSelectPowerup: (id: import('../core/types.js').PowerupType) => void;
  onBonusShot: () => void;
}

export function GameChromeBottom({
  phase,
  musicMuted,
  onToggleMusic,
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
        ? 'Zniszcz wszystkie moduły ze tarczą'
        : 'Traf moduł ze znakiem tarczy'
      : phase === 'aiming'
        ? 'Dotknij moduł → odsuń w bok (siła), w górę tylko dla łuku'
        : '';

  const totalPowerups = powerupTotal(profile.powerups);
  const showPowerupHint = totalPowerups <= 0 && phase !== 'menu';
  // +1 strzał / adsRemoved — stub; po finishRun runEnding blokuje dalszą grę.
  const showBonusShot = false;
  const showRetry = phase !== 'menu' && phase !== 'loading';
  const showNext = false;

  return (
    <footer className="game-chrome-bottom shrink-0 px-2 pb-2 safe-bottom">
      <p
        className="mb-1 flex min-h-[2.5rem] items-center justify-center px-1 text-center text-[10px] leading-snug text-white/45"
        aria-hidden={!aimHint}
      >
        <span className={aimHint ? '' : 'invisible'}>
          {aimHint || 'Dotknij moduł → odsuń w bok (siła), w górę tylko dla łuku'}
        </span>
      </p>

      <div className="game-chrome-powerups flex flex-nowrap items-stretch justify-center gap-1.5 sm:gap-2">
        {POWERUP_DEFS.map((p) => {
          const count = profile.powerups[p.id] ?? 0;
          const active = snap.activePowerup === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={phase !== 'aiming' && phase !== 'simulating' || count <= 0}
              className={`btn-secondary game-chrome-powerups__btn flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center px-1 py-1 text-xs sm:min-w-[4.5rem] sm:flex-none sm:px-2 ${
                active ? 'ring-2 ring-amber-400' : ''
              } ${count <= 0 ? 'opacity-40' : ''}`}
              onClick={() => onSelectPowerup(p.id)}
              title={
                count > 0
                  ? p.description
                  : `${p.description} — kup w menu za ${POWERUP_COST[p.id]} monet`
              }
            >
              <span className="text-base leading-none">{p.icon}</span>
              <span className="mt-0.5 text-[10px] tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
      <p
        className={`mt-1 min-h-[1rem] text-center text-[10px] text-amber-200/70 ${
          showPowerupHint ? '' : 'invisible'
        }`}
        aria-hidden={!showPowerupHint}
      >
        Brak power-upów — zniszcz 2+ cele w runie lub kup w menu
      </p>

      <div className="mt-2 flex min-h-11 flex-wrap content-center items-center justify-center gap-2">
        <button
          type="button"
          className="btn-secondary min-h-11 min-w-11"
          aria-label={musicMuted ? 'Włącz muzykę' : 'Wycisz muzykę'}
          onClick={onToggleMusic}
        >
          {musicMuted ? '🔇' : '♫'}
        </button>
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
