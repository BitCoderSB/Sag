import { useState, type ReactNode } from 'react';
import { CheckCircle, GraduationCap, CalendarCheck, DotsSixVertical, Hourglass, Pause, Play, UserMinus, WarningCircle, TrendUp, ClockCounterClockwise, CalendarPlus as CalendarAdd, CaretRight, Exam, HourglassMedium, CalendarX, Barricade, Prohibit, UserPlus, ArrowRight, Plus, CalendarPlus, PencilSimple, FlagPennant, UsersThree, Kanban } from '@phosphor-icons/react';
import { AREAS, type AreaId, type Assignment, type AuditEvent, type Meeting, type Review, type Student, type Workspace } from '../../shared/types';
import { useApp } from '../context';
import { activitySteps, actionsToday, capitalize, currentAssignment, dateKey, dayDiff, dayLabel, assignmentProgress, dueText, firstName, followUp, formatDate, formatTime, HEALTH, HEALTH_GROUPS, inGroup, isLate, isOpen, isPastUnrecorded, meetingsOn, nextReview, upcomingMeetings, normalize, pendingTasks, plural, relativeDay, blockedSince, blockEscalated, isWaiting, pauseOf, PAUSE_LABELS, reviewLabels, reviewsOn, reviewTitle, STALE_DAYS, scoped, studentHealth, timeAgo, today, weekDays, type Health, type HealthGroup, type Task, type TaskKind, type Tone } from '../lib';
import { exitRef, reducedMotion, usePresence } from '../motion';
import { AreaIcon, AreaTag, Avatar, areaName, Badge, Button, Donut, Empty, CreateMenu, Menu, NextReviewCell, RollingNumber, Search, SectionTitle, Segmented, StatusAvatar, Steps, TextLink } from '../components/ui';
import Calendar from '../components/Calendar';
import StudentAction from '../components/StudentAction';
import MeetingCard from '../components/MeetingCard';
import { beginDrag, type DragItem } from '../components/CalendarDrag';
import { thesisNext } from '../components/Thesis';
import { phaseInfo, STEP_LABEL } from '../../shared/thesis';

export default function Dashboard() {
  const { readonly } = useApp();
  return readonly ? <Overview /> : <Today />;
}

const todayLabel = () => capitalize(formatDate(new Date(), { weekday: 'long', month: 'long' }));
export type Kind = TaskKind | 'stale' | 'idle' | 'today_review' | 'today_due' | 'resume' | 'next' | 'dropout' | 'thesis';
// Cada pendiente dice la acción que le toca al responsable: él registra revisiones, entregas, calificaciones e impedimentos.
export const KIND: Record<Kind, { tone: Tone; action: string }> = {
  blocked: { tone: 'warn', action: 'Resolver' },
  resume: { tone: 'neutral', action: 'Retomar' },
  thesis: { tone: 'info', action: 'Registrar' },
  next: { tone: 'neutral', action: 'Asignar siguiente' },
  dropout: { tone: 'warn', action: 'Pausar participación' },
  unrecorded: { tone: 'warn', action: 'Registrar revisión' },
  today_review: { tone: 'neutral', action: 'Registrar revisión' },
  today_due: { tone: 'neutral', action: 'Registrar entrega' },
  overdue: { tone: 'warn', action: 'Registrar entrega' },
  no_delivery: { tone: 'warn', action: 'Cambiar fecha' },
  evaluate: { tone: 'info', action: 'Evaluar' },
  stale: { tone: 'warn', action: 'Programar revisión' },
  idle: { tone: 'idle', action: 'Asignar actividad' },
};
const TASK_KINDS: TaskKind[] = ['evaluate', 'overdue', 'unrecorded', 'blocked', 'no_delivery'];
export const TODAY_KINDS: Kind[] = ['today_review', 'today_due'];
// «Preparar la siguiente» es anticipación, no un pendiente: no suma al número grande.
export const LATER_KINDS: Kind[] = ['next'];
const NEXT_DAYS = 3;
/** Días a partir de los cuales «sin seguimiento» se trata como posible deserción. */
const DROPOUT_DAYS = 21;
// Grupos por la acción que piden, en orden de urgencia. La explicación dice qué significa y qué registrar.
const GROUPS: { id: string; label: string; hint: string; tone: Tone; icon: typeof Exam; kinds: Kind[] }[] = [
  { id: 'resume', label: '¿Retoman?', hint: 'Llegó la fecha de regreso que pusiste al pausarlos.', tone: 'neutral', icon: Play, kinds: ['resume'] },
  { id: 'idle', label: 'Sin actividad', hint: 'Un alumno siempre debe tener algo asignado. Dale su siguiente actividad.', tone: 'idle', icon: UserPlus, kinds: ['idle'] },
  { id: 'thesis', label: 'Tesis', hint: 'Llamadas y revisiones del flujo de tesis que te tocan. Las que están trabajando no aparecen aquí.', tone: 'info', icon: GraduationCap, kinds: ['thesis'] },
  { id: 'blocked', label: 'Revisar impedimentos', hint: 'Llegó la fecha que pusiste para revisarlos. Resuélvelos o sigue esperando.', tone: 'warn', icon: Barricade, kinds: ['blocked'] },
  { id: 'unrecorded', label: 'Revisiones sin registrar', hint: 'Ya pasaron y no anotaste si se hicieron ni qué se acordó.', tone: 'warn', icon: CalendarX, kinds: ['unrecorded'] },
  { id: 'today', label: 'Para hoy', hint: 'Revisiones de hoy y entregas que vencen hoy. Regístralas al recibirlas.', tone: 'neutral', icon: CalendarCheck, kinds: ['today_review', 'today_due'] },
  { id: 'overdue', label: 'Entregas vencidas', hint: 'Pasó la fecha límite y no registraste la entrega. Regístrala o cambia la fecha.', tone: 'warn', icon: HourglassMedium, kinds: ['overdue', 'no_delivery'] },
  { id: 'evaluate', label: 'Por evaluar', hint: 'Registraste la entrega final; falta evaluar las habilidades.', tone: 'info', icon: Exam, kinds: ['evaluate'] },
  { id: 'next', label: 'Preparar la siguiente', hint: 'Su única actividad ya se entregó o vence pronto. Ten lista la que sigue para que no se quede sin trabajo.', tone: 'neutral', icon: ArrowRight, kinds: ['next'] },
  { id: 'stale', label: 'Sin seguimiento', hint: `${STALE_DAYS} días o más sin revisión ni entrega y sin cita próxima.`, tone: 'warn', icon: ClockCounterClockwise, kinds: ['stale'] },
  { id: 'dropout', label: 'Posible deserción', hint: `Más de ${DROPOUT_DAYS} días sin contacto. Si no responde, pausa su participación para que deje de pedir atención.`, tone: 'warn', icon: UserMinus, kinds: ['dropout'] },
];
const SEVERITY: Health[] = ['blocked', 'late', 'idle', 'review', 'waiting', 'changes', 'active', 'paused', 'done'];
export interface Item { key: string; kind: Kind; studentId: string; review?: Review; assignment?: Assignment; date?: string }

