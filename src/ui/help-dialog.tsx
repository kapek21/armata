interface HelpDialogProps {
  onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps): JSX.Element {
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
              Przewróć wszystkie <span className="text-red-300">czerwone cele</span> — muszą spaść
              poza platformę. Wygrywasz, gdy znikną wszystkie; przegrywasz, gdy skończy się amunicja.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-amber-200">Strzał</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-4 text-white/70">
              <li>Dotknij klocka (celu lub konstrukcji).</li>
              <li>Odsuń palec — dłuższe przeciągnięcie = mocniejszy strzał.</li>
              <li>Puść palec, aby wystrzelić kulę.</li>
            </ol>
            <p className="mt-2 text-xs text-white/50">
              Łuk trajektorii: żółty (słabo) → zielony → czerwony (mocno).
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-amber-200">Amunicja</h3>
            <p className="mt-1 text-white/70">
              Każdy strzał zużywa 1 pocisk. Licznik w górnym pasku:{' '}
              <span className="text-amber-300">amunicja / limit</span>. Nie trzeba trafiać wprost w
              cel — wystarczy przewrócić konstrukcję.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-amber-200">Gwiazdki</h3>
            <p className="mt-1 text-white/70">
              Po wygranej dostajesz 1–3★ za oszczędność strzałów — im mniej zużytych, tym więcej
              gwiazdek. Każdy poziom ma własne progi.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-amber-200">Materiały</h3>
            <ul className="mt-1 space-y-1 text-white/70">
              <li>
                <span className="text-amber-600">Drewno</span> — lekkie, łatwo się przewraca.
              </li>
              <li>
                <span className="text-slate-300">Metal</span> — cięższy; część jest nieruchoma.
              </li>
              <li>
                <span className="text-cyan-200">Szkło</span> — kruche i lekkie.
              </li>
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
