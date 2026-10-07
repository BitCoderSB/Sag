import { useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DotsSixVertical } from '@phosphor-icons/react';
import type { AnimalId } from '../../shared/avatars';
import { today } from '../lib';
import { Avatar } from './ui';

/** Lo que se arrastra hacia un día del calendario. Soltar nunca guarda: abre el diálogo ya con la fecha puesta. */
/** `drop` recibe un día (calendario) o una zona del tablero (`data-drop`). `accepts` dice si una zona lo recibe o por qué no. */
export interface DragItem { id: string; title: string; person: string; avatar?: AnimalId | string | null; drop: (target: string) => void; accepts?: (target: string) => true | string; tip?: string }
interface DragState { item: DragItem; over: string | null; blocked: boolean; message?: string }

// React solo se entera de lo que cambia poco (qué se arrastra y sobre qué día está).
// La posición del puntero va directo al DOM en cada cuadro, sin volver a dibujar el calendario.
let state: DragState | null = null;
const listeners = new Set<() => void>();
const set = (next: DragState | null) => { state = next; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useDragState = () => useSyncExternalStore(subscribe, () => state);
let pointer = { x: 0, y: 0 };
let paint: (() => void) | null = null;

/** Empieza a arrastrar tras moverse unos píxeles; un clic normal sigue funcionando. */
export function beginDrag(item: DragItem, e: ReactPointerEvent) {
  if (e.button !== 0 || e.pointerType === 'touch') return;
  const sx = e.clientX; const sy = e.clientY; let started = false; let frame = 0;
  const update = () => {
    frame = 0;
    const zone = (document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null)?.closest<HTMLElement>('[data-day], [data-drop]');
    const over = zone?.dataset.day ?? zone?.dataset.drop ?? null;
    if (over !== state?.over) {
      const verdict = !over ? true : zone!.dataset.day ? (over < today() ? 'Elige hoy o un día futuro' : true) : item.accepts ? item.accepts(over) : true;
      set({ item, over, blocked: verdict !== true, message: verdict === true ? undefined : verdict });
    }
    paint?.();
  };
  const move = (ev: PointerEvent) => {
    if (!started) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; started = true; document.body.classList.add('is-dragging'); set({ item, over: null, blocked: false }); }
    ev.preventDefault();
    pointer = { x: ev.clientX, y: ev.clientY };
    if (!frame) frame = requestAnimationFrame(update);
  };
  const end = (ev: PointerEvent | KeyboardEvent) => {
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('keydown', esc);
    document.body.classList.remove('is-dragging');
    const drop = started && ev.type === 'pointerup' && state?.over && !state.blocked ? state.over : null;
    if (state) set(null);
    if (started) { const stop = (c: Event) => { c.stopPropagation(); c.preventDefault(); }; window.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0); }
    if (drop) item.drop(drop);
  };
  const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') end(ev); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('keydown', esc);
}

/** Asa visible en las filas que se pueden llevar al calendario. */
export function DragHandle() {
  return <span className="drag-handle" aria-hidden="true"><DotsSixVertical size={16} weight="bold" /></span>;
}

/** Tarjeta que sigue al puntero y la curva punteada hacia el día que la recibirá. */
export function DragLayer(): ReactNode {
  const s = useDragState();
  const ghost = useRef<HTMLDivElement>(null); const curve = useRef<SVGPathElement>(null); const dot = useRef<SVGCircleElement>(null); const tip = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!s) return;
    // El rectángulo del día se mide una vez por día, no en cada movimiento.
    const rect = s.over ? document.querySelector(`[data-day="${s.over}"], [data-drop="${s.over}"]`)?.getBoundingClientRect() ?? null : null;
    paint = () => {
      const gx = pointer.x + 26; const gy = pointer.y + 30;
      if (ghost.current) ghost.current.style.transform = `translate3d(${gx}px, ${gy}px, 0) rotate(7deg)`;
      if (!rect) { curve.current?.setAttribute('d', ''); dot.current?.setAttribute('r', '0'); if (tip.current) tip.current.style.opacity = '0'; return; }
      const tx = rect.left + rect.width / 2; const ty = rect.top + rect.height / 2;
      curve.current?.setAttribute('d', `M ${tx} ${ty} C ${tx + (gx - tx) * .45} ${ty - 34}, ${gx - (gx - tx) * .25} ${gy - 30}, ${gx} ${gy}`);
      dot.current?.setAttribute('cx', String(tx)); dot.current?.setAttribute('cy', String(ty)); dot.current?.setAttribute('r', '4');
      if (tip.current) { tip.current.style.opacity = '1'; tip.current.style.transform = `translate3d(${tx}px, ${rect.bottom + 6}px, 0) translateX(-50%)`; }
    };
    paint();
    return () => { paint = null; };
  }, [s]);
  if (!s) return null;
  return createPortal(<div className="drag-layer" aria-hidden="true">
    <svg className="drag-curve" width="100%" height="100%"><path ref={curve} /><circle ref={dot} r="0" /></svg>
    <span ref={tip} className={`drag-tip ${s.blocked ? 'is-blocked' : ''}`}>{s.blocked ? s.message ?? 'Aquí no' : s.item.tip ?? 'Soltar para programar'}</span>
    <div ref={ghost} className="drag-ghost">
      <Avatar name={s.item.person} avatar={s.item.avatar} />
      <span><strong>{s.item.title}</strong><small>{s.item.person}</small></span>
      <DotsSixVertical size={18} weight="bold" />
    </div>
  </div>, document.body);
}
