import { WarningCircle } from '@phosphor-icons/react';
import type { Assignment, Student, Workspace } from '../../shared/types';
import { useApp } from '../context';
import { assignmentProgress, assignmentState, dateKey, DAY, formatDate, hoursProgress, plural, studentPeriod, type Tone } from '../lib';
import Gantt, { type GanttRow, type GanttScale, type GanttTone } from './Gantt';
import { phaseInfo, STEP_LABEL, THESIS_PHASES, type ThesisPhase } from '../../shared/thesis';
import { Notice, ProgressRing } from './ui';

const at = (key: string) => Date.parse(`${key}T12:00:00-06:00`);
export const barTone = (a: Assignment, w: Workspace): GanttTone => { const t: Tone = assignmentState(a, w).tone; return a.status === 'cancelled' ? 'idle' : t; };
/** Fin de la barra: la fecha límite; sin ella, la fecha de cierre o una semana desde el inicio (y nunca antes de hoy si sigue abierta). */
export function barEnd(a: Assignment, start: number) {
  if (a.dueAt) return Date.parse(a.dueAt);
  if (a.status === 'completed' || a.status === 'cancelled') return Math.max(start + DAY, Date.parse(a.updatedAt));
  return Math.max(start + 7 * DAY, Date.now());
}

/** Avance de horas con la fecha probable de término. */
export function HoursSummary({ w, student }: { w: Workspace; student: Student }) {
  const h = hoursProgress(w, student);
  if (!h) return null;
  return <div className={`hours ${h.behind ? 'is-behind' : ''}`}>
    <ProgressRing value={h.done} total={h.required} size={52} tone={h.complete ? 'ok' : h.behind ? 'warn' : 'info'} />
    <div>
      <strong>{h.done} de {h.required} h</strong>
      <small>{h.complete ? 'Completó sus horas.' : h.projected ? `A este ritmo termina el ${formatDate(h.projected, { year: 'numeric' })}${h.behind ? ', después de su fecha de término' : ''}.` : 'Aún sin horas registradas.'}</small>
    </div>
  </div>;
}

/** Tramos reales por fase, sacados del historial: un regreso de fase abre otro tramo de la misma fase. */
function thesisSegments(student: Student) {
  const t = student.thesis!; const segments: { phase: ThesisPhase; start: number; end: number; current: boolean }[] = [];
  let phase: ThesisPhase = t.history[0]?.phase ?? t.phase; let since = Date.parse(t.startedAt);
  for (const e of t.history) if (e.to && e.to !== phase) { segments.push({ phase, start: since, end: Date.parse(e.at), current: false }); phase = e.to; since = Date.parse(e.at); }
  const finished = t.step === 'done';
  segments.push({ phase, start: since, end: finished ? Date.parse(t.defendedAt ?? t.phaseSince) : Math.max(Date.now(), since + DAY), current: !finished });
  return segments;
}

/** Dónde debería ir según su cronograma, dónde va y cuántos días de atraso lleva. */
export function thesisSchedule(student: Student) {
  const t = student.thesis; if (!t?.plan?.length) return null;
  const now = Date.now(); const order = (p: ThesisPhase) => THESIS_PHASES.findIndex(x => x.id === p);
  const phased = t.plan.filter(p => p.phase).map(p => ({ ...p, phase: p.phase!, s: at(p.start), e: at(p.end) }));
  const expected = [...phased].filter(p => p.s <= now).sort((a, b) => order(b.phase) - order(a.phase))[0]?.phase ?? phased[0]?.phase ?? null;
  const planEnd = (p: ThesisPhase) => Math.max(...phased.filter(x => x.phase === p).map(x => x.e), -Infinity);
  const currentEnd = planEnd(t.phase);
  const delay = t.step === 'done' || !Number.isFinite(currentEnd) ? 0 : Math.max(0, Math.floor((now - currentEnd) / DAY));
  const defense = phased.find(p => p.phase === 'defense');
  return { expected, delay, defense: defense ? defense.s : Math.max(...phased.map(p => p.e)), ahead: expected ? order(t.phase) > order(expected) : false };
}

/** Fases de la tesis en el Gantt. Con cronograma: cada fila planeada (punteada) con lo real encima y el atraso.
 *  Sin él: lo recorrido con sus fechas, la fase actual hasta hoy y lo que falta repartido hasta la entrega estimada. */
