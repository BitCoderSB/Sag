import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowsOut, CaretDown } from '@phosphor-icons/react';
import { DAY, capitalize, formatDate, plural } from '../lib';

export type GanttTone = 'ok' | 'info' | 'warn' | 'danger' | 'neutral' | 'idle' | 'wait';
export interface GanttMarker { at: number; kind: 'review' | 'review-done' | 'delivery' | 'due'; title: string }
export interface GanttRow {
  id: string; label: string; sub?: string; group?: string; lead?: ReactNode;
  /** Sin inicio ni fin la fila solo muestra marcas (por ejemplo, revisiones generales). */
  start?: number; end?: number; tone?: GanttTone; markers?: GanttMarker[];
  /** Avance de 0 a 100: llena la barra hasta ese punto. */
  progress?: number | null;
  /** Lo planeado (cronograma): una barra punteada detrás de la real. */
  plan?: { start: number; end: number };
  /** Hito de un día (la defensa): se dibuja como rombo. */
  milestone?: boolean;
  /** Líneas extra para la ficha al pasar el cursor (vista ampliada). */
  detail?: string[];
  onClick?: () => void; describe: string;
}
/** Escala: «fit» ajusta todo al ancho; las demás fijan píxeles por día y se desplazan en horizontal. */
export type GanttScale = 'fit' | 'week' | 'month' | 'quarter';
const PX_PER_DAY: Record<Exclude<GanttScale, 'fit'>, number> = { week: 26, month: 7, quarter: 2.6 };

const dayMs = (t: number) => Math.floor(t / DAY) * DAY;
const noonUtc = (t: number) => { const d = new Date(t); d.setUTCHours(12, 0, 0, 0); return d; };
/** Marcas del eje. Menores: días, semanas o meses según el ancho por día. Mayores (vista ampliada): meses o años. */
function ticks(from: number, to: number, pxPerDay: number | null) {
  const span = (to - from) / DAY;
  const minor: { at: number; label: string }[] = []; const major: { at: number; label: string }[] = [];
  const weekly = pxPerDay ? pxPerDay >= 5 : span <= 75;
  if (pxPerDay && pxPerDay >= 20) {
    for (let d = noonUtc(from); d.getTime() <= to; d.setUTCDate(d.getUTCDate() + 1)) minor.push({ at: dayMs(d.getTime()), label: String(d.getUTCDate()) });
  } else if (weekly) {
    const d = noonUtc(from); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
    for (; d.getTime() <= to; d.setUTCDate(d.getUTCDate() + 7)) minor.push({ at: dayMs(d.getTime()), label: pxPerDay ? String(d.getUTCDate()) : formatDate(d) });
  } else {
    const d = noonUtc(from); d.setUTCDate(1); if (d.getTime() < from) d.setUTCMonth(d.getUTCMonth() + 1);
    for (let first = true; d.getTime() <= to; d.setUTCMonth(d.getUTCMonth() + 1), first = false) minor.push({ at: dayMs(d.getTime()), label: capitalize(formatDate(d, { day: undefined, month: 'short', year: !pxPerDay && (first || d.getUTCMonth() === 0) ? '2-digit' : undefined }).replace('.', '')) });
  }
  if (pxPerDay) {
    const byYear = !weekly;
    const d = noonUtc(from); d.setUTCDate(1); if (byYear) d.setUTCMonth(0);
    for (; d.getTime() <= to; byYear ? d.setUTCFullYear(d.getUTCFullYear() + 1) : d.setUTCMonth(d.getUTCMonth() + 1))
      major.push({ at: Math.max(from, dayMs(d.getTime())), label: byYear ? String(d.getUTCFullYear()) : capitalize(formatDate(d, { day: undefined, month: 'long', year: 'numeric' })) });
  }
  return { minor, major };
}
const span = (a: number, b: number) => { const n = Math.max(1, Math.round((b - a) / DAY)); return plural(n, 'día', 'días'); };

