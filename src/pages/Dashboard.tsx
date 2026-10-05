import { useRef, useState, type ReactNode } from 'react';
import { CheckCircle, TrendUp, ClockCounterClockwise, CalendarPlus as CalendarAdd, CaretRight, Exam, HourglassMedium, CalendarX, Barricade, Prohibit, UserPlus, ArrowRight, Plus, CalendarPlus, PencilSimple, FlagPennant, UsersThree } from '@phosphor-icons/react';
import { AREAS, type AreaId, type AuditEvent, type Meeting, type Review, type Student, type Workspace } from '../../shared/types';
import { useApp } from '../context';
import { activitySteps, actionsToday, capitalize, currentAssignment, dateKey, dayDiff, dayLabel, assignmentProgress, dueText, firstName, followUp, formatDate, formatTime, HEALTH, HEALTH_GROUPS, inGroup, isLate, isOpen, isPastUnrecorded, meetingsOn, nextReview, upcomingMeetings, normalize, pendingTasks, plural, relativeDay, reviewsOn, reviewTitle, scoped, studentHealth, timeAgo, today, weekDays, type Health, type HealthGroup, type Task, type TaskKind, type Tone } from '../lib';
import { exitRef, reducedMotion, usePresence } from '../motion';
import { AreaIcon, AreaTag, Avatar, areaName, Badge, Button, Donut, Empty, FilterTabs, CreateMenu, Menu, NextReviewCell, RollingNumber, Search, SectionTitle, Segmented, StatusAvatar, Steps, TextLink } from '../components/ui';
import Calendar from '../components/Calendar';
import StudentAction from '../components/StudentAction';
import MeetingCard from '../components/MeetingCard';

export default function Dashboard() {
  const { readonly } = useApp();
  return readonly ? <Overview /> : <Today />;
}

const todayLabel = () => capitalize(formatDate(new Date(), { weekday: 'long', month: 'long' }));
type Kind = TaskKind | 'stale' | 'idle';
const KIND: Record<Kind, { icon: typeof Exam; tone: Tone; label: string; chip: (n: number) => string; action: string }> = {
  evaluate: { icon: Exam, tone: 'info', label: 'Por evaluar', chip: n => `${n} por evaluar`, action: 'Evaluar' },
  overdue: { icon: HourglassMedium, tone: 'warn', label: 'Atrasada', chip: n => n === 1 ? '1 atrasada' : `${n} atrasadas`, action: 'Registrar entrega' },
  unrecorded: { icon: CalendarX, tone: 'warn', label: 'Revisión sin registrar', chip: n => `${n} sin registrar`, action: 'Registrar' },
  blocked: { icon: Barricade, tone: 'danger', label: 'Con impedimento', chip: n => `${n} con impedimento`, action: 'Ver impedimento' },
  no_delivery: { icon: Prohibit, tone: 'neutral', label: 'No entregó', chip: n => n === 1 ? '1 no entregó' : `${n} no entregaron`, action: 'Cambiar fecha' },
  stale: { icon: ClockCounterClockwise, tone: 'warn', label: 'Sin seguimiento', chip: n => `${n} sin seguimiento`, action: 'Programar revisión' },
  idle: { icon: UserPlus, tone: 'neutral', label: 'Sin actividad', chip: n => `${n} sin actividad`, action: 'Asignar' },
};
const ORDER: Kind[] = ['evaluate', 'overdue', 'unrecorded', 'blocked', 'no_delivery', 'stale', 'idle'];
const SEVERITY: Health[] = ['blocked', 'late', 'review', 'changes', 'active', 'idle', 'paused', 'done'];
interface Item { key: string; kind: Kind; studentId: string; task?: Task }

function KindIcon({ kind, size = 'md' }: { kind: Kind; size?: 'md' | 'lg' }) {
  const meta = KIND[kind]; const Icon = meta.icon;
  return <span className={`kind-icon kind-icon-${size} tone-${meta.tone}`} aria-hidden="true"><Icon size={size === 'lg' ? 20 : 16} weight="bold" /></span>;
}

