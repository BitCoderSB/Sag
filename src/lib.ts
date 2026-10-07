import type { AreaId, PauseKind, Assignment, Evaluation, Meeting, Review, Student, Workspace } from '../shared/types';

const zone = 'America/Mexico_City';
export const DAY = 86_400_000;

// Crear un Intl.DateTimeFormat es caro: se reutiliza uno por combinación de opciones (el calendario formatea miles de fechas).
const keyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
const formats = new Map<string, Intl.DateTimeFormat>();
const formatter = (options: Intl.DateTimeFormatOptions) => {
  // La clave conserva las opciones en undefined: anulan los valores por omisión (día y mes).
  const id = Object.entries(options).map(([k, v]) => `${k}=${v}`).join('|'); let fmt = formats.get(id);
  if (!fmt) { fmt = new Intl.DateTimeFormat('es-MX', { timeZone: zone, day: 'numeric', month: 'short', ...options }); formats.set(id, fmt); }
  return fmt;
};
export const dateKey = (date: string | Date = new Date()) => keyFormat.format(new Date(date));
export const today = () => dateKey();
export const formatDate = (date: string | Date, options: Intl.DateTimeFormatOptions = {}) => formatter(options).format(new Date(date));
export const formatTime = (date: string) => formatDate(date, { day: undefined, month: undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const fullDate = (date: string | Date) => formatDate(date, { weekday: 'long', month: 'long', year: 'numeric' });
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const toInputDate = (date: string) => dateKey(date);
export const toInputDateTime = (date: string) => `${dateKey(date)}T${formatTime(date)}`;
export const fromInput = (value: string) => value ? new Date(`${value.length === 10 ? value + 'T23:59' : value}:00-06:00`).toISOString() : null;
export const futureInput = (days = 1, hour = '10:00') => {
  const date = new Date(); date.setDate(date.getDate() + days);
  return `${dateKey(date)}T${hour}`;
};
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
export const firstName = (name = '') => name.trim().split(/\s+/)[0] ?? '';
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const studentById = (w: Workspace, id: string) => w.students.find(s => s.id === id);
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
export const reviewLabels = { follow_up: 'Seguimiento', delivery: 'Entrega', evaluation: 'Evaluación' };
export const reviewStatusLabels = { scheduled: 'Programada', completed: 'Realizada', cancelled: 'Cancelada', missed: 'No se realizó' };
export const statusLabels = { in_progress: 'En curso', pending_review: 'Por evaluar', changes_requested: 'Corrigiendo', completed: 'Terminada', cancelled: 'Cancelada' };
export const isOpen = (a: Assignment) => !['completed', 'cancelled'].includes(a.status);
/** Atrasada: venció sin entrega completa. Una actividad en espera por un impedimento no cuenta: su reloj está detenido. */
export const isLate = (a: Assignment, w?: Workspace) => isOpen(a) && !!a.dueAt && new Date(a.dueAt) < new Date() && !isWaiting(a) && !(w?.deliveries.some(d => d.assignmentId === a.id && d.completeness === 'complete'));
export const nextReview = (w: Workspace, studentId: string) => w.reviews.filter(r => r.studentId === studentId && r.status === 'scheduled' && new Date(r.startsAt) >= new Date()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
export const startOfToday = () => Date.parse(`${today()}T00:00:00-06:00`);
export const isPastUnrecorded = (r: Review) => r.status === 'scheduled' && Date.parse(r.startsAt) < Date.now();

const noon = (key: string) => Date.parse(`${key}T12:00:00-06:00`);
export const dayDiff = (date: string | Date) => Math.round((noon(dateKey(date)) - noon(today())) / DAY);

/** "hoy", "mañana", "ayer", "el jueves", "hace 3 días", "el 12 oct" */
/** «desde hace 3 días»: cuánto lleva detenida una actividad con impedimento. */
export const blockedSince = (a: Assignment) => `desde ${relativeDay(a.blockedSince ?? a.updatedAt)}`;
export function relativeDay(date: string | Date) {
  const diff = dayDiff(date);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  if (diff > 1 && diff < 7) return `el ${formatDate(date, { weekday: 'long', day: undefined, month: undefined })}`;
  if (diff < -1 && diff > -7) return `hace ${-diff} días`;
  return `el ${formatDate(date)}`;
}
/** Etiqueta corta de día: "Hoy", "Mañana", "Ayer" o "jue 2 oct" ("jue 2" en modo compacto) */
export function dayLabel(date: string | Date, compact = false) {
  const diff = dayDiff(date);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return capitalize(formatDate(date, { weekday: 'short', month: compact ? undefined : 'short' }).replace(',', ''));
}
export function dueText(a: Assignment) {
  if (!a.dueAt) return 'Sin fecha de entrega';
  if (new Date(a.dueAt) < new Date()) return dayDiff(a.dueAt) === 0 ? 'Venció hoy' : `Venció ${relativeDay(a.dueAt)}`;
  return `Vence ${relativeDay(a.dueAt)}`;
}
export function timeAgo(date: string) {
  const minutes = Math.round((Date.now() - Date.parse(date)) / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 60 * 12 && dayDiff(date) === 0) return `hace ${Math.round(minutes / 60)} h`;
  return relativeDay(date);
}
/** Los textos del historial guardan fechas ISO; se muestran en hora local. */
export const cleanDetail = (text: string) => text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z/g, iso => `${formatDate(iso, { year: 'numeric' })}, ${formatTime(iso)}`);
export function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'idle' | 'wait';

/* ---------- Impedimento en espera ----------
   Con fecha de revisión futura, la actividad está «en espera»: no pide atención y no cuenta como atrasada.
   Ese día vuelve como pendiente («revisar impedimento») y, si pasa la fecha sin atenderlo, sube a rojo. */
export const isWaiting = (a: Assignment) => !!a.blockedReason && !!a.blockedReviewAt && a.blockedReviewAt > today();
/** Pasó la fecha que se puso para revisarlo (o lleva más de una semana sin fecha) y nadie lo atendió. */
export const blockEscalated = (a: Assignment) => !!a.blockedReason && !isWaiting(a) && (a.blockedReviewAt ? a.blockedReviewAt < today() : dayDiff(a.blockedSince ?? a.updatedAt) <= -7);
export const PAUSE_LABELS: Record<PauseKind, string> = { temporary: 'Baja temporal', health: 'Salud o asunto personal', exams: 'Exámenes o vacaciones', no_contact: 'Sin contacto' };
/** Pausa de la participación del alumno en un área. */
export const pauseOf = (s: Student, areaId?: AreaId | null) => areaId ? s.pauses?.[areaId] : undefined;

/** Workspace limitado a lo que le corresponde ver en las vistas de seguimiento. */
export function scoped(w: Workspace, area: AreaId | 'all' = 'all'): Workspace {
  const own = w.user.role !== 'director' ? w.user.areaId : area === 'all' ? null : area;
  if (!own) return w;
  return { ...w, students: w.students.filter(s => s.areaIds.includes(own)).map(s => s.status === 'active' && s.pauses?.[own] ? { ...s, status: 'paused' as const } : s), assignments: w.assignments.filter(a => a.areaId === own), reviews: w.reviews.filter(r => r.areaId === own), meetings: (w.meetings ?? []).filter(m => m.areaIds.includes(own)) };
}

export function assignmentState(a: Assignment, w: Workspace): { label: string; tone: Tone } {
  if (a.status === 'cancelled') return { label: 'Cancelada', tone: 'neutral' };
  if (a.status === 'completed') return { label: 'Terminada', tone: 'ok' };
  if (a.status === 'pending_review') return { label: 'Por evaluar', tone: 'info' };
  if (a.blockedReason) return isWaiting(a) ? { label: 'En espera', tone: 'wait' } : { label: 'Con impedimento', tone: blockEscalated(a) ? 'danger' : 'warn' };
  if (isLate(a, w)) return w.deliveries.some(d => d.assignmentId === a.id && d.completeness === 'not_submitted') ? { label: 'No entregó', tone: 'warn' } : { label: 'Atrasada', tone: 'warn' };
  return { label: statusLabels[a.status], tone: 'neutral' };
}

export type Health = 'blocked' | 'late' | 'review' | 'waiting' | 'changes' | 'active' | 'idle' | 'paused' | 'done';
/**
 * Un solo vocabulario y una sola paleta para todas las vistas.
 * `tone` colorea el fondo solo cuando algo pide atención; `dot` es el semáforo
 * (aro del avatar, punto de la insignia, barra de salud) y también marca lo que va bien.
 */
export const HEALTH: Record<Health, { label: string; tone: Tone; dot: Tone }> = {
  blocked: { label: 'Con impedimento', tone: 'danger', dot: 'danger' },
  late: { label: 'Atrasado', tone: 'warn', dot: 'warn' },
  review: { label: 'Por evaluar', tone: 'info', dot: 'info' },
  changes: { label: 'Corrigiendo', tone: 'neutral', dot: 'ok' },
  active: { label: 'Al día', tone: 'neutral', dot: 'ok' },
  waiting: { label: 'En espera', tone: 'neutral', dot: 'wait' },
  idle: { label: 'Sin actividad', tone: 'idle', dot: 'idle' },
  paused: { label: 'En pausa', tone: 'neutral', dot: 'neutral' },
  done: { label: 'Terminó', tone: 'neutral', dot: 'neutral' },
};

/** Pasos de una actividad: asignada, entregada, evaluada. Es su pictograma de avance. */
export type StepState = 'done' | 'current' | 'todo' | 'warn' | 'danger' | 'partial' | 'off';
export function activitySteps(a: Assignment, w: Workspace): { steps: [StepState, StepState, StepState]; label: string } {
  if (a.status === 'cancelled') return { steps: ['off', 'off', 'off'], label: 'Cancelada' };
  if (a.status === 'completed') return { steps: ['done', 'done', 'done'], label: 'Asignada, entregada y evaluada' };
  if (a.status === 'changes_requested') return { steps: ['done', 'done', 'warn'], label: 'Evaluada; está corrigiendo' };
  if (a.status === 'pending_review') return { steps: ['done', 'done', 'current'], label: 'Entrega registrada, falta evaluar' };
  const partial = w.deliveries.some(d => d.assignmentId === a.id && d.completeness === 'partial');
  const second: StepState = a.blockedReason ? isWaiting(a) ? 'current' : 'danger' : isLate(a, w) ? 'warn' : partial ? 'partial' : 'current';
  return { steps: ['done', second, 'todo'], label: a.blockedReason ? isWaiting(a) ? 'En espera de algo externo' : 'Algo le impide avanzar' : isLate(a, w) ? 'Venció sin entrega registrada' : partial ? 'Avance registrado; falta la entrega final' : 'En curso; sin entrega registrada' };
}

const WORK_ACTIONS = new Set(['delivery_recorded', 'non_delivery_confirmed', 'evaluation_recorded', 'review_updated', 'review_created', 'assignment_created', 'assignment_updated', 'student_created', 'student_joined', 'note_created']);
/** Registros que hizo hoy el usuario actual. */
export const actionsToday = (w: Workspace) => w.audit.filter(e => e.actorName === w.user.name && dateKey(e.createdAt) === today() && WORK_ACTIONS.has(e.action)).length;
/** Grupos que se usan en Hoy, Panorama y Alumnos, con los mismos nombres que las insignias. */
export type HealthGroup = 'blocked' | 'late' | 'idle' | 'review' | 'waiting' | 'ontrack';
export const HEALTH_GROUPS: { id: HealthGroup; label: string; one: string; tone: Tone; members: Health[] }[] = [
  { id: 'blocked', label: 'Con impedimento', one: 'Con impedimento', tone: 'danger', members: ['blocked'] },
  { id: 'late', label: 'Atrasados', one: 'Atrasado', tone: 'warn', members: ['late'] },
  { id: 'idle', label: 'Sin actividad', one: 'Sin actividad', tone: 'idle', members: ['idle'] },
  { id: 'review', label: 'Por evaluar', one: 'Por evaluar', tone: 'info', members: ['review'] },
  { id: 'waiting', label: 'En espera', one: 'En espera', tone: 'wait', members: ['waiting'] },
  { id: 'ontrack', label: 'Al día', one: 'Al día', tone: 'ok', members: ['active', 'changes'] },
];
export function studentHealth(w: Workspace, s: Student): Health {
  if (s.status === 'paused') return 'paused';
  if (s.status === 'completed') return 'done';
  const open = w.assignments.filter(a => a.studentId === s.id && isOpen(a));
  if (open.some(a => a.blockedReason && !isWaiting(a) && a.status !== 'pending_review')) return 'blocked';
  // Una actividad en espera no cuenta como atrasada: su reloj está detenido.
  if (open.some(a => !a.blockedReason && isLate(a, w))) return 'late';
  if (open.some(a => a.status === 'pending_review')) return 'review';
  if (open.some(a => isWaiting(a))) return 'waiting';
  if (open.some(a => a.status === 'changes_requested')) return 'changes';
  return open.length ? 'active' : 'idle';
}
export const inGroup = (health: Health, group: HealthGroup) => HEALTH_GROUPS.find(g => g.id === group)!.members.includes(health);

/** La actividad abierta más urgente del alumno. */
export function currentAssignment(w: Workspace, studentId: string) {
  const rank = (a: Assignment) => a.blockedReason && !isWaiting(a) ? 0 : isLate(a, w) && !a.blockedReason ? 1 : a.status === 'pending_review' ? 2 : a.status === 'changes_requested' ? 3 : isWaiting(a) ? 5 : 4;
  return w.assignments.filter(a => a.studentId === studentId && isOpen(a)).sort((a, b) => rank(a) - rank(b) || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'))[0];
}

export type TaskKind = 'evaluate' | 'overdue' | 'unrecorded' | 'blocked' | 'no_delivery';
export interface Task { key: string; kind: TaskKind; studentId: string; assignment?: Assignment; review?: Review; date: string }
export const TASK_GROUPS: { kind: TaskKind; label: string; action: string; tone: Tone }[] = [
  { kind: 'evaluate', label: 'Por evaluar', action: 'Evaluar', tone: 'info' },
  { kind: 'overdue', label: 'Atrasadas', action: 'Registrar entrega', tone: 'warn' },
  { kind: 'unrecorded', label: 'Revisiones sin registrar', action: 'Registrar', tone: 'warn' },
  { kind: 'blocked', label: 'Con impedimento', action: 'Ver impedimento', tone: 'danger' },
  { kind: 'no_delivery', label: 'No entregaron', action: 'Cambiar fecha', tone: 'neutral' },
];
/** Lo que espera una acción del responsable. Las revisiones de hoy viven en la agenda del día, no aquí. */
export function pendingTasks(w: Workspace): Task[] {
  const tasks: Task[] = [];
  // Lo de alumnos en pausa (globalmente o en esta área) no pide nada mientras dure.
  const resting = new Set(w.students.filter(s => s.status !== 'active').map(s => s.id));
  for (const a of w.assignments.filter(a => isOpen(a) && !resting.has(a.studentId))) {
    const deliveries = w.deliveries.filter(d => d.assignmentId === a.id);
    if (a.status === 'pending_review') {
      const last = deliveries.filter(d => d.completeness === 'complete').sort((x, y) => y.receivedAt.localeCompare(x.receivedAt))[0];
      tasks.push({ key: `evaluate-${a.id}`, kind: 'evaluate', studentId: a.studentId, assignment: a, date: last?.receivedAt ?? a.updatedAt });
    } else if (a.blockedReason) {
      // Misma prioridad que assignmentState y studentHealth: un impedimento explica el retraso.
      // En espera no es pendiente; vuelve el día que se fijó para revisarlo.
      if (!isWaiting(a)) tasks.push({ key: `blocked-${a.id}`, kind: 'blocked', studentId: a.studentId, assignment: a, date: a.blockedReviewAt ? `${a.blockedReviewAt}T00:00:00Z` : a.blockedSince ?? a.updatedAt });
    } else if (isLate(a, w)) {
      const confirmed = deliveries.some(d => d.completeness === 'not_submitted');
      tasks.push({ key: `late-${a.id}`, kind: confirmed ? 'no_delivery' : 'overdue', studentId: a.studentId, assignment: a, date: a.dueAt! });
    }
  }
  const start = startOfToday();
  for (const r of w.reviews.filter(r => r.status === 'scheduled' && Date.parse(r.startsAt) < start && !resting.has(r.studentId))) {
    tasks.push({ key: `review-${r.id}`, kind: 'unrecorded', studentId: r.studentId, review: r, assignment: w.assignments.find(a => a.id === r.assignmentId), date: r.startsAt });
  }
  return tasks.sort((a, b) => a.date.localeCompare(b.date));
}
/** Alumnos activos sin trabajo abierto: también son un pendiente (asignarles algo). */
export const idleStudents = (w: Workspace) => w.students.filter(s => s.status === 'active' && studentHealth(w, s) === 'idle');
/** Total de pendientes con la misma definición en el contador del menú y en Hoy. */
export const todoCount = (w: Workspace) => pendingTasks(w).length + idleStudents(w).length + staleStudents(w).length;

/** Días sin revisión ni entrega a partir de los cuales un alumno sin cita próxima pide seguimiento. */
export const STALE_DAYS = 14;
/** Último contacto registrado: una revisión realizada o una entrega (en las áreas visibles). */
export function lastContact(w: Workspace, studentId: string) {
  const ids = new Set(w.assignments.filter(a => a.studentId === studentId).map(a => a.id));
  const dates = [...w.reviews.filter(r => r.studentId === studentId && r.status === 'completed').map(r => r.startsAt), ...w.deliveries.filter(d => ids.has(d.assignmentId) && d.completeness !== 'not_submitted').map(d => d.receivedAt)];
  return dates.sort().at(-1) ?? null;
}
export function followUp(w: Workspace, s: Student) {
  const next = nextReview(w, s.id); const last = lastContact(w, s.id) ?? s.createdAt;
  const days = Math.max(0, -dayDiff(last));
  return { next, last, days, stale: s.status === 'active' && !next && days >= STALE_DAYS };
}
/** Alumnos con trabajo pero sin cita próxima y sin contacto reciente. Los que no tienen actividad ya cuentan como «sin actividad». */
export const staleStudents = (w: Workspace) => w.students.filter(s => s.status === 'active' && !['idle', 'waiting'].includes(studentHealth(w, s)) && followUp(w, s).stale);

/** Horas reconocidas en revisiones realizadas y entregas. */
export function hoursDone(w: Workspace, studentId: string) {
  const ids = new Set(w.assignments.filter(a => a.studentId === studentId).map(a => a.id));
  return w.reviews.filter(r => r.studentId === studentId && r.status === 'completed').reduce((n, r) => n + (r.hours ?? 0), 0)
    + w.deliveries.filter(d => ids.has(d.assignmentId)).reduce((n, d) => n + (d.hours ?? 0), 0);
}
const dayStart = (key: string) => Date.parse(`${key}T12:00:00-06:00`);
/** Periodo del alumno; sin fechas registradas se toma de sus actividades. */
export function studentPeriod(w: Workspace, s: Student) {
  const own = w.assignments.filter(a => a.studentId === s.id && a.status !== 'cancelled');
  const starts = own.map(a => a.startAt ?? a.createdAt); const ends = own.map(a => a.dueAt).filter(Boolean) as string[];
  return {
    start: s.startDate ?? dateKey([...starts, s.createdAt].sort()[0]),
    end: s.endDate ?? (ends.length ? dateKey(ends.sort().at(-1)!) : null),
    explicit: !!(s.startDate || s.endDate),
  };
}
/** Avance de horas y fecha probable de término al ritmo actual. */
export function hoursProgress(w: Workspace, s: Student) {
  if (!s.hoursRequired) return null;
  const done = hoursDone(w, s.id); const required = s.hoursRequired;
  const elapsed = Math.max(1, (Date.now() - dayStart(studentPeriod(w, s).start)) / DAY);
  const rate = done / elapsed;
  const projected = done >= required ? null : rate > 0 ? new Date(Date.now() + (required - done) / rate * DAY) : null;
  return { done, required, ratio: Math.min(1, done / required), projected, behind: !!(projected && s.endDate && dateKey(projected) > s.endDate), complete: done >= required };
}
/** Avance de una actividad: 100 si ya se entregó completa o terminó; si no, el último avance estimado. */
export function assignmentProgress(a: Assignment, w: Workspace): number | null {
  if (a.status === 'completed' || a.status === 'pending_review') return 100;
  const last = w.deliveries.filter(d => d.assignmentId === a.id && d.completeness === 'partial' && typeof d.progress === 'number').sort((x, y) => y.receivedAt.localeCompare(x.receivedAt))[0];
  return last?.progress ?? null;
}
export type StudentStep = { kind: 'assign' | 'progress' | 'evaluate' | 'reschedule'; label: string; short: string; assignment?: Assignment };
/** Lo siguiente que el responsable puede registrar para un alumno, según su actividad más urgente. */
export function studentStep(w: Workspace, s: Student): StudentStep {
  const current = currentAssignment(w, s.id);
  if (!current) return { kind: 'assign', label: 'Asignar actividad', short: 'Asignar' };
  if (current.status === 'pending_review') return { kind: 'evaluate', label: 'Evaluar entrega', short: 'Evaluar', assignment: current };
  const confirmedNone = w.deliveries.some(d => d.assignmentId === current.id && d.completeness === 'not_submitted');
  if (isLate(current, w) && confirmedNone) return { kind: 'reschedule', label: 'Cambiar fecha', short: 'Cambiar fecha', assignment: current };
  return { kind: 'progress', label: 'Registrar avance', short: 'Avance', assignment: current };
}
/** Entregas abiertas del alumno en la misma semana que una fecha (en las áreas visibles). */
export function weekLoad(w: Workspace, studentId: string, date: string) {
  const keys = new Set(weekDays(new Date(date)).map(d => dateKey(d)));
  return w.assignments.filter(a => a.studentId === studentId && isOpen(a) && a.dueAt && keys.has(dateKey(a.dueAt)));
}
/** Reuniones vigentes de un día; `areaId` limita a las de un responsable (el jefe ve todas). */
export function meetingsOn(w: Workspace, key: string, areaId?: AreaId | null): Meeting[] {
  return (w.meetings ?? []).filter(m => m.status === 'scheduled' && dateKey(m.startsAt) === key && (!areaId || m.areaIds.includes(areaId))).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
export function upcomingMeetings(w: Workspace, areaId?: AreaId | null, limit = 5): Meeting[] {
  const start = startOfToday();
  return (w.meetings ?? []).filter(m => m.status === 'scheduled' && Date.parse(m.startsAt) >= start && (!areaId || m.areaIds.includes(areaId))).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, limit);
}
export function reviewsOn(w: Workspace, key: string) {
  return w.reviews.filter(r => dateKey(r.startsAt) === key && r.status !== 'cancelled').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Promedio por habilidad de todos los alumnos con evidencia: referencia para comparar un perfil. */
export function groupSkillAverages(evaluations: Evaluation[]) {
  const map = new Map<string, { total: number; count: number }>();
  evaluations.filter(e => e.current).forEach(e => e.scores.forEach(s => {
    if (s.score === null) return;
    const v = map.get(s.skillId) ?? { total: 0, count: 0 }; v.total += s.score; v.count += 1; map.set(s.skillId, v);
  }));
  return new Map([...map].map(([id, v]) => [id, v.total / v.count]));
}
/** Cambio entre las dos evaluaciones más recientes de una habilidad (null si solo hay una). */
export function skillTrend(evaluations: Evaluation[], studentId: string, skillId: string) {
  const values = evaluations.filter(e => e.studentId === studentId && e.current).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).flatMap(e => e.scores.filter(s => s.skillId === skillId && s.score !== null).map(s => s.score!));
  return values.length >= 2 ? values[values.length - 1] - values[values.length - 2] : null;
}
/** Entregas completas a tiempo frente a las que tenían fecha límite. */
export function punctuality(w: Workspace, studentId: string) {
  const withDue = w.assignments.filter(a => a.studentId === studentId && a.dueAt && a.status !== 'cancelled');
  let onTime = 0; let counted = 0;
  for (const a of withDue) {
    const first = w.deliveries.filter(d => d.assignmentId === a.id && d.completeness === 'complete').sort((x, y) => x.receivedAt.localeCompare(y.receivedAt))[0];
    if (first) { counted++; if (Date.parse(first.receivedAt) <= Date.parse(a.dueAt!)) onTime++; }
    else if (Date.parse(a.dueAt!) < Date.now()) counted++;
  }
  return { onTime, counted };
}
export function skillStats(evaluations: Evaluation[], studentId: string) {
  const map = new Map<string, { skillId: string; total: number; count: number; latest: string }>();
  evaluations.filter(e => e.studentId === studentId && e.current).forEach(e => e.scores.forEach(s => {
    if (s.score === null) return;
    const value = map.get(s.skillId) ?? { skillId: s.skillId, total: 0, count: 0, latest: '' };
    value.total += s.score; value.count += 1;
    if (e.createdAt > value.latest) value.latest = e.createdAt;
    map.set(s.skillId, value);
  }));
  return [...map.values()].map(s => ({ ...s, average: s.total / s.count })).sort((a, b) => b.average - a.average);
}
export const scoreLevel = (score: number) => score < 3 ? 'Inicial' : score < 6 ? 'En desarrollo' : score < 9 ? 'Competente' : 'Avanzado';
export function weekDays(date = new Date()) {
  const base = new Date(`${dateKey(date)}T12:00:00-06:00`);
  base.setDate(base.getDate() - (base.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => { const day = new Date(base); day.setDate(base.getDate() + i); return day; });
}
export function reviewTitle(review: Review, w: Workspace) {
  return w.assignments.find(a => a.id === review.assignmentId)?.title ?? 'Seguimiento general';
}
export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const safeUrl = (url: string) => { try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; } };
/** Nombre legible para un enlace pegado: los responsables suelen usar carpetas de Drive. */
export function linkLabel(url: string) {
  try {
    const u = new URL(url); const host = u.hostname.replace(/^www\./, '');
    if (host === 'drive.google.com') return u.pathname.includes('/folders/') ? 'Carpeta de Drive' : 'Archivo de Drive';
    if (host === 'docs.google.com') return u.pathname.startsWith('/spreadsheets') ? 'Hoja de cálculo de Google' : u.pathname.startsWith('/presentation') ? 'Presentación de Google' : 'Documento de Google';
    if (host.endsWith('sharepoint.com') || host === 'onedrive.live.com') return 'Archivo de OneDrive';
    if (host === 'github.com') return 'Repositorio de GitHub';
    return host;
  } catch { return 'Enlace'; }
}
/** Acepta enlaces pegados sin "https://" (por ejemplo "drive.google.com/..."); devuelve null si no es válido. */
export const toHttpUrl = (raw: string) => { const value = raw.trim(); return value ? safeUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`) : null; };
export const MAX_FILE = 10 * 1024 * 1024;
export const FILE_TYPES = '.pdf,.png,.jpg,.jpeg,.txt,.csv,.md,.docx,.xlsx,.pptx';
export const fileSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

let csrf: string | null = null;
export const setCsrf = (token: string | null) => { csrf = token; };
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET' && csrf) headers.set('X-CSRF-Token', csrf);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin', signal: options.signal ?? controller.signal }); }
  catch (error) { if ((error as Error).name === 'AbortError') throw new ApiError('La solicitud tardó demasiado. Revisa el estado de tus datos antes de repetir la operación.', 0); throw new ApiError('Se perdió la conexión. No pudimos confirmar el resultado; revisa tus datos al recuperar la conexión.', 0); }
  finally { clearTimeout(timeout); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('sag:session-expired'));
    throw new ApiError(data.error?.message ?? data.error ?? data.message ?? 'No se pudo completar la operación.', response.status);
  }
  return data as T;
}
export const post = <T,>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE', body: '{}' });
