import { WarningCircle } from '@phosphor-icons/react';
import type { Assignment, Student, Workspace } from '../../shared/types';
import { useApp } from '../context';
import { assignmentProgress, assignmentState, dateKey, DAY, formatDate, hoursProgress, plural, studentPeriod, type Tone } from '../lib';
import Gantt, { type GanttRow, type GanttTone } from './Gantt';
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

/** Plan del alumno: actividades por fase sobre su periodo, con revisiones y entregas. */
export default function StudentPlan({ student }: { student: Student }) {
  const app = useApp(); const w = app.workspace;
  const period = studentPeriod(w, student);
  const assignments = w.assignments.filter(a => a.studentId === student.id).sort((a, b) => (a.startAt ?? a.createdAt).localeCompare(b.startAt ?? b.createdAt));
  const phases = assignments.some(a => a.phase);
  const rows: GanttRow[] = assignments.map(a => {
    const start = Date.parse(a.startAt ?? a.createdAt); const end = barEnd(a, start);
    const state = assignmentState(a, w);
    const reviews = w.reviews.filter(r => r.assignmentId === a.id && r.status !== 'cancelled');
    const deliveries = w.deliveries.filter(d => d.assignmentId === a.id && d.completeness !== 'not_submitted');
    return {
      id: a.id, label: a.title, sub: `${state.label}${a.dueAt ? ` · vence ${formatDate(a.dueAt)}` : ''}`, group: phases ? a.phase || '' : undefined,
      start, end, tone: barTone(a, w), progress: a.status === 'cancelled' ? null : assignmentProgress(a, w), onClick: () => app.openAssignment(a.id),
      markers: [...reviews.map(r => ({ at: Date.parse(r.startsAt), kind: r.status === 'completed' ? 'review-done' as const : 'review' as const, title: `Revisión ${formatDate(r.startsAt)}` })), ...deliveries.map(d => ({ at: Date.parse(d.receivedAt), kind: 'delivery' as const, title: `Entrega ${formatDate(d.receivedAt)}` }))],
      describe: `${a.title}: del ${formatDate(new Date(start))} al ${formatDate(new Date(end))}. ${state.label}.${(() => { const p = assignmentProgress(a, w); return p !== null && p < 100 ? ` Avance ${p} %.` : ''; })()} ${plural(reviews.length, 'revisión', 'revisiones')}, ${plural(deliveries.length, 'entrega', 'entregas')}.`,
    };
  });
  const general = w.reviews.filter(r => r.studentId === student.id && !r.assignmentId && r.status !== 'cancelled');
  if (general.length) rows.push({ id: 'general', label: 'Seguimiento general', sub: plural(general.length, 'revisión', 'revisiones'), group: phases ? 'Seguimiento' : undefined,
    markers: general.map(r => ({ at: Date.parse(r.startsAt), kind: r.status === 'completed' ? 'review-done' : 'review', title: `Revisión ${formatDate(r.startsAt)}` })),
    describe: `Revisiones de seguimiento general: ${general.length}.` });
  const outside = period.end ? assignments.filter(a => a.dueAt && a.status !== 'cancelled' && dateKey(a.dueAt) > period.end!) : [];
  return <>
    <HoursSummary w={w} student={student} />
    {outside.length > 0 && <Notice tone="warn" icon={<WarningCircle size={18} weight="fill" />}><p>{outside.length === 1 ? '1 actividad vence' : `${outside.length} actividades vencen`} después del fin de su periodo ({formatDate(`${period.end}T12:00:00-06:00`, { year: 'numeric' })}).</p></Notice>}
    <Gantt rows={rows} label={`Plan de ${student.name}`}
      band={{ start: at(period.start), end: period.end ? at(period.end) : null, label: period.explicit ? `Periodo${period.end ? ` · termina el ${formatDate(`${period.end}T12:00:00-06:00`)}` : ''}` : 'Periodo estimado por sus actividades' }}
      empty={<p className="drawer-empty">Sin actividades todavía. Al asignarle una, aparecerá aquí con su fecha de inicio y su fecha límite.</p>} />
    {!period.explicit && <p className="footnote">Registra el inicio y el término en «Editar expediente» para ver si el plan cabe en su periodo.</p>}
  </>;
}
