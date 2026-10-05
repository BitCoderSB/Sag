import { CalendarX, CheckCircle, ClockCounterClockwise } from '@phosphor-icons/react';
import type { Review } from '../../shared/types';
import { useApp } from '../context';
import { dayLabel, formatTime, isPastUnrecorded, reviewLabels, reviewStatusLabels } from '../lib';
import { AreaTag, Badge, Button, Menu } from './ui';
import AgreementList, { pendingTitle, previousWithPending } from './Agreements';

export default function ReviewCard({ review, withDate = false, showStudent = true, showActivity = true }: { review: Review; withDate?: boolean; showStudent?: boolean; showActivity?: boolean }) {
  const app = useApp(); const w = app.workspace;
  const student = w.students.find(s => s.id === review.studentId);
  const assignment = w.assignments.find(a => a.id === review.assignmentId);
  const editable = !app.readonly && review.areaId === w.user.areaId && review.status === 'scheduled';
  const due = isPastUnrecorded(review);
  const tone = review.status === 'completed' ? 'ok' : review.status === 'scheduled' ? due ? 'warn' : 'info' : 'neutral';
  const label = due ? 'Sin registrar' : reviewStatusLabels[review.status];
  const own = !app.readonly && review.areaId === w.user.areaId;
  const carried = review.status === 'scheduled' ? previousWithPending(w, review) : undefined;
  return <article className={`review-card ${due ? 'is-due' : ''} ${review.status !== 'scheduled' ? 'is-closed' : ''} ${app.fresh.has(review.id) ? 'is-fresh' : ''}`}>
    <div className="review-card-head">
      <span className="review-when">{withDate && <strong>{dayLabel(review.startsAt)}</strong>}<strong>{formatTime(review.startsAt)}</strong><span>{review.durationMinutes} min · {reviewLabels[review.type]}</span></span>
      <Badge tone={tone}>{label}</Badge>
      {app.readonly && <AreaTag id={review.areaId} compact />}
      {editable && <Menu label="Más acciones de la revisión" items={[
        { label: 'Registrar resultado', icon: <CheckCircle size={16} />, onSelect: () => app.modal({ type: 'reviewUpdate', review, mode: 'record' }) },
        { label: 'Reprogramar', icon: <ClockCounterClockwise size={16} />, onSelect: () => app.modal({ type: 'reviewUpdate', review, mode: 'reschedule' }) },
        'separator',
        { label: 'Cancelar revisión', icon: <CalendarX size={16} />, danger: true, onSelect: () => app.modal({ type: 'reviewUpdate', review, mode: 'cancel' }) },
      ]} />}
    </div>
    {(showStudent || showActivity) && <div className="review-card-body">
      {showStudent && student && <button type="button" className="link-strong" onClick={() => app.openStudent(student.id)}>{student.name}</button>}
      {showActivity && (assignment ? <button type="button" className="link-muted" onClick={() => app.openAssignment(assignment.id)}>{assignment.title}</button> : <span className="muted">Seguimiento general</span>)}
    </div>}
    {review.notes && <p className="review-note"><span>Temas</span>{review.notes}</p>}
    {review.outcome && <p className="review-note"><span>{review.status === 'completed' ? 'Resultado' : 'Motivo'}</span>{review.outcome}{review.hours ? ` · ${review.hours} h` : ''}</p>}
    {review.status === 'completed' && <AgreementList review={review} editable={own} />}
    {carried && <AgreementList review={carried} title={pendingTitle(carried)} editable={own} />}
    {editable && due && <Button size="sm" onClick={() => app.modal({ type: 'reviewUpdate', review, mode: 'record' })}>Registrar resultado</Button>}
  </article>;
}