/* ---------- Responsable ---------- */

/** Calendario y alumnos a la izquierda; a la derecha, lo que hay que hacer y el detalle del día elegido. */
function Today({ areaId, switcher }: { areaId?: AreaId; switcher?: ReactNode }) {
  const app = useApp(); const w = scoped(app.workspace, areaId ?? 'all'); const ro = app.readonly;
  const [selected, setSelected] = useState(today());
  const dayBlock = useRef<HTMLElement>(null);
  const active = w.students.filter(s => s.status === 'active');
  const health = new Map(active.map(s => [s.id, studentHealth(w, s)]));
  const tasks = pendingTasks(w);
  const items: Item[] = [
    ...ORDER.filter(k => k !== 'idle' && k !== 'stale').flatMap(kind => tasks.filter(t => t.kind === kind).map(t => ({ key: t.key, kind, studentId: t.studentId, task: t }))),
    ...active.filter(s => health.get(s.id) !== 'idle' && followUp(w, s).stale).map(s => ({ key: `stale-${s.id}`, kind: 'stale' as const, studentId: s.id })),
    ...active.filter(s => health.get(s.id) === 'idle').map(s => ({ key: `idle-${s.id}`, kind: 'idle' as const, studentId: s.id })),
  ];
  const featured = items[0];
  const rest = usePresence(items.slice(1), i => i.key);
  const agenda = reviewsOn(w, today());
  const weekReviews = weekDays().reduce((n, d) => n + reviewsOn(w, dateKey(d)).length, 0);
  const counts = ORDER.map(kind => ({ kind, n: items.filter(i => i.kind === kind).length })).filter(c => c.n);
  const groups = HEALTH_GROUPS.map(g => ({ ...g, count: active.filter(s => g.members.includes(health.get(s.id)!)).length }));
  const struggling = active.filter(s => ['blocked', 'late'].includes(health.get(s.id)!)).length;
  const done = ro ? 0 : actionsToday(app.workspace);
  // En pantallas angostas el detalle del día queda debajo: al elegir un día se lleva a la vista.
  function pick(key: string) { setSelected(key); dayBlock.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); }

  return <div className="today">
    <div className="today-main">
      <header className="today-head">
        <div className="today-title">
        <h1>{areaName(areaId ?? w.user.areaId!)}</h1>
        <p>{plural(active.length, 'alumno', 'alumnos')} · {plural(weekReviews, 'revisión', 'revisiones')} esta semana{struggling > 0 && <> · <span className="text-warn">{struggling === 1 ? '1 requiere atención' : `${struggling} requieren atención`}</span></>}</p>
        </div>
        {switcher}
        {!ro && <CreateMenu align="end" onPick={kind => app.modal({ type: kind })} />}
        {ro && <Button onClick={() => app.modal({ type: 'meeting', areaIds: areaId ? [areaId] : undefined })}><CalendarAdd size={16} weight="bold" />Agendar reunión</Button>}
      </header>
      <Calendar w={w} selected={selected} onSelect={pick} />
      <Roster w={w} students={active} health={health} />
    </div>

    <aside className="rail" aria-label="Pendientes y día elegido">
      <section className="rail-block rail-summary" aria-label="Resumen">
        {items.length ? <div className="rail-figure">
          <RollingNumber value={items.length} className="rail-number" />
          <span className="rail-unit">{items.length === 1 ? 'pendiente' : 'pendientes'}<small>{agenda.length ? `y ${plural(agenda.length, 'revisión', 'revisiones')} hoy` : 'Sin revisiones hoy'}</small></span>
        </div> : <div className="rail-figure rail-clear">
          <span className="check-draw" aria-hidden="true"><CheckCircle size={44} weight="fill" /></span>
          <span className="rail-unit">Todo al día<small>{agenda.length ? `Te ${agenda.length === 1 ? 'queda 1 revisión' : `quedan ${agenda.length} revisiones`} hoy` : 'Nada pendiente ni revisiones hoy'}</small></span>
        </div>}
        {counts.length > 0 && <ul className="kind-chips" aria-label="Pendientes por tipo">{counts.map(c => { const Icon = KIND[c.kind].icon; return <li key={c.kind} className={`kind-chip tone-${KIND[c.kind].tone}`}><Icon size={14} weight="bold" aria-hidden="true" />{KIND[c.kind].chip(c.n)}</li>; })}</ul>}
        {!ro && meetingsOn(w, today()).filter(m => Date.parse(m.startsAt) + m.durationMinutes * 60000 > Date.now()).slice(0, 2).map(m => <p key={m.id} className="rail-meeting"><UsersThree size={15} weight="bold" aria-hidden="true" /><span><strong>Reunión hoy a las {formatTime(m.startsAt)}</strong>{m.title}</span></p>)}
        {done > 0 && <p className="rail-done"><CheckCircle size={14} weight="fill" aria-hidden="true" />Hoy llevas {plural(done, 'registro', 'registros')}</p>}
        <button type="button" className="rail-health" onClick={() => app.navigate('students', areaId ? { area: areaId } : undefined)} aria-label={`Ver alumnos: ${active.length - struggling} de ${active.length} sin problemas`}>
          <Donut size={76} stroke={9} label={groups.map(g => `${g.label}: ${g.count}`).join(', ')} segments={groups.map(g => ({ value: g.count, tone: g.id === 'idle' ? 'idle' : g.tone }))}>
            <strong>{active.length - struggling}</strong><span>de {active.length}</span>
          </Donut>
          <span className="rail-health-text">
            <strong>{struggling === 0 ? (ro ? 'Sus alumnos van bien' : 'Tus alumnos van bien') : struggling === 1 ? '1 alumno necesita atención' : `${struggling} alumnos necesitan atención`}</strong>
            <span className="legend">{groups.filter(g => g.count).map(g => <span key={g.id}><i className={`legend-dot tone-${g.id === 'idle' ? 'idle' : g.tone}`} />{g.count} {(g.count === 1 ? g.one : g.label).toLowerCase()}</span>)}</span>
          </span>
        </button>
      </section>

      {featured && <section className="rail-block" aria-labelledby="tasks-title">
        <h2 id="tasks-title" className="block-title">Empieza por aquí</h2>
        <Featured key={featured.key} item={featured} health={health.get(featured.studentId) ?? 'active'} />
        {rest.length > 0 && <>
          <h3 className="subhead">Después<span className="count">{items.length - 1}</span></h3>
          <ul className="task-list">{rest.map(({ item, key, exiting }) => <TaskRow key={key} item={item} exiting={exiting} />)}</ul>
        </>}
      </section>}

      <section className="rail-block" ref={dayBlock} aria-labelledby="day-title">
        <DayPanel w={w} selected={selected} />
      </section>
    </aside>
  </div>;
}