/* ---------- Responsable ---------- */

/** Calendario y alumnos a la izquierda; a la derecha, qué te toca registrar ahora, agrupado por acción. */
function Today({ areaId, switcher }: { areaId?: AreaId; switcher?: ReactNode }) {
  const app = useApp(); const w = scoped(app.workspace, areaId ?? 'all'); const ro = app.readonly;
  // Sin día elegido el calendario no abre detalle; «para hoy» del panel abre el día de hoy.
  const [selected, setSelected] = useState<string | null>(null);
  // El filtro de la tabla lo comparten la dona y su leyenda: un solo estado.
  const [filter, setFilter] = useState<RosterFilter>('all');
  const active = w.students.filter(s => s.status === 'active');
  const health = new Map(active.map(s => [s.id, studentHealth(w, s)]));
  const items = buildItems(w, active, health);
  const pending = items.filter(i => !TODAY_KINDS.includes(i.kind) && !LATER_KINDS.includes(i.kind)).length;
  const forToday = items.filter(i => TODAY_KINDS.includes(i.kind)).length;
  const waiting = w.assignments.filter(a => isOpen(a) && isWaiting(a) && active.some(s => s.id === a.studentId));
  const weekReviews = weekDays().reduce((n, d) => n + reviewsOn(w, dateKey(d)).length, 0);
  // Requiere atención: impedimento por revisar, atraso o sin actividad. Lo que está en espera no cuenta.
  const struggling = active.filter(s => ['blocked', 'late', 'idle'].includes(health.get(s.id)!)).length;
  const done = ro ? 0 : actionsToday(app.workspace);
  function openToday() { setSelected(today()); requestAnimationFrame(() => document.querySelector('.cal-panel')?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })); }
  function showStruggling() { setFilter((['blocked', 'late', 'idle'] as const).find(g => active.some(s => health.get(s.id) === g)) ?? 'all'); requestAnimationFrame(() => document.querySelector('.roster')?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })); }
  const todayLink = forToday > 0 && <button type="button" className="rail-today-link" onClick={openToday}>{pending ? 'y ' : ''}{forToday} para hoy<CaretRight size={12} weight="bold" aria-hidden="true" /></button>;

  return <div className="today">
    <div className="today-main">
      <header className="today-head">
        <div className="today-title">
        <h1>{areaName(areaId ?? w.user.areaId!)}</h1>
        <p>{plural(active.length, 'alumno', 'alumnos')} · {plural(weekReviews, 'revisión', 'revisiones')} esta semana</p>
        </div>
        {switcher}
        {!ro && <CreateMenu align="end" onPick={kind => app.modal({ type: kind })} />}
        {ro && <Button onClick={() => app.modal({ type: 'meeting', areaIds: areaId ? [areaId] : undefined })}><CalendarAdd size={16} weight="bold" />Agendar reunión</Button>}
      </header>
      <Calendar w={w} selected={selected} onSelect={setSelected} detail />
      <Roster w={w} students={active} health={health} filter={filter} onFilter={setFilter} paused={w.students.filter(s => s.status === 'paused')} />
    </div>

    <aside className="rail" aria-label="Qué registrar hoy">
      <section className="rail-block rail-summary" aria-label="Resumen de hoy">
        <p className="rail-date">Hoy · {todayLabel()}</p>
        {pending ? <div className="rail-figure">
          <RollingNumber value={pending} className="rail-number" />
          <span className="rail-unit">{pending === 1 ? 'pendiente' : 'pendientes'}{todayLink || <small>Nada más para hoy</small>}</span>
        </div> : <div className="rail-figure rail-clear">
          <span className="check-draw" aria-hidden="true"><CheckCircle size={44} weight="fill" /></span>
          <span className="rail-unit">Sin pendientes{todayLink || <small>Nada pendiente para hoy</small>}</span>
        </div>}
        {struggling > 0 && <button type="button" className="rail-alert" onClick={showStruggling}><WarningCircle size={15} weight="fill" aria-hidden="true" />{struggling === 1 ? '1 alumno requiere atención' : `${struggling} alumnos requieren atención`}<CaretRight size={12} weight="bold" aria-hidden="true" /></button>}
        {!ro && done + items.length > 0 && <div className="rail-progress" role="img" aria-label={`Hoy llevas ${done} de ${done + items.length}`}>
          <span><strong>Hoy llevas {done} de {done + items.length}</strong></span>
          <i><b style={{ width: `${Math.round(done / (done + items.length) * 100)}%` }} /></i>
        </div>}
        {!ro && <Button variant="secondary" className="rail-board" onClick={() => app.navigate('board', { v: 'day' })}><Kanban size={16} aria-hidden="true" />Abrir mi día en el tablero</Button>}
        {!ro && meetingsOn(w, today()).filter(m => Date.parse(m.startsAt) + m.durationMinutes * 60000 > Date.now()).slice(0, 2).map(m => <p key={m.id} className="rail-meeting"><UsersThree size={15} weight="bold" aria-hidden="true" /><span><strong>Reunión hoy a las {formatTime(m.startsAt)}</strong>{m.title}</span></p>)}
      </section>
      {items.length > 0 && <TaskGroups items={items} health={health} />}
      {waiting.length > 0 && <WaitingList w={w} assignments={waiting} />}
    </aside>
  </div>;
}

