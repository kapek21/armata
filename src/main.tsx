import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GameLoop } from './core/game-loop.js';
import { GameSession } from './game/session.js';
import { detectQualityTier } from './platform/quality-tier.js';
import { CastleFrame } from './ui/castle-frame.js';
import { GameChromeBottom, GameChromeTop } from './ui/game-chrome.js';
import { Hud } from './ui/hud.js';
import { useHudStore } from './ui/hud-store.js';
import { useSiegeMusic } from './ui/use-siege-music.js';
import './index.css';

/** Launcher / Studio nakłada ← i Admin na iframe — potrzebny odstęp w HUD. */
function isHostedInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function App(): JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const ready = useHudStore((s) => s.snapshot.ready);
  const phase = useHudStore((s) => s.snapshot.phase);
  const helpOpen = useHudStore((s) => s.helpOpen);
  const setHelpOpen = useHudStore((s) => s.setHelpOpen);
  const { muted: musicMuted, toggle: toggleMusic } = useSiegeMusic();
  const hosted = isHostedInIframe();

  useEffect(() => {
    let cancelled = false;
    let loop: GameLoop | null = null;
    let ro: ResizeObserver | null = null;
    const host = viewportRef.current;
    if (!host) return;

    const session = new GameSession();
    sessionRef.current = session;
    const tier = detectQualityTier();

    void session.init(host, tier).then(() => {
      if (cancelled) {
        session.destroy();
        return;
      }
      ro = new ResizeObserver(() => session.resize());
      ro.observe(host);
      loop = new GameLoop(
        1000 / 60,
        (dt) => session.tick(dt),
        () => session.render(),
      );
      loop.start();
    });

    return () => {
      cancelled = true;
      loop?.stop();
      ro?.disconnect();
      session.destroy();
      sessionRef.current = null;
    };
  }, []);

  const session = sessionRef.current;

  return (
    <div
      className={`game-shell relative h-full w-full overflow-hidden${hosted ? ' game-shell--hosted' : ''}`}
    >
      <GameChromeTop phase={phase} musicMuted={musicMuted} onToggleMusic={toggleMusic} />
      <CastleFrame viewportRef={viewportRef} />
      <GameChromeBottom
        phase={phase}
        musicMuted={musicMuted}
        onToggleMusic={toggleMusic}
        onMenu={() => session?.showMenu()}
        onHelp={() => setHelpOpen(true)}
        onRetry={() => session?.retry()}
        onNext={() => session?.nextLevel()}
        onSelectPowerup={(id) => session?.selectPowerup(id)}
        onBonusShot={() => session?.grantBonusShot()}
      />
      {!ready && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#1a1208]/92 backdrop-blur-sm">
          <div className="text-center px-6">
            <p className="font-display text-lg tracking-widest text-amber-300">ARMATA</p>
            <p className="mt-2 text-sm text-white/70">Ładowanie oblężenia…</p>
          </div>
        </div>
      )}
      {ready && (
        <Hud
          phase={phase}
          helpOpen={helpOpen}
          onCloseHelp={() => setHelpOpen(false)}
          onRetry={() => session?.retry()}
          onNext={() => session?.nextLevel()}
          onMenu={() => session?.showMenu()}
          onCloseMenu={() => session?.closeMenu()}
          onStartLevel={(i) => session?.startFromMenu(i)}
        />
      )}
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