function useTaskAction(item: Item) {
  const app = useApp();
  const a = item.task?.assignment; const r = item.task?.review;
  return () => {
    if (item.kind === 'idle') app.modal({ type: 'assignment', studentId: item.studentId });
    else if (item.kind === 'stale') app.modal({ type: 'review', studentId: item.studentId });
    else if (item.kind === 'evaluate' && a) app.modal({ type: 'evaluate', assignment: a });
    else if (item.kind === 'overdue' && a) app.modal({ type: 'delivery', assignment: a });
    else if (item.kind === 'unrecorded' && r) app.modal({ type: 'reviewUpdate', review: r, mode: 'record' });
    else if (a) app.modal({ type: 'assignmentEdit', assignment: a, mode: 'edit' });
  };
}
function itemDetail(item: Item, w: Workspace) {
  const t = item.task; const a = t?.assignment; const r = t?.review;
  switch (item.kind) {
    case 'evaluate': return `Entregó ${relativeDay(t!.date)}`;
    case 'overdue': return `Venció ${relativeDay(t!.date)}`;
    case 'unrecorded': return r ? `Revisión ${relativeDay(r.startsAt)}, ${formatTime(r.startsAt)}` : '';
    case 'blocked': return a?.blockedReason ?? '';
    case 'no_delivery': return 'No entregó. Amplía la fecha o cancela.';
    case 'stale': { const s = w.students.find(x => x.id === item.studentId); return s ? `Sin revisión ni entrega desde hace ${followUp(w, s).days} días` : ''; }
    case 'idle': return 'No tiene trabajo abierto en tu área';
  }
}