/** Todo lo que el responsable tiene que registrar o decidir: lo atrasado (tareas del sistema) y lo que vence o toca hoy. */
export function buildItems(w: Workspace, active: Student[], health: Map<string, Health>): Item[] {
  const tasks = pendingTasks(w);
  const now = Date.now();
  const delivered = (id: string) => w.deliveries.some(d => d.assignmentId === id && d.completeness === 'complete');
  return [
    ...tasks.filter(t => (TASK_KINDS as string[]).includes(t.kind)).map(t => ({ key: t.key, kind: t.kind as Kind, studentId: t.studentId, review: t.review, assignment: t.assignment, date: t.date })),
    // Revisiones de hoy (las de días anteriores sin registrar ya son tareas «Por registrar»).
    ...reviewsOn(w, today()).filter(r => r.status === 'scheduled').map(r => ({ key: `today-review-${r.id}`, kind: 'today_review' as const, studentId: r.studentId, review: r, assignment: w.assignments.find(a => a.id === r.assignmentId), date: r.startsAt })),
    // Entregas que vencen hoy y todavía no se registran (si la hora ya pasó, aparecen como «Vencidas»).
    ...w.assignments.filter(a => isOpen(a) && a.status !== 'pending_review' && !a.blockedReason && a.dueAt && dateKey(a.dueAt) === today() && Date.parse(a.dueAt) >= now && !delivered(a.id))
      .map(a => ({ key: `today-due-${a.id}`, kind: 'today_due' as const, studentId: a.studentId, assignment: a, date: a.dueAt! })),
    ...active.filter(s => !['idle', 'waiting'].includes(health.get(s.id)!) && followUp(w, s).stale).map(s => ({ key: `stale-${s.id}`, kind: followUp(w, s).days >= DROPOUT_DAYS ? 'dropout' as const : 'stale' as const, studentId: s.id, date: followUp(w, s).last })),
    // Tesis: solo los pasos que dependen del responsable (llamada inicial, revisión, llamada de decisión).
    ...active.filter(s => s.thesis && ['kickoff', 'review', 'call'].includes(s.thesis.step)).map(s => ({ key: `thesis-${s.id}`, kind: 'thesis' as const, studentId: s.id, date: s.thesis!.phaseSince })),
    // Pausas cuyo regreso ya llegó.
    ...w.students.filter(s => { const p = pauseOf(s, w.user.areaId); return !!p?.returnAt && p.returnAt <= today(); }).map(s => ({ key: `resume-${s.id}`, kind: 'resume' as const, studentId: s.id, date: pauseOf(s, w.user.areaId)!.returnAt! })),
    // Su única actividad ya se entregó o vence en pocos días: preparar la siguiente antes de que se quede sin trabajo.
    ...active.flatMap(s => { const open = w.assignments.filter(a => a.studentId === s.id && isOpen(a)); const a = open[0];
      if (open.length !== 1 || a.blockedReason || health.get(s.id) === 'late') return [];
      const soon = a.status === 'pending_review' || (!!a.dueAt && dateKey(a.dueAt) > today() && dayDiff(a.dueAt) <= NEXT_DAYS);
      return soon ? [{ key: `next-${s.id}`, kind: 'next' as const, studentId: s.id, assignment: a, date: a.dueAt ?? undefined }] : []; }),
    ...active.filter(s => health.get(s.id) === 'idle').map(s => ({ key: `idle-${s.id}`, kind: 'idle' as const, studentId: s.id })),
  ];
}

