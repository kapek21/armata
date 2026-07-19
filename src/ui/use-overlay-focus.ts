import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Escape zamyka overlay; fokus wchodzi na dialog; Tab w pułapce wewnątrz.
 */
export function useOverlayFocus(
  active: boolean,
  onEscape: () => void,
  initialFocus: 'first' | 'primary' = 'primary',
): RefObject<HTMLDivElement> {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    prevFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = panelRef.current;
    if (!panel) return;

    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      );

    const nodes = focusables();
    const primary =
      panel.querySelector<HTMLElement>('[data-overlay-primary]') ??
      nodes[nodes.length - 1] ??
      nodes[0];
    const target = initialFocus === 'first' ? nodes[0] ?? primary : primary;
    window.setTimeout(() => target?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first || !panel.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !panel.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      prevFocus.current?.focus?.();
    };
  }, [active, onEscape, initialFocus]);

  return panelRef;
}