function Featured({ item, health }: { item: Item; health: Health }) {
  const app = useApp(); const w = app.workspace;
  const student = w.students.find(s => s.id === item.studentId);
  const a = item.task?.assignment;
  const act = useTaskAction(item); const meta = KIND[item.kind];
  const steps = a ? activitySteps(a, w) : null; const detail = itemDetail(item, scoped(w));
  return <article className={`next tone-${meta.tone}`}>
    <div className="next-top"><KindIcon kind={item.kind} /><span className="next-kind">{meta.label}</span></div>
    <div className="next-body">
      <button type="button" className="next-person" onClick={() => app.openStudent(item.studentId)}><StatusAvatar name={student?.name ?? 'Alumno'} avatar={student?.avatar} health={health} size="lg" /></button>
      <div className="next-text">
        {a ? <button type="button" className="next-title" onClick={() => app.openAssignment(a.id)}>{a.title}</button> : <span className="next-title">{student?.name}</span>}
        <button type="button" className="link-muted" onClick={() => app.openStudent(item.studentId)}>{a ? student?.name : 'Abrir expediente'}</button>
      </div>
    </div>
    {detail && <p className="next-when">{detail}</p>}
    {steps && <Steps steps={steps.steps} label={steps.label} size="lg" />}
    {!app.readonly && <Button className="next-action" onClick={act}>{meta.action}<ArrowRight size={16} weight="bold" /></Button>}
  </article>;
}

function TaskRow({ item, exiting }: { item: Item; exiting: boolean }) {
  const app = useApp(); const w = app.workspace;
  const student = w.students.find(s => s.id === item.studentId);
  const a = item.task?.assignment;
  const act = useTaskAction(item); const detail = itemDetail(item, scoped(w));
  return <li className={`task tone-${KIND[item.kind].tone}`} ref={exitRef(exiting)} aria-hidden={exiting || undefined}>
    <KindIcon kind={item.kind} />
    <button type="button" className="task-main" tabIndex={exiting ? -1 : undefined} onClick={() => a ? app.openAssignment(a.id) : app.openStudent(item.studentId)}>
      <span className="task-text"><strong>{student?.name ?? 'Alumno'}</strong><span>{a?.title ?? (item.kind === 'idle' ? 'Sin actividad asignada' : item.kind === 'stale' ? 'Sin cita próxima' : 'Seguimiento general')}</span></span>
    </button>
    <span className={`task-detail ${item.kind === 'blocked' ? 'task-detail-wrap' : ''}`} title={detail}>{detail}</span>
    {!app.readonly && <Button size="sm" variant="secondary" tabIndex={exiting ? -1 : undefined} onClick={act}>{KIND[item.kind].action}</Button>}
  </li>;
}

