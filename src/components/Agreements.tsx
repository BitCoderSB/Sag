import { useState } from 'react';
import type { Agreement, Review, Workspace } from '../../shared/types';
import { useApp } from '../context';
import { formatDate, post } from '../lib';

/** Revisión realizada más reciente, anterior a esta, con acuerdos sin cumplir. */
export function previousWithPending(w: Workspace, review: Review) {
  return w.reviews.filter(r => r.studentId === review.studentId && r.areaId === review.areaId && r.id !== review.id && r.status === 'completed' && Date.parse(r.startsAt) <= Date.parse(review.startsAt) && r.agreements?.some(a => !a.done))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
}

/** Casilla con palomita que se dibuja; el texto se tacha al cumplirse. */
export function Check({ done }: { done: boolean }) {
  return <span className={`agreement-box ${done ? 'is-done' : ''}`} aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" /></svg></span>;
}

/**
 * Lista de acuerdos de una revisión. Marcar uno se guarda al instante (sin abrir un diálogo) y se ve de inmediato;
 * si el servidor lo rechaza, vuelve a su estado y se avisa.
 */
export default function AgreementList({ review, title, editable }: { review: Review; title?: string; editable: boolean }) {
  const { refresh, toast } = useApp();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const items: Agreement[] = review.agreements ?? [];
  if (!items.length) return null;
  async function toggle(a: Agreement) {
    const done = !(local[a.id] ?? a.done);
    setLocal(old => ({ ...old, [a.id]: done }));
    try { await post(`/reviews/${review.id}/agreements/${a.id}`, { done }); await refresh(); toast(done ? 'Acuerdo cumplido.' : 'Acuerdo reabierto.'); }
    catch (e) { setLocal(old => ({ ...old, [a.id]: !done })); toast((e as Error).message, 'error'); }
  }
  const pending = items.filter(a => !(local[a.id] ?? a.done)).length;
  return <div className="agreements">
    <p className="agreements-title">{title ?? 'Acuerdos'}<span className={`count ${pending ? 'count-warn' : 'count-ok'}`}>{pending ? `${pending} pendiente${pending === 1 ? '' : 's'}` : 'Cumplidos'}</span></p>
    <ul>{items.map(a => { const done = local[a.id] ?? a.done; return <li key={a.id} className={done ? 'is-done' : ''}>
      {editable ? <label className="agreement"><input type="checkbox" checked={done} onChange={() => toggle(a)} /><Check done={done} /><span className="agreement-text">{a.text}</span></label>
        : <span className="agreement"><Check done={done} /><span className="agreement-text">{a.text}</span><span className="sr-only">{done ? ' (cumplido)' : ' (pendiente)'}</span></span>}
    </li>; })}</ul>
  </div>;
}

export const pendingTitle = (r: Review) => `Pendientes de la revisión del ${formatDate(r.startsAt)}`;