export function thesisRows(student: Student): GanttRow[] {
  const t = student.thesis; if (!t) return [];
  const now = Date.now(); const finished = t.step === 'done'; const segments = thesisSegments(student);
  const idx = THESIS_PHASES.findIndex(p => p.id === t.phase);
  if (t.plan?.length) return t.plan.map((p, i) => {
    const plan = { start: at(p.start), end: at(p.end) + DAY - 1 };
    if (!p.phase) return { id: `thesis-plan-${i}`, label: p.label, sub: 'En paralelo · planeado', group: 'Tesis', plan, describe: `${p.label}: planeado del ${formatDate(p.start)} al ${formatDate(p.end)}, en paralelo con las fases.`, detail: ['Corre en paralelo a las fases.'] } satisfies GanttRow;
    const n = THESIS_PHASES.findIndex(x => x.id === p.phase); const own = segments.filter(s => s.phase === p.phase);
    const state = finished || n < idx ? 'done' : n === idx ? 'now' : 'todo';
    const real = own.length ? { start: Math.min(...own.map(s => s.start)), end: Math.max(...own.map(s => s.end)) } : null;
    const late = state === 'now' ? Math.max(0, Math.floor((now - plan.end) / DAY)) : state === 'done' && real ? Math.max(0, Math.floor((real.end - plan.end) / DAY)) : 0;
    const sub = state === 'done' ? `Aprobada${late ? ` · ${plural(late, 'día', 'días')} tarde` : ''}` : state === 'now' ? `${STEP_LABEL[t.step]}${late ? ` · ${plural(late, 'día', 'días')} de atraso` : ''}` : now > plan.start ? 'Debió empezar' : 'Pendiente';
    const tone: GanttTone = state === 'done' ? 'ok' : state === 'now' ? (late ? 'warn' : 'info') : 'idle';
    return { id: `thesis-plan-${i}`, label: p.label, sub, group: 'Tesis', plan, milestone: p.phase === 'defense',
      ...(real && state !== 'todo' ? { start: real.start, end: real.end } : p.phase === 'defense' ? { start: plan.start, end: plan.end } : {}),
      tone: p.phase === 'defense' && state !== 'done' ? 'idle' : tone,
      describe: `${p.label}: planeado del ${formatDate(p.start)} al ${formatDate(p.end)}. ${sub}.`,
      detail: [`Fase ${phaseInfo(p.phase).n} del flujo · ${phaseInfo(p.phase).short}`, ...(real && state !== 'todo' ? [`Real: ${formatDate(new Date(real.start))} – ${state === 'now' ? 'hoy' : formatDate(new Date(real.end))}`] : []), ...(late ? [`${plural(late, 'día', 'días')} después de lo planeado`] : [])] } satisfies GanttRow;
  });
  const rows: GanttRow[] = segments.map((s, i) => { const info = phaseInfo(s.phase);
    return { id: `thesis-${i}`, label: `${info.n}. ${info.label}`, sub: s.current ? STEP_LABEL[t.step] : 'Aprobada', group: 'Tesis', start: s.start, end: s.end, tone: s.current ? 'info' : 'ok', progress: s.current ? null : 100,
      describe: `${info.label}: del ${formatDate(new Date(s.start))} al ${s.current ? 'hoy' : formatDate(new Date(s.end))}.` }; });
  // Proyección: las fases que faltan, repartidas entre hoy y la entrega estimada.
  const remaining = finished ? [] : THESIS_PHASES.slice(idx + 1);
  const due = t.estimateMonths ? Date.parse(t.startedAt) + t.estimateMonths * 30.44 * DAY : null;
  if (remaining.length && due && due > now) { const step = (due - now) / remaining.length;
    remaining.forEach((p, i) => rows.push({ id: `thesis-plan-${p.id}`, label: `${p.n}. ${p.label}`, sub: 'Estimada', group: 'Tesis', start: now + i * step, end: now + (i + 1) * step, tone: 'idle', describe: `${p.label}: estimada del ${formatDate(new Date(now + i * step))} al ${formatDate(new Date(now + (i + 1) * step))}.` })); }
  return rows;
}

