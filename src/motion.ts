import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_OUT = 'cubic-bezier(.23, 1, .32, 1)';

/**
 * Indicador que se desliza hasta el elemento activo de un grupo (menú, pestañas, selector).
 * Explica el cambio de estado como un movimiento en lugar de un salto.
 */
export function useIndicator<T extends HTMLElement>(deps: unknown[]) {
  const container = useRef<T>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const ready = useRef(false);
  useLayoutEffect(() => {
    const root = container.current; const mark = indicator.current;
    if (!root || !mark) return;
    const update = () => {
      const active = root.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"], [aria-checked="true"], [aria-current="page"]');
      if (!active) { mark.style.opacity = '0'; return; }
      mark.style.transition = ready.current ? '' : 'none';
      mark.style.opacity = '1';
      mark.style.width = `${active.offsetWidth}px`;
      mark.style.height = `${active.offsetHeight}px`;
      mark.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      if (!ready.current) requestAnimationFrame(() => { ready.current = true; if (mark) mark.style.transition = ''; });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { container, indicator };
}

/**
 * Conserva por un instante los elementos que salen de una lista para animar su salida.
 * Es el momento central de Hoy: resolver un pendiente lo hace desaparecer de la lista.
 */
export function usePresence<T>(items: T[], keyOf: (item: T) => string, ms = 320) {
  const [ghosts, setGhosts] = useState<{ item: T; index: number; key: string }[]>([]);
  const previous = useRef(items);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const keys = items.map(keyOf).join('|');
  useEffect(() => {
    const current = new Set(items.map(keyOf));
    const removed = previous.current.map((item, index) => ({ item, index, key: keyOf(item) })).filter(x => !current.has(x.key));
    previous.current = items;
    if (!removed.length || reducedMotion()) return;
    setGhosts(g => [...g.filter(x => !current.has(x.key)), ...removed]);
    timers.current.push(setTimeout(() => setGhosts(g => g.filter(x => !removed.some(r => r.key === x.key))), ms));
  }, [keys]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const result: { item: T; key: string; exiting: boolean }[] = items.map(item => ({ item, key: keyOf(item), exiting: false }));
  for (const ghost of ghosts) result.splice(Math.min(ghost.index, result.length), 0, { item: ghost.item, key: ghost.key, exiting: true });
  return result;
}

/** Colapsa una fila que sale: se desvanece, se desplaza y cede su altura. */
export function exitRef(exiting: boolean) {
  return (el: HTMLElement | null) => {
    if (!el || !exiting || el.dataset.exiting) return;
    el.dataset.exiting = '1';
    const height = el.offsetHeight;
    el.animate([
      { height: `${height}px`, opacity: 1, transform: 'translateX(0)' },
      { height: `${height}px`, opacity: 0, transform: 'translateX(16px)', offset: .55 },
      { height: '0px', opacity: 0, transform: 'translateX(16px)', paddingTop: '0px', paddingBottom: '0px', borderWidth: '0px' },
    ], { duration: 320, easing: EASE_OUT, fill: 'forwards' });
  };
}

/** Número que rueda al cambiar: confirma que algo se resolvió. */
export function useRoll(value: number) {
  // La dirección queda fija para cada valor: otros renders (un aviso, una animación de salida) no la reinician.
  const previous = useRef(value);
  const direction = useRef<'up' | 'down' | 'none'>('none');
  if (value !== previous.current) { direction.current = value < previous.current ? 'down' : 'up'; previous.current = value; }
  return direction.current;
}
