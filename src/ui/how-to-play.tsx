import { POWERUP_DEFS } from '../game/powerups.js';
import { POWERUP_COST } from '../meta/economy.js';
import { RUN_TARGET_COUNT } from '../meta/run-state.js';
import { useHudStore } from './hud-store.js';
import { useOverlayFocus } from './use-overlay-focus.js';

/** Wspólna treść instrukcji (pomoc + plansza startowa). */
export function HowToPlayContent(): JSX.Element {
  const profile = useHudStore((s) => s.profile);

  return (
    <div className="space-y-4 text-sm text-white/85">
      <section>
        <h3 className="font-semibold text-amber-200">Cel runu</h3>
        <p className="mt-1 text-white/70">
          Masz <span className="text-amber-200/90">3 minuty</span> na zniszczenie do{' '}
          <span className="text-amber-200/90">{RUN_TARGET_COUNT} celów</span> (maszyny oblężnicze i
          zamki). Trudność rośnie z każdym celem. Punkty sumują się przez cały run.
        </p>
        <p className="mt-1 text-white/70">
          Zaliczenie celu = zniszczenie wszystkich{' '}
          <span className="text-amber-200/90">tarcz (keystone)</span>. Pasek{' '}
          <span className="text-amber-200/90">Stabilność</span> pokazuje, ile tarcz zostało i jak
          trzyma się konstrukcja.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-amber-200">Strzał</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-4 text-white/70">
          <li>Dotknij modułu celu (najlepiej tarczę lub to, co ją odsłania).</li>
          <li>Odsuń palec — w górę = wyższy łuk nad murami; długość gestu = siła.</li>
          <li>Puść, aby wystrzelić kulę.</li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-amber-200">Tarcze i Szpieg</h3>
        <p className="mt-1 text-white/70">
          Tarcze to punkty konstrukcyjne — czasem schowane za murami. Power-up{' '}
          <span className="text-amber-200/90">🕵️ Szpieg</span> włącza rentgen: konstrukcja staje się
          półprzezroczysta, a tarcze świecą nawet za przesłoną. Zużycie przy strzale (jak inne
          power-upy).
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-amber-200">Power-upy</h3>
        <ul className="mt-1 space-y-1.5 text-white/70">
          {POWERUP_DEFS.map((p) => (
            <li key={p.id}>
              {p.icon}{' '}
              <span className="text-amber-200/90">{p.label}</span>
              <span className="text-white/40"> (🪙 {POWERUP_COST[p.id]})</span>
              {' — '}
              {p.description}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-white/50">
          Masz:{' '}
          {POWERUP_DEFS.map((p) => `${p.label.toLowerCase()} ${profile.powerups[p.id] ?? 0}`).join(
            ', ',
          )}
          . Kup w menu albo zdobywaj za 2+ cele / ukończony run.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-amber-200">Punkty i monety</h3>
        <p className="mt-1 text-white/70">
          Trafienia w tarcze i zawalenie konstrukcji dają punkty. Po runie dostajesz monety; przy
          dobrym wyniku także power-upy. Run bez power-upów daje lekki bonus do wyniku.
        </p>
      </section>
    </div>
  );
}

interface HowToPlayBoardProps {
  onStart: () => void;
}

/** Plansza instrukcji przed startem rozgrywki. */
export function HowToPlayBoard({ onStart }: HowToPlayBoardProps): JSX.Element {
  const panelRef = useOverlayFocus(true, onStart, 'primary');

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-[#120c06]/82 p-3 backdrop-blur-[2px] safe-top safe-bottom"
      role="presentation"
    >
      <div
        ref={panelRef}
        className="panel relative flex max-h-[min(92vh,720px)] w-full max-w-md flex-col overflow-hidden p-5 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-board-title"
      >
        <p className="font-display text-center text-xs tracking-[0.28em] text-amber-200/70">
          ARMATA
        </p>
        <h2
          id="howto-board-title"
          className="font-display mt-1 text-center text-xl text-amber-300"
        >
          Instrukcja
        </h2>
        <p className="mt-1 text-center text-xs text-white/55">
          3:00 · {RUN_TARGET_COUNT} celów · zniszcz tarcze
        </p>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <HowToPlayContent />
        </div>

        <button
          type="button"
          className="btn-primary mt-4 w-full shrink-0"
          data-overlay-primary
          onClick={onStart}
        >
          Rozpocznij grę
        </button>
      </div>
    </div>
  );
}

interface HelpDialogProps {
  onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps): JSX.Element {
  const panelRef = useOverlayFocus(true, onClose, 'primary');

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 safe-top safe-bottom"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="panel relative flex max-h-[min(88vh,640px)] w-full max-w-sm flex-col p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <button
          type="button"
          className="btn-secondary absolute right-3 top-3 min-h-11 min-w-11 px-0 text-lg leading-none"
          aria-label="Zamknij pomoc"
          onClick={onClose}
        >
          ×
        </button>
        <h2 id="help-title" className="font-display pr-10 text-lg text-amber-300">
          Jak grać
        </h2>
        <div className="mt-3 flex-1 overflow-y-auto pr-1">
          <HowToPlayContent />
        </div>
        <button
          type="button"
          className="btn-primary mt-4 w-full shrink-0"
          data-overlay-primary
          onClick={onClose}
        >
          Rozumiem
        </button>
      </div>
    </div>
  );
}
