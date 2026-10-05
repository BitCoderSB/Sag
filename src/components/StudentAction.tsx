import { CalendarBlank, Exam, Plus, TrendUp } from '@phosphor-icons/react';
import type { Student } from '../../shared/types';
import { useApp } from '../context';
import { scoped, studentStep } from '../lib';
import { Button } from './ui';

const ICON = { assign: Plus, progress: TrendUp, evaluate: Exam, reschedule: CalendarBlank };

/**
 * La acción que toca con este alumno, siempre visible donde aparece: registrar avance de su actividad actual,
 * evaluar lo que entregó, asignarle algo o cambiar la fecha si no entregó. Solo para sus responsables.
 */
export default function StudentAction({ student, full = false, size = 'sm', primary = false }: { student: Student; full?: boolean; size?: 'sm' | 'md'; primary?: boolean }) {
  const app = useApp(); const w = scoped(app.workspace);
  if (app.readonly || student.status !== 'active' || !student.areaIds.includes(w.user.areaId!)) return null;
  const step = studentStep(w, student); const Icon = ICON[step.kind];
  function run() {
    if (step.kind === 'assign') app.modal({ type: 'assignment', studentId: student.id });
    else if (step.kind === 'evaluate' && step.assignment) app.modal({ type: 'evaluate', assignment: step.assignment });
    else if (step.kind === 'reschedule' && step.assignment) app.modal({ type: 'assignmentEdit', assignment: step.assignment, mode: 'edit' });
    else app.modal({ type: 'progress', assignment: step.assignment });
  }
  const text = full ? step.label : step.short;
  return <Button size={size} variant={primary || step.kind === 'evaluate' ? 'primary' : 'secondary'} className={`student-action action-${step.kind}`}
    onClick={e => { e.stopPropagation(); run(); }} aria-label={full ? undefined : `${text}: ${student.name}`} title={step.assignment ? `${step.label} · ${step.assignment.title}` : step.label}>
    <Icon size={14} weight="bold" aria-hidden="true" />{text}
  </Button>;
}
