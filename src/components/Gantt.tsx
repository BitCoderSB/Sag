import { useState, type CSSProperties, type ReactNode } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { DAY, capitalize, formatDate } from '../lib';

export type GanttTone = 'ok' | 'info' | 'warn' | 'danger' | 'neutral' | 'idle' | 'wait';
export interface GanttMarker { at: number; kind: 'review' | 'review-done' | 'delivery' | 'due'; title: string }
export interface GanttRow {
  id: string; label: string; sub?: string; group?: string; lead?: ReactNode;
  /** Sin inicio ni fin la fila solo muestra marcas (por ejemplo, revisiones generales). */
  start?: number; end?: number; tone?: GanttTone; markers?: GanttMarker[];
  /** Avance de 0 a 100: llena la barra hasta ese punto. */
  progress?: number | null;
  onClick?: () => void; describe: string;
}

const dayMs = (t: number) => Math.floor(t / DAY) * DAY;
/** Marcas del eje: semanas en rangos cortos, meses en los largos. */
function ticks(from: number, to: number) {
  const span = (to - from) / DAY; const list: { at: number; label: string }[] = [];
  if (span <= 75) {
    const d = new Date(from); d.setUTCHours(12, 0, 0, 0); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
    for (; d.getTime() <= to; d.setUTCDate(d.getUTCDate() + 7)) list.push({ at: d.getTime(), label: formatDate(d) });
  } else {
    const d = new Date(from); d.setUTCDate(1); d.setUTCHours(12, 0, 0, 0); if (d.getTime() < from) d.setUTCMonth(d.getUTCMonth() + 1);
    for (let first = true; d.getTime() <= to; d.setUTCMonth(d.getUTCMonth() + 1), first = false) list.push({ at: d.getTime(), label: capitalize(formatDate(d, { day: undefined, month: 'short', year: first || d.getUTCMonth() === 0 ? '2-digit' : undefined }).replace('.', '')) });
  }
  return list;
}

/**
 * Diagrama de Gantt sin dependencias: una fila por elemento, barras de inicio a fin, marcas para revisiones y
 * entregas, línea de «hoy» y, opcionalmente, una franja con el periodo. Las filas con `group` se pliegan por fase.
 */
export default function Gantt({ rows, band, label, empty, legend }: { rows: GanttRow[]; band?: { start: number; end: number | null; label: string }; label: string; empty?: ReactNode; legend?: ReactNode }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const now = Date.now();
  const points = [now, ...rows.flatMap(r => [r.start, r.end, ...(r.markers ?? []).map(m => m.at)]), band?.start, band?.end].filter((v): v is number => typeof v === 'number');
  if (!rows.length) return <>{empty}</>;
  const pad = Math.max(3 * DAY, (Math.max(...points) - Math.min(...points)) * .04);
  const from = dayMs(Math.min(...points) - pad); const to = dayMs(Math.max(...points) + pad) + DAY;
  const x = (t: number) => `${((t - from) / (to - from)) * 100}%`;
  const w = (a: number, b: number) => `${Math.max(.8, ((b - a) / (to - from)) * 100)}%`;
  const groups = [...new Set(rows.map(r => r.group ?? ''))];
  const grouped = groups.length > 1 || groups[0] !== '';
  let index = 0;
  const renderRow = (r: GanttRow) => {
    const i = index++;
    const bar = r.start !== undefined && r.end !== undefined;
    const body = <>
      <span className="gantt-label">{r.lead}<span className="gantt-label-text"><strong>{r.label}</strong>{r.sub && <small>{r.sub}</small>}</span></span>
      <span className="gantt-track" aria-hidden="true">
        {bar && <span className={`gantt-bar tone-${r.tone ?? 'neutral'} ${typeof r.progress === 'number' && r.progress < 100 ? 'has-progress' : ''}`} style={{ left: x(r.start!), width: w(r.start!, r.end!), '--i': i } as CSSProperties}>{typeof r.progress === 'number' && r.progress < 100 && <span className="gantt-fill" style={{ width: `${r.progress}%` }} />}</span>}
        {(r.markers ?? []).map((m, n) => <i key={n} className={`gantt-marker gantt-${m.kind}`} style={{ left: x(m.at), '--i': i } as CSSProperties} title={m.title} />)}
      </span>
    </>;
    return <li key={r.id} className="gantt-row">{r.onClick ? <button type="button" className="gantt-hit" onClick={r.onClick} aria-label={r.describe}>{body}</button> : <div className="gantt-hit" role="img" aria-label={r.describe}>{body}</div>}</li>;
  };
  return <figure className="gantt" aria-label={label}>
    <div className="gantt-scroll">
      <div className="gantt-inner">
        <div className="gantt-axis" aria-hidden="true">
          <span className="gantt-label" />
          <span className="gantt-track">{ticks(from, to).map(t => <span key={t.at} className="gantt-tick" style={{ left: x(t.at) }}>{t.label}</span>)}</span>
        </div>
        <div className="gantt-body">
          <span className="gantt-overlay" aria-hidden="true">
            <span className="gantt-label" />
            <span className="gantt-track">
              {ticks(from, to).map(t => <i key={t.at} className="gantt-grid" style={{ left: x(t.at) }} />)}
              {band && <span className="gantt-band" style={{ left: x(band.start), width: band.end ? w(band.start, band.end) : `calc(100% - ${x(band.start)})` }}><span>{band.label}</span></span>}
              <i className="gantt-today" style={{ left: x(now) }}><span>Hoy</span></i>
            </span>
          </span>
          {grouped ? groups.map(g => {
            const list = rows.filter(r => (r.group ?? '') === g); const isClosed = closed.has(g);
            return <section key={g || 'sin-fase'} className="gantt-group">
              <button type="button" className="gantt-group-head" aria-expanded={!isClosed} onClick={() => setClosed(old => { const next = new Set(old); if (next.has(g)) next.delete(g); else next.add(g); return next; })}>
                <CaretDown size={13} weight="bold" aria-hidden="true" /><strong>{g || 'Sin fase'}</strong><span className="count">{list.length}</span>
              </button>
              {!isClosed && <ol>{list.map(renderRow)}</ol>}
            </section>;
          }) : <ol>{rows.map(renderRow)}</ol>}
        </div>
      </div>
    </div>
    <figcaption className="gantt-legend">{legend ?? <>
      <span><i className="gantt-key gantt-bar tone-neutral" />En curso</span><span><i className="gantt-key gantt-bar tone-info" />Por evaluar</span><span><i className="gantt-key gantt-bar tone-warn" />Atrasada</span><span><i className="gantt-key gantt-bar tone-danger" />Con impedimento</span><span><i className="gantt-key gantt-bar tone-ok" />Terminada</span>
      <span><i className="gantt-key gantt-marker gantt-review" />Revisión</span><span><i className="gantt-key gantt-marker gantt-delivery" />Entrega</span>
      {band && <span><i className="gantt-key gantt-band-key" />Periodo</span>}
    </>}</figcaption>
  </figure>;
}