/** Revisiones, reuniones y entregas del día elegido en el calendario. Hoy lleva la marca de ahora y las próximas. */
function DayPanel({ w, selected }: { w: Workspace; selected: string }) {
  const app = useApp();
  const isToday = selected === today(); const canSchedule = selected >= today() && !app.readonly;
  const reviews = reviewsOn(w, selected); const meetings = meetingsOn(w, selected);
  const dues = w.assignments.filter(a => isOpen(a) && a.dueAt && dateKey(a.dueAt) === selected);
  const next = [
    ...w.reviews.filter(r => r.status === 'scheduled' && dayDiff(r.startsAt) > 0).map(r => ({ id: r.id, at: r.startsAt, who: w.students.find(s => s.id === r.studentId)?.name ?? 'Alumno', meeting: false, open: () => r.assignmentId ? app.openAssignment(r.assignmentId) : app.openStudent(r.studentId) })),
    ...upcomingMeetings(w).filter(m => dayDiff(m.startsAt) > 0).map(m => ({ id: m.id, at: m.startsAt, who: m.title, meeting: true, open: () => app.navigate('agenda') })),
  ].sort((x, y) => x.at.localeCompare(y.at)).slice(0, 4);
  const date = new Date(`${selected}T12:00:00-06:00`);
  const timeline = [...reviews.map(r => ({ at: r.startsAt, node: <DayItem key={r.id} review={r} w={w} /> })), ...meetings.map(m => ({ at: m.startsAt, node: <MeetingItem key={m.id} meeting={m} /> }))].sort((x, y) => x.at.localeCompare(y.at));
  const nowIndex = timeline.findIndex(t => Date.parse(t.at) > Date.now());
  const entries = timeline.map(t => t.node);
  if (isToday && timeline.length) entries.splice(nowIndex === -1 ? entries.length : nowIndex, 0, <li className="now-line" key="now"><span>Ahora · {formatTime(new Date().toISOString())}</span></li>);
  const count = [reviews.length && plural(reviews.length, 'revisión', 'revisiones'), meetings.length && plural(meetings.length, 'reunión', 'reuniones')].filter(Boolean).join(' · ');
  return <>
    <div className="block-head day-head">
      <h2 id="day-title" className="block-title">{isToday ? (app.readonly ? 'Hoy' : 'Tu día') : capitalize(formatDate(date, { weekday: 'short', day: 'numeric', month: 'long' }))}</h2>
      <span className="day-sub">{count || 'Sin citas'}</span>
    </div>
    {timeline.length ? <ol className="day-line">{entries}</ol> : <p className="side-empty">{isToday ? 'Sin revisiones ni reuniones hoy.' : 'Nada agendado este día.'}</p>}
    {dues.length > 0 && <>
      <h3 className="subhead"><FlagPennant size={13} weight="fill" aria-hidden="true" />&nbsp;Vencen este día<span className="count">{dues.length}</span></h3>
      <ul className="due-rows">{dues.map(a => { const st = w.students.find(s => s.id === a.studentId); return <li key={a.id}><button type="button" onClick={() => app.openAssignment(a.id)}>
        <Avatar name={st?.name ?? 'Alumno'} avatar={st?.avatar} size="sm" /><span><strong>{a.title}</strong><small>{st?.name} · {dueText(a)}</small></span>
      </button></li>; })}</ul>
    </>}
    {canSchedule && <button type="button" className="day-add" onClick={() => app.modal({ type: 'review', date: selected })}><Plus size={15} aria-hidden="true" />Programar revisión en este día</button>}
    {app.readonly && selected >= today() && <button type="button" className="day-add" onClick={() => app.modal({ type: 'meeting', date: selected, areaIds: w.reviews[0] ? [w.reviews[0].areaId] : undefined })}><Plus size={15} aria-hidden="true" />Agendar reunión este día</button>}
    {isToday && next.length > 0 && <>
      <h3 className="subhead">Próximas</h3>
      <ul className="upcoming">{next.map(n => <li key={n.id}><button type="button" onClick={n.open}>
        <span className="upcoming-when"><strong>{dayLabel(n.at, true)}</strong>{formatTime(n.at)}</span>
        <span className={`upcoming-who ${n.meeting ? 'is-meeting' : ''}`}>{n.meeting && <UsersThree size={13} weight="bold" aria-hidden="true" />}{n.who}</span>
      </button></li>)}</ul>
    </>}
    <TextLink onClick={() => app.navigate('agenda', app.readonly ? { area: w.reviews[0]?.areaId ?? '' } : undefined)}>Abrir agenda</TextLink>
  </>;
}
/** Reunión con el jefe dentro de la línea del día: no abre nada; muestra asunto y lugar. */
function MeetingItem({ meeting }: { meeting: Meeting }) {
  const app = useApp();
  const past = Date.parse(meeting.startsAt) + meeting.durationMinutes * 60000 < Date.now();
  return <li className={`day-item day-meeting ${past ? 'is-done' : ''} ${app.fresh.has(meeting.id) ? 'is-fresh' : ''}`}>
    <span className="day-time">{formatTime(meeting.startsAt)}</span>
    <span className="day-dot" aria-hidden="true" />
    <span className="day-body"><strong>{meeting.title}</strong><span>Reunión{app.readonly ? '' : ` con ${meeting.organizerName}`}{meeting.place ? ` · ${meeting.place}` : ''}</span></span>
    <span className="meeting-badge"><UsersThree size={13} weight="bold" aria-hidden="true" />{meeting.durationMinutes} min</span>
  </li>;
}
function DayItem({ review, w }: { review: Review; w: Workspace }) {
  const app = useApp();
  const student = w.students.find(s => s.id === review.studentId);
  const past = isPastUnrecorded(review);
  const state = review.status === 'completed' ? 'is-done' : past ? 'is-due' : review.status === 'missed' ? 'is-done' : '';
  return <li className={`day-item ${state} ${app.fresh.has(review.id) ? 'is-fresh' : ''}`}>
    <span className="day-time">{formatTime(review.startsAt)}</span>
    <span className="day-dot" aria-hidden="true" />
    <button type="button" className="day-body" onClick={() => review.assignmentId ? app.openAssignment(review.assignmentId) : app.openStudent(review.studentId)}>
      <strong>{student?.name}</strong><span>{reviewTitle(review, w)}</span>
    </button>
    {review.status === 'completed' ? <CheckCircle size={18} weight="fill" className="day-check" aria-label="Realizada" />
      : review.status === 'missed' ? <Badge>No se realizó</Badge>
      : past ? app.readonly ? <Badge tone="warn">Sin registrar</Badge> : <Button size="sm" variant="secondary" onClick={() => app.modal({ type: 'reviewUpdate', review, mode: 'record' })}>Registrar</Button>
      : null}
  </li>;
}

