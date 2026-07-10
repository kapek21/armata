import { useEffect, useState } from 'react';
import {
  isMusicMuted,
  startSiegeMusicOnGesture,
  teardownSiegeAudio,
  toggleSiegeMusic,
} from '../audio/siege-audio.js';

export function useSiegeMusic(): { muted: boolean; toggle: () => void } {
  const [muted, setMuted] = useState(isMusicMuted);

  useEffect(() => {
    const onGesture = (): void => {
      void startSiegeMusicOnGesture();
    };
    window.addEventListener('pointerdown', onGesture, { once: true, passive: true });
    window.addEventListener('keydown', onGesture, { once: true });

    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      teardownSiegeAudio();
    };
  }, []);

  const toggle = (): void => {
    setMuted(toggleSiegeMusic());
  };

  return { muted, toggle };
}