/** Grupos por la acción que piden, en orden de urgencia, todos a la vista. Cada uno explica qué significa y qué hacer. */
function TaskGroups({ items, health }: { items: Item[]; health: Map<string, Health> }) {
  const groups = GROUPS.map(g => ({ ...g, items: items.filter(i => g.kinds.includes(i.kind)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')) })).filter(g => g.items.length);
  const draggable = !useApp().readonly;
  return <section className="rail-block task-groups" aria-label="Pendientes por tipo">
    {draggable && <p className="tg-hint"><DotsSixVertical size={14} weight="bold" aria-hidden="true" />Arrastra cualquier pendiente a un día del calendario para darle fecha.</p>}
    {groups.map(g => <TaskGroup key={g.id} group={g} health={health} />)}
  </section>;
}
function TaskGroup({ group: g, health }: { group: (typeof GROUPS)[number] & { items: Item[] }; health: Map<string, Health> }) {
  // Se ven los primeros tres; el resto con «Ver N más», sin acordeón ni flechas.
  const [all, setAll] = useState(false);
  const rows = usePresence(all ? g.items : g.items.slice(0, 3), i => i.key);
  return <div className={`tg tone-${g.tone}`}>
    <div className="tg-head">
      <span className="tg-icon" aria-hidden="true"><g.icon size={15} weight="bold" /></span>
      <h3 className="tg-label">{g.label}</h3>
      <span className="tg-count" aria-label={plural(g.items.length, 'pendiente', 'pendientes')}>{g.items.length}</span>
      <p className="tg-desc">{g.hint}</p>
    </div>
    <ul className="tg-list">{rows.map(({ item, key, exiting }) => <TaskRow key={key} item={item} exiting={exiting} health={health.get(item.studentId) ?? 'active'} />)}</ul>
    {g.items.length > 3 && <button type="button" className="tg-more" onClick={() => setAll(v => !v)}>{all ? 'Ver menos' : `Ver ${g.items.length - 3} más`}</button>}
  </div>;
}

export function useTaskAction(item: Item) {
  const app = useApp();
  const a = item.assignment; const r = item.review;
  return () => {
    const student = app.workspace.students.find(s => s.id === item.studentId);
    if (item.kind === 'thesis' && student?.thesis) app.modal({ type: 'thesisStep', student, action: student.thesis.step === 'call' ? 'advance' : thesisNext(student.thesis.step).action! });
    else if (item.kind === 'idle' || item.kind === 'next') app.modal({ type: 'assignment', studentId: item.studentId });
    else if (item.kind === 'resume' && student) app.modal({ type: 'resume', student });
    else if (item.kind === 'dropout' && student) app.modal({ type: 'pause', student, kind: 'no_contact' });
    else if (item.kind === 'stale') app.modal({ type: 'review', studentId: item.studentId });
    else if (item.kind === 'evaluate' && a) app.modal({ type: 'evaluate', assignment: a });
    else if ((item.kind === 'overdue' || item.kind === 'today_due') && a) app.modal({ type: 'delivery', assignment: a });
    else if ((item.kind === 'unrecorded' || item.kind === 'today_review') && r) app.modal({ type: 'reviewUpdate', review: r, mode: 'record', early: Date.parse(r.startsAt) > Date.now() });
    else if (item.kind === 'blocked' && a) app.modal({ type: 'block', assignment: a, mode: 'resolve' });
    else if (a) app.modal({ type: 'assignmentEdit', assignment: a, mode: 'edit' });
  };
}
/** Un pendiente que se suelta en un día abre el diálogo que corresponde, con esa fecha ya puesta. */
function useTaskDrag(item: Item): DragItem | undefined {
  const app = useApp(); const w = app.workspace;
  if (app.readonly || item.kind === 'resume' || item.kind === 'dropout' || item.kind === 'thesis') return undefined;
  const student = w.students.find(s => s.id === item.studentId); const a = item.assignment; const r = item.review;
  const drop = (day: string) => {
    if ((item.kind === 'unrecorded' || item.kind === 'today_review') && r) app.modal({ type: 'reviewUpdate', review: r, mode: 'reschedule', date: day });
    else if (item.kind === 'idle' || item.kind === 'next') app.modal({ type: 'assignment', studentId: item.studentId, dueDate: day });
    else if (['overdue', 'no_delivery', 'blocked', 'today_due'].includes(item.kind) && a) app.modal({ type: 'assignmentEdit', assignment: a, mode: 'edit', dueDate: day });
    else app.modal({ type: 'review', studentId: item.studentId, assignmentId: a?.id, date: day });
  };
  return { id: item.key, title: a?.title ?? student?.name ?? 'Alumno', person: student?.name ?? 'Alumno', avatar: student?.avatar, drop };
}
/** Por qué está en la lista, dicho desde lo que registraste tú. */
export function itemDetail(item: Item, w: Workspace) {
  const a = item.assignment; const r = item.review;
  switch (item.kind) {
    case 'evaluate': return `Entrega registrada ${relativeDay(item.date!)}`;
    case 'overdue': return `Venció ${relativeDay(item.date!)}, sin entrega registrada`;
    case 'unrecorded': return r ? `Revisión ${relativeDay(r.startsAt)}, ${formatTime(r.startsAt)}` : '';
    case 'today_review': return r ? `${Date.parse(r.startsAt) < Date.now() ? 'Fue hoy' : 'Hoy'} a las ${formatTime(r.startsAt)} · ${reviewLabels[r.type]}` : '';
    case 'today_due': return a?.dueAt ? `Vence hoy a las ${formatTime(a.dueAt)}` : 'Vence hoy';
    case 'blocked': return a ? `${a.blockedReason} · ${blockedSince(a)}${blockEscalated(a) ? ' · sin revisar' : ''}` : '';
    case 'thesis': { const s = w.students.find(x => x.id === item.studentId); const t = s?.thesis; return t ? `${STEP_LABEL[t.step]} · ${t.step === 'review' ? `entregó ${relativeDay(t.phaseSince)}` : `fase ${phaseInfo(t.phase).n} de 10`}` : ''; }
    case 'resume': { const s = w.students.find(x => x.id === item.studentId); const p = s && pauseOf(s, w.user.areaId); return p ? `${PAUSE_LABELS[p.kind]} · regreso previsto ${relativeDay(`${p.returnAt}T12:00:00-06:00`)}` : ''; }
    case 'next': return a ? a.status === 'pending_review' ? 'Su actividad ya está entregada' : `Su única actividad vence ${relativeDay(a.dueAt!)}` : '';
    case 'dropout': { const s = w.students.find(x => x.id === item.studentId); return s ? `${followUp(w, s).days} días sin revisión ni entrega` : ''; }
    case 'no_delivery': return 'Registraste que no entregó. Amplía la fecha o cancela.';
    case 'stale': { const s = w.students.find(x => x.id === item.studentId); return s ? `${followUp(w, s).days} días sin revisión ni entrega` : ''; }
    case 'idle': return 'Sin trabajo abierto en tu área';
  }
}

function TaskRow({ item, exiting, health }: { item: Item; exiting: boolean; health: Health }) {
  const app = useApp(); const w = app.workspace;
  const student = w.students.find(s => s.id === item.studentId);
  const a = item.assignment; const r = item.review;
  const act = useTaskAction(item); const detail = itemDetail(item, scoped(w)); const drag = useTaskDrag(item);
  const title = item.kind === 'thesis' && student?.thesis ? `Tesis · ${phaseInfo(student.thesis.phase).label}` : item.kind === 'next' ? 'Su siguiente actividad' : a?.title ?? (r ? reviewTitle(r, w) : item.kind === 'idle' ? 'Asignarle una actividad' : item.kind === 'stale' ? 'Programar su siguiente revisión' : item.kind === 'resume' ? '¿Retoma su participación?' : item.kind === 'dropout' ? 'Sin contacto' : 'Seguimiento general');
  const tone = item.kind === 'blocked' && a && blockEscalated(a) ? 'danger' : KIND[item.kind].tone;
  // Dos salidas cuando hay que decidir: resolver o seguir esperando; retomar o extender la pausa.
  const second = app.readonly ? null : item.kind === 'blocked' && a ? <Button size="sm" variant="secondary" className="tg-action" onClick={() => app.modal({ type: 'block', assignment: a, mode: 'wait' })}>Esperar más</Button>
    : item.kind === 'resume' && student ? <Button size="sm" variant="secondary" className="tg-action" onClick={() => app.modal({ type: 'pause', student })}>Extender</Button> : null;
  return <li className={`tg-row tone-${tone} ${drag ? 'is-draggable' : ''}`} ref={exitRef(exiting)} aria-hidden={exiting || undefined}
    onPointerDown={drag && !exiting ? e => { if (!(e.target as HTMLElement).closest('.button, .icon-button, [aria-haspopup]')) beginDrag(drag, e); } : undefined}>
    <button type="button" className="tg-person" tabIndex={exiting ? -1 : undefined} onClick={() => app.openStudent(item.studentId)} aria-label={`Abrir expediente de ${student?.name ?? 'alumno'}`}><StatusAvatar name={student?.name ?? 'Alumno'} avatar={student?.avatar} health={health} size="sm" /></button>
    <button type="button" className="tg-main" tabIndex={exiting ? -1 : undefined} onClick={() => a ? app.openAssignment(a.id) : app.openStudent(item.studentId)}>
      {item.kind === 'no_delivery' && <span className="tg-tag">No entregó</span>}
      <strong>{title}</strong>
      <span>{student?.name ?? 'Alumno'}</span>
    </button>
    {drag && <span className="tg-grip" title="Arrastra a un día del calendario" aria-hidden="true"><DotsSixVertical size={16} weight="bold" /></span>}
    {detail && <span className={`tg-detail ${item.kind === 'blocked' ? 'is-wrap' : ''}`}>{detail}</span>}
    {!app.readonly && (second ? <span className="tg-actions"><Button size="sm" className="tg-action" tabIndex={exiting ? -1 : undefined} onClick={act}>{KIND[item.kind].action}</Button>{second}</span>
      : <Button size="sm" className="tg-action" variant={item.kind === 'next' ? 'secondary' : 'primary'} tabIndex={exiting ? -1 : undefined} onClick={act}>{item.kind === 'thesis' && student?.thesis ? thesisNext(student.thesis.step).label : KIND[item.kind].action}</Button>)}
  </li>;
}

/** Alumnos en pausa: fuera de pendientes y de la dona; aquí se ve el motivo, desde cuándo y cuándo regresan. */
function PausedList({ students }: { students: Student[] }) {
  const app = useApp(); const area = app.workspace.user.areaId;
  return <section className="paused" aria-labelledby="paused-title">
    <h3 id="paused-title" className="paused-head"><Pause size={14} weight="fill" aria-hidden="true" />En pausa<span className="count">{students.length}</span><small>No cuentan en pendientes ni en la dona.</small></h3>
    <ul>{students.map(s => { const p = pauseOf(s, area); return <li key={s.id}>
      <button type="button" className="student-name" onClick={() => app.openStudent(s.id)}><Avatar name={s.name} avatar={s.avatar} /><span><strong>{s.name}</strong><small>{p ? `${PAUSE_LABELS[p.kind]}${p.reason ? ` · ${p.reason}` : ''}` : 'Expediente en pausa'}</small></span></button>
      <span className="paused-when">{p ? <>Desde {formatDate(p.since)}<small>{p.returnAt ? `Regresa ${formatDate(`${p.returnAt}T12:00:00-06:00`, { weekday: 'short' })}` : 'Sin fecha de regreso'}</small></> : null}</span>
      {!app.readonly && p && <span className="row-actions"><Button size="sm" variant="secondary" onClick={() => app.modal({ type: 'resume', student: s })}><Play size={14} weight="fill" />Retomar</Button><Menu label={`Más acciones para ${s.name}`} items={[{ label: 'Editar pausa', icon: <PencilSimple size={16} />, onSelect: () => app.modal({ type: 'pause', student: s }) }]} /></span>}
    </li>; })}</ul>
  </section>;
}

/** En espera: no piden nada hasta su fecha. Compacto y al final, para que no compita con lo que sí requiere atención. */
function WaitingList({ w, assignments }: { w: Workspace; assignments: Assignment[] }) {
  const app = useApp();
  const rows = [...assignments].sort((a, b) => (a.blockedReviewAt ?? '').localeCompare(b.blockedReviewAt ?? ''));
  return <section className="rail-block waiting" aria-labelledby="waiting-title">
    <h3 id="waiting-title" className="waiting-head"><Hourglass size={15} weight="bold" aria-hidden="true" />En espera<span className="count">{rows.length}</span></h3>
    <p className="waiting-desc">Detenidas por algo externo. No requieren nada hasta su fecha de revisión.</p>
    <ul>{rows.map(a => { const s = w.students.find(x => x.id === a.studentId); return <li key={a.id}><button type="button" onClick={() => app.openAssignment(a.id)}>
      <Avatar name={s?.name ?? 'Alumno'} avatar={s?.avatar} size="sm" />
      <span><strong>{a.title}</strong><small>{s?.name} · {a.blockedReason}</small></span>
      <span className="waiting-when">{formatDate(`${a.blockedReviewAt}T12:00:00-06:00`, { weekday: 'short' })}</span>
    </button></li>; })}</ul>
  </section>;
}

type RosterFilter = 'all' | 'stale' | HealthGroup;
/** Tabla de alumnos activos: primero quienes piden atención. La dona resume y filtra; sus segmentos y las pestañas son el mismo filtro. */
function Roster({ w, students, health, filter, onFilter, paused = [] }: { w: Workspace; students: Student[]; health: Map<string, Health>; filter: RosterFilter; onFilter: (f: RosterFilter) => void; paused?: Student[] }) {
  const app = useApp();
  const [search, setSearch] = useState(''); const [peek, setPeek] = useState<RosterFilter | null>(null);
  const rows = [...students]
    .sort((a, b) => SEVERITY.indexOf(health.get(a.id)!) - SEVERITY.indexOf(health.get(b.id)!) || a.name.localeCompare(b.name))
    .map(s => ({ s, h: health.get(s.id)!, current: currentAssignment(w, s.id), next: nextReview(w, s.id), follow: followUp(w, s) }));
  const q = normalize(search.trim());
  const isStale = (r: typeof rows[number]) => r.h !== 'idle' && r.h !== 'waiting' && r.follow.stale;
  const visible = rows.filter(r => (filter === 'all' || (filter === 'stale' ? isStale(r) : inGroup(r.h, filter))) && normalize(`${r.s.name} ${r.s.registration} ${r.s.technologies.join(' ')}`).includes(q));
  const groups = HEALTH_GROUPS.map(g => ({ ...g, members: rows.filter(r => inGroup(r.h, g.id)) }));
  // Un solo filtro: la leyenda de la dona. «Sin seguimiento» no es un segmento (se cruza con los demás), por eso va aparte.
  const entries: { id: RosterFilter; label: string; one: string; tone: string; members: typeof rows }[] = [
    ...groups.map(g => ({ id: g.id as RosterFilter, label: g.label, one: g.one, tone: g.id === 'idle' ? 'idle' : g.tone, members: g.members })),
    { id: 'stale', label: 'Sin seguimiento', one: 'Sin seguimiento', tone: 'warn', members: rows.filter(isStale) },
  ];
  const focus = entries.find(x => x.id === (peek ?? filter)) ?? null;
  const pick = (id: RosterFilter) => onFilter(filter === id ? 'all' : id);
  return <section className="roster" aria-labelledby="roster-title">
    <div className="block-head">
      <h2 id="roster-title" className="block-title">{app.readonly ? 'Alumnos' : 'Mis alumnos'}<span className="count">{rows.length}</span></h2>
      <div className="roster-tools"><Search value={search} onChange={setSearch} placeholder="Buscar alumno" label="Buscar alumnos" /><TextLink onClick={() => app.navigate('students')}>Ver todos</TextLink></div>
    </div>
    {rows.length > 0 && <div className="roster-health">
      <Donut size={92} stroke={11} label={groups.map(g => `${g.label}: ${g.members.length}`).join(', ')} active={focus && focus.id !== 'stale' ? focus.id : null} onHover={id => setPeek(id as RosterFilter | null)} onPick={id => pick(id as RosterFilter)}
        segments={groups.map(g => ({ id: g.id, value: g.members.length, tone: g.id === 'idle' ? 'idle' : g.tone }))}>
        {focus ? <><strong>{focus.members.length}</strong><span>{(focus.members.length === 1 ? focus.one : focus.label).toLowerCase()}</span></> : <><strong>{rows.length}</strong><span>alumnos</span></>}
      </Donut>
      <ul className="health-legend" aria-label="Filtrar la tabla por situación">{entries.filter(x => x.members.length || x.id === filter).map(x => <li key={x.id} className={x.id === 'stale' ? 'is-apart' : ''}>
        <button type="button" aria-pressed={filter === x.id} className={`tone-${x.tone}`} onClick={() => pick(x.id)} onPointerEnter={() => setPeek(x.id)} onPointerLeave={() => setPeek(null)} onFocus={() => setPeek(x.id)} onBlur={() => setPeek(null)}>
          {x.id === 'stale' ? <ClockCounterClockwise size={12} weight="bold" className="legend-icon" /> : <i className="legend-dot" />}<strong>{x.members.length}</strong>{(x.members.length === 1 ? x.one : x.label).toLowerCase()}
        </button>
      </li>)}</ul>
      {/* Quiénes son, sin abrir nada: las caras del segmento señalado. */}
      <div className="health-faces" aria-live="polite">
        {focus ? <><span className="health-faces-label">{focus.label}{filter !== 'all' && !peek && <button type="button" className="faces-clear" onClick={() => onFilter('all')}>Quitar filtro</button>}</span><span className="avatar-row">{focus.members.slice(0, 6).map(r => <button type="button" key={r.s.id} onClick={() => app.openStudent(r.s.id)} title={r.s.name} aria-label={`${r.s.name}: ${HEALTH[r.h].label}`}><StatusAvatar name={r.s.name} avatar={r.s.avatar} health={r.h} size="sm" /></button>)}{focus.members.length > 6 && <span className="faces-more">+{focus.members.length - 6}</span>}</span></>
          : <span className="health-faces-hint">Señala un color para ver quiénes son; haz clic para filtrar la tabla.</span>}
      </div>
    </div>}
    {rows.length === 0 ? <p className="side-empty">Aún no tienes alumnos activos. Agrégalos desde la sección Alumnos.</p> : <div className="table-scroll">
      <table className="table table-flat table-cards">
        <thead><tr><th>Alumno</th><th className="col-md">Actividad actual</th><th className="col-lg">Próxima revisión</th><th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{visible.map(({ s, h, current, next, follow }) => <tr key={s.id} className={`row-link ${app.fresh.has(s.id) ? 'is-fresh' : ''}`} onClick={() => app.openStudent(s.id)}>
          <td><button type="button" className="student-name" onClick={e => { e.stopPropagation(); app.openStudent(s.id); }}>
            <StatusAvatar name={s.name} avatar={s.avatar} health={h} />
            <span><strong>{s.name}</strong><small className={`health-text tone-${HEALTH[h].dot}`}><i className="legend-dot" aria-hidden="true" />{HEALTH[h].label}</small></span>
          </button></td>
          <td className="col-md c-show">{current ? <span className="cell-progress"><Steps {...activitySteps(current, w)} /><span className="cell-stack"><span className="cell-title">{current.title}</span><small>{isWaiting(current) ? `En espera hasta el ${formatDate(`${current.blockedReviewAt}T12:00:00-06:00`, { weekday: 'short' })}` : dueText(current)}{(() => { const p = assignmentProgress(current, w); return p !== null && p < 100 ? ` · ${p} %` : ''; })()}</small></span></span> : s.thesis ? <span className="cell-stack"><span className="cell-title">Tesis · {phaseInfo(s.thesis.phase).label}</span><small>{STEP_LABEL[s.thesis.step]}</small></span> : <span className="muted">Ninguna</span>}</td>
          <td className="col-lg"><NextReviewCell next={next} follow={h === 'waiting' ? { ...follow, stale: false } : follow} idle={h === 'idle'} /></td>
          <td className="cell-actions">{!app.readonly && <span className="row-actions"><StudentAction student={s} /><Menu label={`Más acciones para ${s.name}`} items={[
            ...(current ? [{ label: 'Registrar avance o entrega', icon: <TrendUp size={16} />, onSelect: () => app.modal({ type: 'progress', assignment: current }) }] : []),
            ...(current && current.status !== 'pending_review' ? [current.blockedReason ? { label: 'Resolver impedimento', icon: <Barricade size={16} />, onSelect: () => app.modal({ type: 'block', assignment: current, mode: 'resolve' }) } : { label: 'Marcar impedimento', icon: <Barricade size={16} />, onSelect: () => app.modal({ type: 'block', assignment: current, mode: 'mark' }) }] : []),
            { label: 'Asignar actividad', icon: <Plus size={16} />, onSelect: () => app.modal({ type: 'assignment', studentId: s.id }) },
            { label: 'Programar revisión', icon: <CalendarPlus size={16} />, onSelect: () => app.modal({ type: 'review', studentId: s.id }) },
            'separator',
            { label: 'Editar expediente', icon: <PencilSimple size={16} />, onSelect: () => app.modal({ type: 'student', student: s }) },
            { label: 'Pausar participación', icon: <Pause size={16} />, onSelect: () => app.modal({ type: 'pause', student: s }) },
          ]} /></span>}</td>
        </tr>)}</tbody>
      </table>
      {paused.length > 0 && <PausedList students={paused} />}
      {!visible.length && <Empty icon={<UsersThree size={20} />} title="No encontramos alumnos" description="Prueba con otro nombre o cambia el filtro." action={filter !== 'all' || search ? <Button variant="secondary" size="sm" onClick={() => { onFilter('all'); setSearch(''); }}>Quitar filtros</Button> : undefined} />}
    </div>}
  </section>;
}

/* ---------- Jefe ---------- */

const METRIC_ICON = { late: HourglassMedium, review: Exam, blocked: Barricade, unrecorded: CalendarX, stale: ClockCounterClockwise, idle: UserPlus };
/** El jefe elige ver las tres áreas juntas o el tablero completo de una, en solo lectura. */
function Overview() {
  const app = useApp();
  const param = app.params.get('area');
  const [area, setArea] = useState<AreaId | 'all'>(AREAS.some(a => a.id === param) ? param as AreaId : 'all');
  // Se actualiza la dirección sin recargar la página, para que el área elegida sobreviva a una recarga.
  const choose = (value: AreaId | 'all') => { setArea(value); history.replaceState(null, '', `#today${value === 'all' ? '' : `?area=${value}`}`); window.scrollTo({ top: 0 }); };
  const switcher = <Segmented label="Área" className="area-switch" value={area} onChange={choose} options={[{ value: 'all' as const, label: 'Todas' }, ...AREAS.map(a => ({ value: a.id, label: a.name }))]} />;
  return area === 'all' ? <LabOverview switcher={switcher} onArea={choose} /> : <Today key={area} areaId={area} switcher={switcher} />;
}

function LabOverview({ switcher, onArea }: { switcher: ReactNode; onArea: (area: AreaId) => void }) {
  const app = useApp(); const w = app.workspace;
  const [selected, setSelected] = useState(today());
  const areas = AREAS.map(area => {
    const s = scoped(w, area.id); const active = s.students.filter(x => x.status === 'active');
    const health = new Map(active.map(x => [x.id, studentHealth(s, x)]));
    const groups = HEALTH_GROUPS.map(g => ({ ...g, count: active.filter(x => g.members.includes(health.get(x.id)!)).length }));
    const struggling = active.filter(x => ['blocked', 'late'].includes(health.get(x.id)!));
    const stale = active.filter(x => health.get(x.id) !== 'idle' && followUp(s, x).stale).length;
    const week = weekDays().map(d => dateKey(d));
    // Mismos criterios que las pestañas de Actividades a las que enlaza cada cifra.
    return {
      area, active, health, groups, struggling, open: s.assignments.filter(isOpen).length,
      todayReviews: reviewsOn(s, today()).length, weekDue: s.assignments.filter(a => isOpen(a) && a.dueAt && week.includes(dateKey(a.dueAt))).length,
      metrics: [
        { id: 'late', label: 'Atrasadas', value: s.assignments.filter(a => isLate(a, s)).length, tone: 'warn', go: () => app.navigate('assignments', { area: area.id, status: 'late' }) },
        { id: 'review', label: 'Por evaluar', value: s.assignments.filter(a => a.status === 'pending_review').length, tone: 'info', go: () => app.navigate('assignments', { area: area.id, status: 'pending_review' }) },
        { id: 'blocked', label: 'Con impedimento', value: s.assignments.filter(a => isOpen(a) && !!a.blockedReason).length, tone: 'danger', go: () => app.navigate('assignments', { area: area.id, status: 'blocked' }) },
        { id: 'unrecorded', label: 'Revisiones sin registrar', value: pendingTasks(s).filter(t => t.kind === 'unrecorded').length, tone: 'warn', go: () => onArea(area.id) },
        { id: 'stale', label: 'Sin seguimiento', value: stale, tone: 'warn', go: () => onArea(area.id) },
        { id: 'idle', label: 'Alumnos sin actividad', value: active.filter(x => health.get(x.id) === 'idle').length, tone: 'neutral', go: () => app.navigate('students', { area: area.id, f: 'idle' }) },
      ] as const,
    };
  });
  const unique = w.students.filter(s => s.status === 'active').length;
  const agenda = reviewsOn(w, selected); const meetings = upcomingMeetings(w, null, 4);
  const totalStruggling = new Set(areas.flatMap(a => a.struggling.map(s => s.id))).size;
  const isToday = selected === today();
  return <div className="overview">
    <header className="today-head">
      <div className="today-title">
        <h1>Panorama del laboratorio</h1>
        <p>{todayLabel()} · {plural(unique, 'alumno activo', 'alumnos activos')} · {totalStruggling ? <span className="text-warn">{plural(totalStruggling, 'necesita', 'necesitan')} atención</span> : 'nadie con problemas'}</p>
      </div>
      {switcher}
      <Button onClick={() => app.modal({ type: 'meeting' })}><CalendarAdd size={16} weight="bold" />Agendar reunión</Button>
    </header>
    <div className="area-board">
      {areas.map(x => <section className="area-column" key={x.area.id} aria-labelledby={`area-${x.area.id}`}>
        <header className="area-column-head">
          <span className={`area-mark area-${x.area.id}`}><AreaIcon id={x.area.id} size={16} /></span>
          <div><h2 id={`area-${x.area.id}`}>{x.area.name}</h2><p>{plural(x.active.length, 'alumno', 'alumnos')} · {plural(x.open, 'actividad abierta', 'actividades abiertas')}</p></div>
        </header>
        <div className="area-health">
          <Donut size={76} stroke={10} label={x.groups.map(g => `${g.label}: ${g.count}`).join(', ')} segments={x.groups.map(g => ({ value: g.count, tone: g.id === 'idle' ? 'idle' : g.tone }))}>
            <strong>{x.active.length - x.struggling.length}</strong>
          </Donut>
          <div className="area-health-text">
            <strong>{x.struggling.length ? `${plural(x.struggling.length, 'alumno necesita', 'alumnos necesitan')} atención` : 'Todos van bien'}</strong>
            {x.struggling.length > 0 ? <span className="avatar-row">{x.struggling.slice(0, 5).map(s => <button type="button" key={s.id} onClick={() => app.openStudent(s.id)} aria-label={`${s.name}: ${HEALTH[x.health.get(s.id)!].label}`}><StatusAvatar name={s.name} avatar={s.avatar} health={x.health.get(s.id)!} size="sm" /></button>)}</span>
              : <span className="muted">{x.active.length - x.struggling.length} de {x.active.length} al día</span>}
          </div>
        </div>
        <dl className="area-pulse">
          <div><dt>Revisiones hoy</dt><dd>{x.todayReviews}</dd></div>
          <div><dt>Entregas esta semana</dt><dd>{x.weekDue}</dd></div>
        </dl>
        <ul className="area-metrics">{x.metrics.map(m => { const Icon = METRIC_ICON[m.id]; return <li key={m.id}>
          {m.value ? <button type="button" className={`area-metric tone-${m.tone}`} onClick={m.go}><span className={`metric-icon tone-${m.tone}`}><Icon size={14} weight="bold" aria-hidden="true" /></span><span>{m.label}</span><strong>{m.value}</strong><CaretRight size={12} aria-hidden="true" /></button>
            : <span className="area-metric area-metric-zero"><span className="metric-icon"><Icon size={14} aria-hidden="true" /></span><span>{m.label}</span><strong>0</strong></span>}
        </li>; })}</ul>
        <Button variant="secondary" className="area-open" onClick={() => onArea(x.area.id)}>Ver tablero de {x.area.name}<ArrowRight size={15} /></Button>
      </section>)}
    </div>
    <div className="overview-lower">
      <section aria-label="Calendario del laboratorio"><Calendar w={w} selected={selected} onSelect={k => setSelected(k ?? today())} byArea /></section>
      <div className="overview-side">
        <section aria-labelledby="overview-meetings">
          <SectionTitle id="overview-meetings" title="Próximas reuniones" count={meetings.length}><TextLink onClick={() => app.modal({ type: 'meeting', date: selected >= today() ? selected : undefined })}>Agendar</TextLink></SectionTitle>
          {meetings.length ? <div className="stack">{meetings.map(m => <MeetingCard key={m.id} meeting={m} withDate />)}</div> : <p className="side-empty">Sin reuniones agendadas con los responsables.</p>}
        </section>
        <section aria-labelledby="overview-agenda">
          <SectionTitle id="overview-agenda" title={isToday ? 'Revisiones de hoy' : `Revisiones del ${formatDate(`${selected}T12:00:00-06:00`, { weekday: 'long' })}`} count={agenda.length} />
          {agenda.length ? <ol className="day-line">{agenda.map(r => <li key={r.id} className={`day-item ${r.status === 'completed' ? 'is-done' : isPastUnrecorded(r) ? 'is-due' : ''}`}>
            <span className="day-time">{formatTime(r.startsAt)}</span>
            <span className="day-dot" aria-hidden="true" />
            <button type="button" className="day-body" onClick={() => r.assignmentId ? app.openAssignment(r.assignmentId) : app.openStudent(r.studentId)}><strong>{w.students.find(s => s.id === r.studentId)?.name}</strong><span>{reviewTitle(r, w)}</span></button>
            <AreaTag id={r.areaId} compact />
          </li>)}</ol> : <p className="side-empty">No hay revisiones programadas {isToday ? 'para hoy' : 'ese día'}.</p>}
        </section>
        <section aria-labelledby="overview-feed">
          <SectionTitle id="overview-feed" title="Movimientos recientes" />
          <ol className="feed">{w.audit.slice(0, 8).map(event => <FeedItem key={event.id} event={event} w={w} />)}</ol>
          {!w.audit.length && <p className="side-empty">Todavía no hay movimientos.</p>}
        </section>
      </div>
    </div>
  </div>;
}

export function describeEvent(event: AuditEvent, w: Workspace) {
  const assignment = w.assignments.find(a => a.id === event.entityId);
  const review = w.reviews.find(r => r.id === event.entityId);
  const student = w.students.find(s => s.id === (assignment?.studentId ?? review?.studentId ?? event.entityId));
  const title = assignment ? `«${assignment.title}»` : 'una actividad';
  const who = student?.name ?? 'un alumno';
  const verbs: Record<string, string> = {
    assignment_created: `asignó ${title} a ${who}`,
    assignment_updated: `actualizó ${title}`,
    delivery_recorded: `registró la entrega de ${title}`,
    non_delivery_confirmed: `confirmó que ${who} no entregó ${title}`,
    evaluation_recorded: `evaluó ${title}`,
    review_created: `programó una revisión con ${who}`,
    review_updated: `actualizó una revisión con ${who}`,
    student_created: `dio de alta a ${who}`,
    student_joined: `incorporó a ${who} a su área`,
    student_updated: `actualizó el expediente de ${who}`,
    note_created: `agregó una nota sobre ${who}`,
    meeting_created: `agendó la reunión «${w.meetings.find(m => m.id === event.entityId)?.title ?? 'con los responsables'}»`,
    meeting_updated: w.meetings.find(m => m.id === event.entityId)?.status === 'cancelled' ? `canceló la reunión «${w.meetings.find(m => m.id === event.entityId)?.title}»` : `actualizó la reunión «${w.meetings.find(m => m.id === event.entityId)?.title ?? ''}»`,
  };
  return verbs[event.action] ?? event.detail;
}
function FeedItem({ event, w }: { event: AuditEvent; w: Workspace }): ReactNode {
  return <li className="feed-item">
    <Avatar name={event.actorName} size="sm" />
    <p><strong>{firstName(event.actorName)}</strong> {describeEvent(event, w)}</p>
    <span className="feed-meta">{event.areaId && <AreaTag id={event.areaId} compact />}{timeAgo(event.createdAt)}</span>
  </li>;
}
