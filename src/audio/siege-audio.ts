import { disposeSiegeMusic, getSiegeMusicEngine } from './siege-music.js';

const MUTE_KEY = 'armata-music-muted';

export function isMusicMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMusicMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  getSiegeMusicEngine().setMuted(muted);
}

let started = false;

/** Uruchom muzykę po pierwszej interakcji (polityka autoplay przeglądarek). */
export async function startSiegeMusicOnGesture(): Promise<void> {
  if (started) return;
  started = true;
  const eng = getSiegeMusicEngine();
  eng.setMuted(isMusicMuted());
  await eng.start();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) eng.pause();
    else if (!isMusicMuted()) void eng.resume();
  });
}

export function toggleSiegeMusic(): boolean {
  const next = !isMusicMuted();
  setMusicMuted(next);
  if (!next && !getSiegeMusicEngine().isRunning()) {
    void getSiegeMusicEngine().start();
  }
  return next;
}

export function teardownSiegeAudio(): void {
  started = false;
  disposeSiegeMusic();
}
