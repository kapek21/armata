import { useHudStore } from './hud-store.js';

interface HelpDialogProps {
  onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps): JSX.Element {
  const profile = useHudStore((s) => s.profile);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 safe-top safe-bottom"
      onClick={onClose}
      role="presentation"
    >
      <div
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
        <div className="mt-3 flex-1 space-y-4 overflow-y-auto pr-1 text-sm text-white/85">
          <section>
            <h3 className="font-semibold text-amber-200">Cel</h3>
            <p className="mt-1 text-white/70">
              Strzelasz z własnego zamku przez <strong>otwór strzelniczy</strong>. Zniszcz{' '}
              <span className="text-red-300">czerwony moduł kluczowy</span> w zamku wroga, zanim
              skończy się <strong>czas</strong> lub <strong>amunicja</strong>.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-amber-200">Strzał</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-4 text-white/70">
              <li>Dotknij modułu zamku wroga.</li>
              <li>Odsuń palec — dłuższe przeciągnięcie = mocniejszy strzał.</li>
              <li>Puść, aby wystrzelić kulę.</li>
            </ol>
          </section>
          <section>
            <h3 className="font-semibold text-amber-200">Punkty i gwiazdki</h3>
            <p className="mt-1 text-white/70">
              Trafienia w kluczowy moduł dają punkty. Wygrana przy zniszczeniu keystone. Gwiazdki
              za szybkość, oszczędność strzałów i wysoki wynik.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-amber-200">Power-upy</h3>
            <ul className="mt-1 space-y-1 text-white/70">
              <li>⚓ Ciężki — większa siła uderzenia</li>
              <li>💥 Wybuch — fala przy trafieniu</li>
              <li>🎯 Celownik — pełna trajektoria</li>
            </ul>
            <p className="mt-1 text-xs text-white/50">Masz: ciężki {profile.powerups.heavy}, wybuch {profile.powerups.explosive}, celownik {profile.powerups.trajectory}</p>
          </section>
          <section>
            <h3 className="font-semibold text-amber-200">Materiały zamku</h3>
            <ul className="mt-1 space-y-1 text-white/70">
              <li>Kamień / drewno — moduły konstrukcyjne</li>
              <li>Metal — cięższe podpory</li>
              <li>Szkło — kruche segmenty</li>
            </ul>
          </section>
        </div>
        <button type="button" className="btn-primary mt-4 w-full shrink-0" onClick={onClose}>
          Rozumiem
        </button>
      </div>
    </div>
  );
}
