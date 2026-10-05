import type { CSSProperties } from 'react';
import { TrendDown, TrendUp } from '@phosphor-icons/react';
import type { Workspace } from '../../shared/types';
import { capitalize, dateKey, formatDate } from '../lib';

/** Últimos `n` meses como claves AAAA-MM, del más antiguo al actual. */
function lastMonths(n: number) {
  const [y, m] = dateKey().split('-').map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 15)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; });
}
const monthLabel = (key: string) => capitalize(formatDate(`${key}-15T12:00:00-06:00`, { day: undefined, month: 'short' }).replace('.', ''));

/**
 * Tendencias por mes: actividades terminadas (barras) y porcentaje entregado a tiempo (línea); debajo, cómo
 * evoluciona el promedio de cada habilidad. Responde «¿vamos mejorando?» sin comparar áreas entre sí.
 */
export default function Trends({ w, areaFilter }: { w: Workspace; areaFilter: string | null }) {
  const months = lastMonths(6);
  const month = (iso: string) => dateKey(iso).slice(0, 7);
  const completed = months.map(m => w.assignments.filter(a => a.status === 'completed' && month(a.updatedAt) === m).length);
  const punctual = months.map(m => {
    const firsts = w.assignments.filter(a => a.dueAt).map(a => ({ a, d: w.deliveries.filter(d => d.assignmentId === a.id && d.completeness === 'complete').sort((x, y) => x.receivedAt.localeCompare(y.receivedAt))[0] })).filter(x => x.d && month(x.d.receivedAt) === m);
    return firsts.length ? firsts.filter(x => Date.parse(x.d!.receivedAt) <= Date.parse(x.a.dueAt!)).length / firsts.length : null;
  });
  const max = Math.max(1, ...completed);
  const W = 600, H = 190, top = 18, bottom = 30, left = 8, right = 8; const plot = H - top - bottom; const step = (W - left - right) / months.length;
  const cx = (i: number) => left + step * i + step / 2;
  const line = punctual.map((p, i) => p === null ? null : [cx(i), top + plot * (1 - p)] as const);
  const path = line.reduce((d, pt, i) => pt ? `${d}${d && line[i - 1] ? ' L' : ' M'}${pt[0].toFixed(1)} ${pt[1].toFixed(1)}` : d, '').trim();
  const summary = months.map((m, i) => `${monthLabel(m)}: ${completed[i]} terminadas${punctual[i] !== null ? `, ${Math.round(punctual[i]! * 100)}% a tiempo` : ''}`).join('; ');

  const evaluations = w.evaluations.filter(e => e.current && (!areaFilter || e.areaId === areaFilter));
  const skills = w.skills.map(k => {
    const series = months.map(m => { const v = evaluations.filter(e => month(e.createdAt) === m).flatMap(e => e.scores.filter(s => s.skillId === k.id && s.score !== null).map(s => s.score!)); return v.length ? v.reduce((n, x) => n + x, 0) / v.length : null; });
    const known = series.filter((v): v is number => v !== null);
    return { k, series, count: known.length, first: known[0], last: known.at(-1) };
  }).filter(s => s.count >= 2).sort((a, b) => b.count - a.count).slice(0, 6);

  return <section className="panel report-section trends" aria-labelledby="report-trends">
    <div className="section-title"><h2 id="report-trends">Tendencia de los últimos 6 meses</h2></div>
    <figure className="trend-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Actividades terminadas y entregas a tiempo por mes. ${summary}.`}>
        {[0, .5, 1].map(f => <line key={f} className="trend-grid" x1={left} x2={W - right} y1={top + plot * (1 - f)} y2={top + plot * (1 - f)} />)}
        {completed.map((c, i) => { const h = plot * c / max; return <g key={months[i]}>
          <rect className="trend-bar" x={cx(i) - step * .22} width={step * .44} y={top + plot - h} height={Math.max(h, c ? 2 : 0)} rx="4" style={{ '--i': i } as CSSProperties} />
          {c > 0 && <text className={`trend-value ${h > 26 ? 'is-inside' : ''}`} x={cx(i)} y={h > 26 ? top + plot - h + 17 : top + plot - h - 5} textAnchor="middle">{c}</text>}
          <text className="trend-month" x={cx(i)} y={H - 10} textAnchor="middle">{monthLabel(months[i])}</text>
        </g>; })}
        {path && <path className="trend-line" d={path} pathLength={1} />}
        {line.map((pt, i) => pt && <circle key={i} className="trend-dot" cx={pt[0]} cy={pt[1]} r="4" style={{ '--i': i } as CSSProperties}><title>{`${Math.round(punctual[i]! * 100)}% a tiempo`}</title></circle>)}
      </svg>
      <figcaption className="radar-legend"><span><i className="legend-swatch trend-key-bar" />Actividades terminadas</span><span><i className="legend-line trend-key-line" />Entregas a tiempo (0 a 100%)</span></figcaption>
    </figure>
    <h3 className="subhead">Cómo evoluciona cada habilidad</h3>
    {skills.length ? <ul className="skill-trends">{skills.map(({ k, series, first, last }) => {
      const known = series.map((v, i) => v === null ? null : [i, v] as const).filter(Boolean) as (readonly [number, number])[];
      const pts = known.map(([i, v]) => `${(i / (months.length - 1)) * 96 + 2},${26 - (v / 10) * 22}`).join(' ');
      const delta = last! - first!;
      return <li key={k.id}>
        <span className="skill-trend-name">{k.name}</span>
        <svg className="sparkline" viewBox="0 0 100 28" aria-hidden="true"><polyline points={pts} pathLength={1} /></svg>
        <strong>{last!.toFixed(1)}</strong>
        <span className={`trend ${Math.abs(delta) < .1 ? '' : delta > 0 ? 'trend-up' : 'trend-down'}`}>{Math.abs(delta) < .1 ? 'Estable' : <>{delta > 0 ? <TrendUp size={13} weight="bold" /> : <TrendDown size={13} weight="bold" />}{delta > 0 ? '+' : ''}{delta.toFixed(1)}</>}</span>
      </li>;
    })}</ul> : <p className="side-empty">Hace falta evaluar la misma habilidad en al menos dos meses distintos.</p>}
  </section>;
}