/** Tabla de alumnos activos: primero quienes piden atención. Sin marco; las filas se separan con una línea. */
function Roster({ w, students, health }: { w: Workspace; students: Student[]; health: Map<string, Health> }) {
  const app = useApp();
  const [filter, setFilter] = useState<'all' | 'stale' | HealthGroup>('all'); const [search, setSearch] = useState('');
  const rows = [...students]
    .sort((a, b) => SEVERITY.indexOf(health.get(a.id)!) - SEVERITY.indexOf(health.get(b.id)!) || a.name.localeCompare(b.name))
    .map(s => ({ s, h: health.get(s.id)!, current: currentAssignment(w, s.id), next: nextReview(w, s.id), follow: followUp(w, s) }));
  const q = normalize(search.trim());
  const isStale = (r: typeof rows[number]) => r.h !== 'idle' && r.follow.stale;
  const visible = rows.filter(r => (filter === 'all' || (filter === 'stale' ? isStale(r) : inGroup(r.h, filter))) && normalize(`${r.s.name} ${r.s.registration} ${r.s.technologies.join(' ')}`).includes(q));
  const options = [
    { value: 'all' as const, label: 'Todos', count: rows.length },
    ...HEALTH_GROUPS.map(g => ({ value: g.id, label: g.label, count: rows.filter(r => inGroup(r.h, g.id)).length, tone: g.tone })).filter(o => o.count || o.value === filter),
    ...[{ value: 'stale' as const, label: 'Sin seguimiento', count: rows.filter(isStale).length, tone: 'warn' as const }].filter(o => o.count || o.value === filter),
  ];
  return <section className="roster" aria-labelledby="roster-title">
    <div className="block-head">
      <h2 id="roster-title" className="block-title">{app.readonly ? 'Alumnos' : 'Mis alumnos'}<span className="count">{rows.length}</span></h2>
      <div className="roster-tools"><Search value={search} onChange={setSearch} placeholder="Buscar alumno" label="Buscar alumnos" /><TextLink onClick={() => app.navigate('students')}>Ver todos</TextLink></div>
    </div>
    {rows.length > 0 && <FilterTabs label="Filtrar por situación" value={filter} onChange={setFilter} options={options} />}
    {rows.length === 0 ? <p className="side-empty">Aún no tienes alumnos activos. Agrégalos desde la sección Alumnos.</p> : <div className="table-scroll">
      <table className="table table-flat table-cards">
        <thead><tr><th>Alumno</th><th className="col-md">Actividad actual</th><th className="col-lg">Próxima revisión</th><th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{visible.map(({ s, h, current, next, follow }) => <tr key={s.id} className={`row-link ${app.fresh.has(s.id) ? 'is-fresh' : ''}`} onClick={() => app.openStudent(s.id)}>
          <td><button type="button" className="student-name" onClick={e => { e.stopPropagation(); app.openStudent(s.id); }}>
            <StatusAvatar name={s.name} avatar={s.avatar} health={h} />
            <span><strong>{s.name}</strong><small className={`health-text tone-${HEALTH[h].dot}`}><i className="legend-dot" aria-hidden="true" />{HEALTH[h].label}</small></span>
          </button></td>
          <td className="col-md c-show">{current ? <span className="cell-progress"><Steps {...activitySteps(current, w)} /><span className="cell-stack"><span className="cell-title">{current.title}</span><small>{dueText(current)}{(() => { const p = assignmentProgress(current, w); return p !== null && p < 100 ? ` · ${p} %` : ''; })()}</small></span></span> : <span className="muted">Ninguna</span>}</td>
          <td className="col-lg"><NextReviewCell next={next} follow={follow} idle={h === 'idle'} /></td>
          <td className="cell-actions">{!app.readonly && <span className="row-actions"><StudentAction student={s} /><Menu label={`Más acciones para ${s.name}`} items={[
            ...(current ? [{ label: 'Registrar avance o entrega', icon: <TrendUp size={16} />, onSelect: () => app.modal({ type: 'progress', assignment: current }) }] : []),
            { label: 'Asignar actividad', icon: <Plus size={16} />, onSelect: () => app.modal({ type: 'assignment', studentId: s.id }) },
            { label: 'Programar revisión', icon: <CalendarPlus size={16} />, onSelect: () => app.modal({ type: 'review', studentId: s.id }) },
            'separator',
            { label: 'Editar expediente', icon: <PencilSimple size={16} />, onSelect: () => app.modal({ type: 'student', student: s }) },
          ]} /></span>}</td>
        </tr>)}</tbody>
      </table>
      {!visible.length && <Empty icon={<UsersThree size={20} />} title="No encontramos alumnos" description="Prueba con otro nombre o cambia el filtro." action={filter !== 'all' || search ? <Button variant="secondary" size="sm" onClick={() => { setFilter('all'); setSearch(''); }}>Quitar filtros</Button> : undefined} />}
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
        { id: 'unrecorded', label: 'Revisiones sin registrar', value: pendingTasks(s).filter(t => t.kind === 'unrecorded').length, tone: 'warn', go: () => app.navigate('agenda', { area: area.id }) },
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
      <section aria-label="Calendario del laboratorio"><Calendar w={w} selected={selected} onSelect={setSelected} byArea /></section>
      <div className="overview-side">
        <section aria-labelledby="overview-meetings">
          <SectionTitle id="overview-meetings" title="Próximas reuniones" count={meetings.length}><TextLink onClick={() => app.modal({ type: 'meeting', date: selected >= today() ? selected : undefined })}>Agendar</TextLink></SectionTitle>
          {meetings.length ? <div className="stack">{meetings.map(m => <MeetingCard key={m.id} meeting={m} withDate />)}</div> : <p className="side-empty">Sin reuniones agendadas con los responsables.</p>}
        </section>
        <section aria-labelledby="overview-agenda">
          <SectionTitle id="overview-agenda" title={isToday ? 'Revisiones de hoy' : `Revisiones del ${formatDate(`${selected}T12:00:00-06:00`, { weekday: 'long' })}`} count={agenda.length}><TextLink onClick={() => app.navigate('agenda')}>Agenda</TextLink></SectionTitle>
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