/** Filas del plan: tesis (si tiene), actividades por fase con revisiones y entregas, y el seguimiento general. */
export function planRows(student: Student, w: Workspace, openAssignment: (id: string) => void): GanttRow[] {
  const assignments = w.assignments.filter(a => a.studentId === student.id).sort((a, b) => (a.startAt ?? a.createdAt).localeCompare(b.startAt ?? b.createdAt));
  const phases = assignments.some(a => a.phase) || !!student.thesis;
  const rows: GanttRow[] = assignments.map(a => {
    const start = Date.parse(a.startAt ?? a.createdAt); const end = barEnd(a, start);
    const state = assignmentState(a, w); const progress = assignmentProgress(a, w);
    const reviews = w.reviews.filter(r => r.assignmentId === a.id && r.status !== 'cancelled');
    const deliveries = w.deliveries.filter(d => d.assignmentId === a.id && d.completeness !== 'not_submitted');
    return {
      id: a.id, label: a.title, sub: `${state.label}${a.dueAt ? ` · vence ${formatDate(a.dueAt)}` : ''}`, group: phases ? a.phase || '' : undefined,
      start, end, tone: barTone(a, w), progress: a.status === 'cancelled' ? null : progress, onClick: () => openAssignment(a.id),
      markers: [...reviews.map(r => ({ at: Date.parse(r.startsAt), kind: r.status === 'completed' ? 'review-done' as const : 'review' as const, title: `Revisión ${formatDate(r.startsAt)}` })), ...deliveries.map(d => ({ at: Date.parse(d.receivedAt), kind: 'delivery' as const, title: `Entrega ${formatDate(d.receivedAt)}` }))],
      describe: `${a.title}: del ${formatDate(new Date(start))} al ${formatDate(new Date(end))}. ${state.label}.${progress !== null && progress < 100 ? ` Avance ${progress} %.` : ''} ${plural(reviews.length, 'revisión', 'revisiones')}, ${plural(deliveries.length, 'entrega', 'entregas')}.`,
      detail: [...(progress !== null && progress < 100 ? [`Avance ${progress} %`] : []), `${plural(reviews.length, 'revisión', 'revisiones')} · ${plural(deliveries.length, 'entrega', 'entregas')}`],
    };
  });
  rows.unshift(...thesisRows(student));
  const general = w.reviews.filter(r => r.studentId === student.id && !r.assignmentId && r.status !== 'cancelled');
  if (general.length) rows.push({ id: 'general', label: 'Seguimiento general', sub: plural(general.length, 'revisión', 'revisiones'), group: phases ? 'Seguimiento' : undefined,
    markers: general.map(r => ({ at: Date.parse(r.startsAt), kind: r.status === 'completed' ? 'review-done' : 'review', title: `Revisión ${formatDate(r.startsAt)}` })),
    describe: `Revisiones de seguimiento general: ${general.length}.` });
  return rows;
}

export function planBand(w: Workspace, student: Student) {
  const period = studentPeriod(w, student);
  return { start: at(period.start), end: period.end ? at(period.end) : null, label: period.explicit ? `Periodo${period.end ? ` · termina el ${formatDate(`${period.end}T12:00:00-06:00`)}` : ''}` : 'Periodo estimado por sus actividades' };
}
/** Abre la vista ampliada del Gantt en otra pestaña (o en esta si el navegador la bloquea). */
export function openGantt(params: Record<string, string>) {
  const url = `${location.pathname}${location.search}#gantt?${new URLSearchParams(params)}`;
  if (!window.open(url, '_blank')) location.hash = `gantt?${new URLSearchParams(params)}`;
}

/** Plan del alumno: actividades por fase sobre su periodo, con revisiones y entregas. */
export default function StudentPlan({ student, size = 'compact', scale }: { student: Student; size?: 'compact' | 'full'; scale?: GanttScale }) {
  const app = useApp(); const w = app.workspace;
  const period = studentPeriod(w, student);
  const outside = period.end ? w.assignments.filter(a => a.studentId === student.id && a.dueAt && a.status !== 'cancelled' && dateKey(a.dueAt) > period.end!) : [];
  return <>
    {size === 'compact' && <HoursSummary w={w} student={student} />}
    {outside.length > 0 && <Notice tone="warn" icon={<WarningCircle size={18} weight="fill" />}><p>{outside.length === 1 ? '1 actividad vence' : `${outside.length} actividades vencen`} después del fin de su periodo ({formatDate(`${period.end}T12:00:00-06:00`, { year: 'numeric' })}).</p></Notice>}
    <Gantt rows={planRows(student, w, app.openAssignment)} label={`Plan de ${student.name}`} size={size} scale={scale}
      onExpand={size === 'compact' ? () => openGantt({ student: student.id }) : undefined}
      band={planBand(w, student)}
      empty={<p className="drawer-empty">Sin actividades todavía. Al asignarle una, aparecerá aquí con su fecha de inicio y su fecha límite.</p>} />
    {!period.explicit && size === 'compact' && <p className="footnote">Registra el inicio y el término en «Editar expediente» para ver si el plan cabe en su periodo.</p>}
  </>;
}