/**
 * Diagrama de Gantt sin dependencias: una fila por elemento, barras de inicio a fin (con lo planeado detrás), marcas
 * para revisiones y entregas, línea de «hoy» y, opcionalmente, una franja con el periodo. Las filas con `group` se
 * pliegan. `size="full"` es la vista ampliada: escala por día, encabezado y nombres fijos, y ficha al pasar el cursor.
 */
export default function Gantt({ rows, band, label, empty, legend, size = 'compact', scale = 'fit', onExpand, focus }: {
  rows: GanttRow[]; band?: { start: number; end: number | null; label: string }; label: string; empty?: ReactNode; legend?: ReactNode;
  size?: 'compact' | 'full'; scale?: GanttScale; onExpand?: () => void;
  /** Cambia para volver a centrar «hoy» en la vista ampliada. */
  focus?: number;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<{ row: GanttRow; x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const now = Date.now(); const full = size === 'full';
  const points = [now, ...rows.flatMap(r => [r.start, r.end, r.plan?.start, r.plan?.end, ...(r.markers ?? []).map(m => m.at)]), band?.start, band?.end].filter((v): v is number => typeof v === 'number');
  const min = points.length ? Math.min(...points) : now; const max = points.length ? Math.max(...points) : now;
  const pxPerDay = full && scale !== 'fit' ? PX_PER_DAY[scale] : null;
  const pad = pxPerDay ? 10 * DAY : Math.max(3 * DAY, (max - min) * .04);
  const from = dayMs(min - pad); const to = dayMs(max + pad) + DAY;
  const trackWidth = pxPerDay ? Math.round(((to - from) / DAY) * pxPerDay) : null;
  // En la vista ampliada, «hoy» queda a un tercio de la pantalla al abrir y al cambiar de escala.
  useLayoutEffect(() => {
    const el = scroller.current; if (!el || !trackWidth) return;
    const label = parseFloat(getComputedStyle(el).getPropertyValue('--gantt-label')) || 0;
    el.scrollLeft = Math.max(0, ((now - from) / (to - from)) * trackWidth - (el.clientWidth - label) / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackWidth, focus]);
  useEffect(() => { if (!tip) return; const hide = () => setTip(null); window.addEventListener('scroll', hide, true); return () => window.removeEventListener('scroll', hide, true); }, [tip]);
  if (!rows.length) return <>{empty}</>;
  const x = (t: number) => `${((t - from) / (to - from)) * 100}%`;
  const w = (a: number, b: number) => `${Math.max(.6, ((b - a) / (to - from)) * 100)}%`;
  const { minor, major } = ticks(from, to, pxPerDay);
  const groups = [...new Set(rows.map(r => r.group ?? ''))];
  const grouped = groups.length > 1 || groups[0] !== '';
  const showTip = (r: GanttRow) => full ? (e: ReactPointerEvent) => setTip({ row: r, x: e.clientX, y: e.clientY }) : undefined;
  let index = 0;
  const renderRow = (r: GanttRow) => {
    const i = index++;
    const bar = r.start !== undefined && r.end !== undefined;
    const late = !!r.plan && bar && r.end! > r.plan.end + DAY;
    const body = <>
      <span className="gantt-label">{r.lead}<span className="gantt-label-text"><strong>{r.label}</strong>{r.sub && <small>{r.sub}</small>}</span></span>
      <span className="gantt-track" aria-hidden="true">
        {r.plan && <span className={`gantt-plan ${r.milestone ? 'is-milestone' : ''}`} style={{ left: x(r.plan.start), width: r.milestone ? undefined : w(r.plan.start, r.plan.end), '--i': i } as CSSProperties} />}
        {bar && !r.milestone && <span className={`gantt-bar tone-${r.tone ?? 'neutral'} ${typeof r.progress === 'number' && r.progress < 100 ? 'has-progress' : ''} ${late ? 'is-late' : ''}`} style={{ left: x(r.start!), width: w(r.start!, r.end!), '--i': i } as CSSProperties}>
          {typeof r.progress === 'number' && r.progress < 100 && <span className="gantt-fill" style={{ width: `${r.progress}%` }} />}
          {full && pxPerDay && (r.end! - r.start!) / DAY * pxPerDay > 90 && <span className="gantt-bar-text">{span(r.start!, r.end!)}</span>}
        </span>}
        {bar && r.milestone && <span className={`gantt-milestone tone-${r.tone ?? 'neutral'}`} style={{ left: x(r.start!), '--i': i } as CSSProperties} />}
        {(r.markers ?? []).map((m, n) => <i key={n} className={`gantt-marker gantt-${m.kind}`} style={{ left: x(m.at), '--i': i } as CSSProperties} title={m.title} />)}
      </span>
    </>;
    const hover = { onPointerMove: showTip(r), onPointerLeave: full ? () => setTip(null) : undefined };
    return <li key={r.id} className="gantt-row">{r.onClick ? <button type="button" className="gantt-hit" onClick={r.onClick} aria-label={r.describe} {...hover}>{body}</button> : <div className="gantt-hit" role="img" aria-label={r.describe} {...hover}>{body}</div>}</li>;
  };
  const hasPlan = rows.some(r => r.plan);
  return <figure className={`gantt ${full ? 'is-full' : ''}`} aria-label={label}>
    {onExpand && <button type="button" className="gantt-expand" onClick={onExpand}><ArrowsOut size={15} aria-hidden="true" />Expandir</button>}
    <div className="gantt-scroll" ref={scroller}>
      <div className="gantt-inner" style={trackWidth ? { width: `calc(var(--gantt-label) + ${trackWidth}px)` } as CSSProperties : undefined}>
        <div className={`gantt-axis ${major.length ? 'has-major' : ''}`} aria-hidden="true">
          <span className="gantt-label gantt-corner" />
          <span className="gantt-track">
            {major.map((t, n) => <span key={`M${t.at}`} className="gantt-major" style={{ left: x(t.at), width: w(t.at, major[n + 1]?.at ?? to) }}><span>{t.label}</span></span>)}
            {minor.map(t => <span key={t.at} className="gantt-tick" style={{ left: x(t.at) }}>{t.label}</span>)}
            {full && <i className="gantt-today-tag" style={{ left: x(now) }}>Hoy</i>}
          </span>
        </div>
        <div className="gantt-body">
          <span className="gantt-overlay" aria-hidden="true">
            <span className="gantt-label" />
            <span className="gantt-track">
              {minor.map(t => <i key={t.at} className="gantt-grid" style={{ left: x(t.at) }} />)}
              {major.map(t => <i key={`M${t.at}`} className="gantt-grid is-major" style={{ left: x(t.at) }} />)}
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
      {hasPlan && <span><i className="gantt-key gantt-plan" />Planeado (cronograma)</span>}
      {band && <span><i className="gantt-key gantt-band-key" />Periodo</span>}
    </>}</figcaption>
    {tip && <div className="gantt-tip" role="presentation" style={{ left: Math.min(tip.x + 16, window.innerWidth - 300), top: Math.min(tip.y + 18, window.innerHeight - 160) }}>
      <strong>{tip.row.label}</strong>
      {tip.row.sub && <span className="gantt-tip-sub">{tip.row.sub}</span>}
      {tip.row.start !== undefined && tip.row.end !== undefined && <span>{tip.row.milestone ? formatDate(new Date(tip.row.start), { year: 'numeric' }) : `${formatDate(new Date(tip.row.start))} – ${formatDate(new Date(tip.row.end), { year: 'numeric' })} · ${span(tip.row.start, tip.row.end)}`}</span>}
      {tip.row.plan && <span className="gantt-tip-plan">Planeado: {formatDate(new Date(tip.row.plan.start))} – {formatDate(new Date(tip.row.plan.end), { year: 'numeric' })}</span>}
      {tip.row.detail?.map(d => <span key={d}>{d}</span>)}
    </div>}
  </figure>;
}
