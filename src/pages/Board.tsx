import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Barricade, CalendarBlank, CheckCircle, Circle, CircleHalf, Exam, FileText, Hourglass, Kanban, LinkSimple, ListChecks, Pause, Plus, Rows, SealCheck, Sparkle, Stack, Sun, UserPlus, Users, ArrowsClockwise, ClockCountdown, Flag, Archive, GraduationCap, FolderOpen } from '@phosphor-icons/react';
import type { ActivityDraft, Assignment, Student, Workspace } from '../../shared/types';
import { useApp } from '../context';
import { RESEARCH_DRIVE, ThesisCycle, daysInPhase, thesisNext } from '../components/Thesis';
import { nextPhase, phaseInfo, STEP_LABEL, THESIS_PHASES, type ThesisPhase, type ThesisStep } from '../../shared/thesis';
import { actionsToday, assignmentProgress, dateKey, dayDiff, dueText, formatDate, HEALTH, isLate, isOpen, isWaiting, normalize, pauseOf, PAUSE_LABELS, plural, scoped, studentHealth, timeAgo, today, type Health } from '../lib';
import { Avatar, Badge, Button, Empty, Menu, Search, StatusAvatar } from '../components/ui';
import { beginDrag, DragLayer, useDragState, type DragItem } from '../components/CalendarDrag';
import { buildItems, describeEvent, itemDetail, KIND, TODAY_KINDS, LATER_KINDS, useTaskAction, type Item } from './Dashboard';

type View = 'activities' | 'thesis' | 'day' | 'people' | 'bank';
const VIEWS: { id: View; label: string; icon: typeof Kanban; hint: string }[] = [
  { id: 'activities', label: 'Actividades', icon: Kanban, hint: 'Cada actividad en su etapa; arrastra para registrar el siguiente paso.' },
  { id: 'thesis', label: 'Tesis', icon: GraduationCap, hint: 'Cada tesista en su fase. Arrástralo a otra fase para moverlo.' },
  { id: 'day', label: 'Mi día', icon: Sun, hint: 'Lo atrasado, lo de hoy y lo que ya registraste hoy.' },
  { id: 'people', label: 'Participación', icon: Users, hint: 'En qué momento de su participación está cada alumno.' },
  { id: 'bank', label: 'Banco', icon: Archive, hint: 'Actividades preparadas sin alumno; arrástralas a quien le toque.' },
];

/** Tablero: cuatro vistas tipo Trello sobre los mismos datos. Mover una tarjeta nunca cambia el estado por sí solo:
 *  abre el registro que lo justifica (avance, entrega, evaluación, impedimento, pausa). Así el historial no se contradice. */
export default function Board() {
  const app = useApp();
  const [view, setView] = useState<View>(() => (app.params.get('v') as View) ?? 'activities');
  const pick = (v: View) => { setView(v); history.replaceState(null, '', `#board${v === 'activities' ? '' : `?v=${v}`}`); };
  const hasThesis = app.workspace.students.some(s => s.thesis) || app.workspace.user.areaId === 'research';
  const views = (app.readonly ? VIEWS.filter(v => v.id !== 'day' && v.id !== 'bank') : VIEWS).filter(v => v.id !== 'thesis' || hasThesis);
  const current = VIEWS.find(v => v.id === view)!;
  return <div className="board-page">
    <header className="board-head">
      <div className="page-title"><h1>Tablero</h1><p>{current.hint}</p></div>
      <div className="board-views" role="tablist" aria-label="Vista del tablero">{views.map(v => <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={view === v.id ? 'is-on' : ''} onClick={() => pick(v.id)}><v.icon size={16} weight={view === v.id ? 'fill' : 'regular'} aria-hidden="true" />{v.label}</button>)}</div>
    </header>
    {view === 'activities' && <ActivitiesBoard />}
    {view === 'thesis' && hasThesis && <ThesisBoard />}
    {view === 'day' && !app.readonly && <DayBoard />}
    {view === 'people' && <PeopleBoard />}
    {view === 'bank' && !app.readonly && <BankBoard />}
    <DragLayer />
  </div>;
}

/* ---------- Actividades por etapa ---------- */

type Stage = 'todo' | 'doing' | 'waiting' | 'review' | 'changes' | 'done';
const STAGES: { id: Stage; title: string; who: string; icon: typeof Circle; tone: string }[] = [
  { id: 'todo', title: 'Por iniciar', who: 'Asignada, sin avances registrados', icon: Circle, tone: 'neutral' },
  { id: 'doing', title: 'En curso', who: 'Con avances registrados', icon: CircleHalf, tone: 'info' },
  { id: 'waiting', title: 'En espera', who: 'Detenida por algo externo', icon: Hourglass, tone: 'wait' },
  { id: 'review', title: 'Por evaluar', who: 'Entrega final registrada; te toca evaluar', icon: Exam, tone: 'info' },
  { id: 'changes', title: 'Correcciones', who: 'Pediste cambios; espera la nueva entrega', icon: ArrowsClockwise, tone: 'warn' },
  { id: 'done', title: 'Terminadas', who: 'Evaluadas en los últimos 30 días', icon: CheckCircle, tone: 'ok' },
];
function stageOf(a: Assignment, w: Workspace): Stage | null {
  if (a.status === 'cancelled') return null;
  if (a.status === 'completed') return dayDiff(a.updatedAt) >= -30 ? 'done' : null;
  if (a.blockedReason) return 'waiting';
  if (a.status === 'pending_review') return 'review';
  if (a.status === 'changes_requested') return 'changes';
  return w.deliveries.some(d => d.assignmentId === a.id && d.completeness === 'partial') ? 'doing' : 'todo';
}
/** Qué registro corresponde a cada movimiento. Si no tiene sentido, se dice por qué antes de soltar. */
function moveRule(from: Stage, to: Stage): { ok: true; open: 'progress' | 'delivery' | 'block' | 'resolve' | 'evaluate' } | { ok: false; why: string } {
  if (from === to) return { ok: false, why: 'Ya está en esta etapa' };
  if (to === 'todo') return { ok: false, why: 'Un avance registrado no se deshace' };
  if (from === 'done') return { ok: false, why: 'Terminada: crea una nueva evaluación desde su detalle' };
  if (from === 'waiting') return to === 'doing' ? { ok: true, open: 'resolve' } : { ok: false, why: 'Primero resuelve el impedimento (suéltala en En curso)' };
  if (to === 'waiting') return from === 'review' ? { ok: false, why: 'Ya está entregada; evalúala' } : { ok: true, open: 'block' };
  if (to === 'doing') return from === 'todo' || from === 'doing' ? { ok: true, open: 'progress' } : from === 'changes' ? { ok: true, open: 'progress' } : { ok: false, why: 'Ya está entregada; evalúala' };
  if (to === 'review') return from === 'review' ? { ok: false, why: 'Ya está aquí' } : { ok: true, open: 'delivery' };
  if (to === 'changes' || to === 'done') return from === 'review' ? { ok: true, open: 'evaluate' } : { ok: false, why: 'Solo se evalúa lo que está en Por evaluar' };
  return { ok: false, why: 'Aquí no' };
}

function ActivitiesBoard() {
  const app = useApp(); const w = scoped(app.workspace); const ro = app.readonly;
  const [query, setQuery] = useState(''); const [lanes, setLanes] = useState(true); const [attention, setAttention] = useState(false);
  const drag = useDragState();
  // Quien solo tiene tesis (sin actividades) va al final: su avance se sigue en la vista Tesis.
  const thesisOnly = (s: Student) => !!s.thesis && !w.assignments.some(a => a.studentId === s.id && isOpen(a));
  const students = w.students.filter(s => s.status === 'active').sort((a, b) => Number(thesisOnly(a)) - Number(thesisOnly(b)) || a.name.localeCompare(b.name));
  const q = normalize(query.trim());
  const cards = w.assignments.map(a => ({ a, stage: stageOf(a, w) })).filter((c): c is { a: Assignment; stage: Stage } => !!c.stage)
    .filter(({ a }) => !q || normalize(`${a.title} ${w.students.find(s => s.id === a.studentId)?.name ?? ''} ${a.phase ?? ''}`).includes(q))
    .filter(({ a }) => !attention || isLate(a, w) || (!!a.blockedReason && !isWaiting(a)) || a.status === 'pending_review');
  const open = w.assignments.filter(isOpen); const doneMonth = w.assignments.filter(a => a.status === 'completed' && dayDiff(a.updatedAt) >= -30).length;
  const counts = Object.fromEntries(STAGES.map(s => [s.id, cards.filter(c => c.stage === s.id).length])) as Record<Stage, number>;
  function act(a: Assignment, open: 'progress' | 'delivery' | 'block' | 'resolve' | 'evaluate') {
    if (open === 'progress') app.modal({ type: 'progress', assignment: a, kind: 'partial' });
    else if (open === 'delivery') app.modal({ type: 'delivery', assignment: a, kind: 'complete' });
    else if (open === 'block') app.modal({ type: 'block', assignment: a, mode: 'mark' });
    else if (open === 'resolve') app.modal({ type: 'block', assignment: a, mode: 'resolve' });
    else app.modal({ type: 'evaluate', assignment: a });
  }
  const dragFor = (a: Assignment, from: Stage): DragItem | undefined => ro ? undefined : {
    id: a.id, title: a.title, person: w.students.find(s => s.id === a.studentId)?.name ?? 'Alumno', avatar: w.students.find(s => s.id === a.studentId)?.avatar,
    tip: 'Soltar para registrar',
    accepts: target => { const [to, sid] = target.split('|') as [Stage, string?]; if (sid && sid !== a.studentId) return 'Una actividad no cambia de alumno'; const r = moveRule(from, to); return r.ok ? true : r.why; },
    drop: target => { const r = moveRule(from, target.split('|')[0] as Stage); if (r.ok) act(a, r.open); },
  };
  const card = (a: Assignment, stage: Stage) => <BoardCard key={a.id} a={a} w={w} drag={dragFor(a, stage)} showPerson={!lanes} />;
  const column = (s: (typeof STAGES)[number], items: { a: Assignment; stage: Stage }[], sid?: string) => {
    const key = sid ? `${s.id}|${sid}` : s.id; const over = drag?.over === key;
    // En carriles, las terminadas son un contador que lleva a la historia del alumno: no inflan su fila.
    if (sid && s.id === 'done') return <div key={key} data-drop={key} className={`kb-cell kb-cell-done ${over ? (drag!.blocked ? 'is-blocked' : 'is-over') : ''}`}>
      {items.length > 0 ? <button type="button" className="kb-done-link" onClick={() => app.openStudent(sid)}><CheckCircle size={14} weight="fill" aria-hidden="true" />{plural(items.length, 'terminada', 'terminadas')}<small>Ver su historia</small></button> : <span className="kb-empty">—</span>}
    </div>;
    const shown = !sid && s.id === 'done' ? items.slice(0, 8) : items;
    return <div key={key} data-drop={key} className={`kb-cell ${over ? (drag!.blocked ? 'is-blocked' : 'is-over') : ''}`}>
      {shown.map(c => card(c.a, c.stage))}
      {shown.length < items.length && <button type="button" className="kb-add" onClick={() => app.navigate('assignments', { status: 'completed' })}>Ver las {items.length} terminadas</button>}
      {!sid && !items.length && <p className="kb-empty">{s.id === 'todo' ? 'Nada por iniciar.' : 'Vacía'}</p>}
      {!ro && s.id === 'todo' && <button type="button" className="kb-add" onClick={() => app.modal({ type: 'assignment', studentId: sid })}><Plus size={14} weight="bold" aria-hidden="true" />Añadir actividad</button>}
    </div>;
  };
  const header = <div className="kb-heads">{lanes && <div className="kb-lane-spacer">Alumno</div>}{STAGES.map(s => <div key={s.id} className={`kb-col-head tone-${s.tone}`} title={s.who}><s.icon size={16} weight="bold" aria-hidden="true" /><strong>{s.title}</strong><span className="kb-count">{counts[s.id]}</span></div>)}</div>;
  return <>
    <div className="board-tools">
      <Search value={query} onChange={setQuery} placeholder="Buscar actividad, alumno o fase" label="Buscar en el tablero" />
      <button type="button" className={`board-toggle ${lanes ? 'is-on' : ''}`} aria-pressed={lanes} onClick={() => setLanes(v => !v)}><Rows size={15} aria-hidden="true" />Un carril por alumno</button>
      <button type="button" className={`board-toggle ${attention ? 'is-on' : ''}`} aria-pressed={attention} onClick={() => setAttention(v => !v)}><Flag size={15} aria-hidden="true" />Solo lo que pide atención</button>
      <div className="board-summary"><span><strong>{open.length}</strong> abiertas</span><span><strong>{counts.review}</strong> por evaluar</span><span><strong>{doneMonth}</strong> terminadas en 30 días</span>
        <i className="board-meter" aria-hidden="true"><b style={{ width: `${Math.round(doneMonth / Math.max(1, doneMonth + open.length) * 100)}%` }} /></i></div>
    </div>
    <div className={`kb ${lanes ? 'kb-lanes' : ''}`} style={{ '--cols': STAGES.length } as CSSProperties}>
      {header}
      {lanes ? students.map(st => {
        const mine = cards.filter(c => c.a.studentId === st.id); const openN = w.assignments.filter(a => a.studentId === st.id && isOpen(a)).length;
        const h = studentHealth(w, st);
        if (q && !mine.length) return null;
        if (attention && !mine.length && openN > 0) return null;
        return <div key={st.id} className="kb-lane">
          <div className="kb-lane-head">
            <button type="button" className="kb-person" onClick={() => app.openStudent(st.id)}><StatusAvatar name={st.name} avatar={st.avatar} health={h} size="sm" /><span><strong>{st.name}</strong>{openN === 0 && st.thesis ? <small className="is-thesis">Tesis · {phaseInfo(st.thesis.phase).short}</small> : <small className={openN === 0 ? 'is-idle' : openN > 3 ? 'is-over' : ''}>{openN === 0 ? 'Sin actividad' : openN > 3 ? `${openN} abiertas · sobrecargado` : plural(openN, 'abierta', 'abiertas')}</small>}</span></button>
            {!ro && openN === 0 && !st.thesis && <Button size="sm" onClick={() => app.modal({ type: 'assignment', studentId: st.id })}><UserPlus size={14} />Asignar</Button>}
          </div>
          {STAGES.map(s => column(s, mine.filter(c => c.stage === s.id), st.id))}
        </div>;
      }) : <div className="kb-lane kb-flat">{STAGES.map(s => column(s, cards.filter(c => c.stage === s.id)))}</div>}
    </div>
    {!ro && <p className="board-foot">Arrastra una tarjeta a otra etapa: se abre el registro que corresponde (avance, entrega, evaluación o impedimento). Con teclado, abre la actividad y usa sus botones.</p>}
  </>;
}

/** Tarjeta de actividad: lo justo para decidir sin abrirla. */
function BoardCard({ a, w, drag, showPerson = true }: { a: Assignment; w: Workspace; drag?: DragItem; showPerson?: boolean }) {
  const app = useApp();
  const st = w.students.find(s => s.id === a.studentId);
  const skills = a.skillIds.map(id => w.skills.find(s => s.id === id)?.name).filter(Boolean) as string[];
  const progress = assignmentProgress(a, w); const late = isLate(a, w);
  const deliveries = w.deliveries.filter(d => d.assignmentId === a.id).length;
  const material = a.links.length + w.attachments.filter(x => x.assignmentId === a.id).length;
  const waiting = isWaiting(a);
  const due = a.status === 'completed' ? null : waiting ? { text: `Espera hasta ${formatDate(`${a.blockedReviewAt}T12:00:00-06:00`)}`, tone: 'wait' } : a.blockedReason ? { text: 'Revisar impedimento', tone: 'warn' } : late ? { text: dueText(a), tone: 'warn' } : a.dueAt ? { text: formatDate(a.dueAt), tone: dayDiff(a.dueAt) <= 2 ? 'soon' : '' } : null;
  return <article className={`kb-card ${drag ? 'is-draggable' : ''} ${app.fresh.has(a.id) ? 'is-fresh' : ''}`} onPointerDown={drag ? e => { if (!(e.target as HTMLElement).closest('.button, .icon-button, [aria-haspopup]')) beginDrag(drag, e); } : undefined}>
    <button type="button" className="kb-card-main" onClick={() => app.openAssignment(a.id)}>
      <span className="kb-tags">{a.phase && <span className="kb-tag is-phase">{a.phase}</span>}{skills.slice(0, a.phase ? 1 : 2).map(s => <span key={s} className="kb-tag">{s}</span>)}{skills.length > (a.phase ? 1 : 2) && <span className="kb-tag is-more">+{skills.length - (a.phase ? 1 : 2)}</span>}</span>
      <strong>{a.title}</strong>
      {a.blockedReason ? <span className="kb-desc is-block"><Barricade size={13} aria-hidden="true" />{a.blockedReason}</span> : showPerson && a.description && <span className="kb-desc">{a.description}</span>}
    </button>
    {progress !== null && progress < 100 && a.status !== 'completed' && <span className="kb-progress" aria-label={`Avance ${progress} %`}><i style={{ width: `${progress}%` }} /></span>}
    <footer className="kb-card-foot">
      {showPerson && st && <Avatar name={st.name} avatar={st.avatar} size="sm" />}
      {due && <span className={`kb-due ${due.tone ? `is-${due.tone}` : ''}`}>{waiting ? <Hourglass size={13} aria-hidden="true" /> : <CalendarBlank size={13} aria-hidden="true" />}{due.text}</span>}
      <span className="kb-meta">{deliveries > 0 && <span title={plural(deliveries, 'entrega registrada', 'entregas registradas')}><FileText size={13} aria-hidden="true" />{deliveries}</span>}{material > 0 && <span title={plural(material, 'material', 'materiales')}><LinkSimple size={13} aria-hidden="true" />{material}</span>}{progress !== null && progress < 100 && a.status !== 'completed' && <span>{progress} %</span>}</span>
    </footer>
  </article>;
}

/* ---------- Mi día ---------- */

function DayBoard() {
  const app = useApp(); const w = scoped(app.workspace);
  const drag = useDragState();
  const active = w.students.filter(s => s.status === 'active');
  const health = new Map(active.map(s => [s.id, studentHealth(w, s)]));
  const items = buildItems(w, active, health);
  const later = items.filter(i => !TODAY_KINDS.includes(i.kind) && !LATER_KINDS.includes(i.kind));
  const now = items.filter(i => TODAY_KINDS.includes(i.kind));
  const done = app.workspace.audit.filter(e => e.actorName === w.user.name && dateKey(e.createdAt) === today());
  // Mismo total que la columna derecha de Hoy: lo registrado hoy más todo lo que sigue pendiente.
  const total = items.length + actionsToday(app.workspace);
  const col = (id: string, title: string, icon: ReactNode, tone: string, body: ReactNode, count: number, hint: string) => <section className={`kb-day-col tone-${tone} ${drag?.over === id ? (drag.blocked ? 'is-blocked' : 'is-over') : ''}`} data-drop={id} aria-labelledby={`col-${id}`}>
    <header className="kb-col-head"><span aria-hidden="true">{icon}</span><strong id={`col-${id}`}>{title}</strong><span className="kb-count">{count}</span></header>
    <p className="kb-col-hint">{hint}</p>
    <div className="kb-day-list">{body}</div>
  </section>;
  return <>
    <div className="board-tools"><div className="board-summary"><span><strong>{actionsToday(app.workspace)}</strong> de <strong>{total}</strong> registrados hoy</span><i className="board-meter" aria-hidden="true"><b style={{ width: `${Math.round(actionsToday(app.workspace) / Math.max(1, total) * 100)}%` }} /></i></div></div>
    <div className="kb-day">
      {col('later', 'Atrasado', <ClockCountdown size={16} weight="bold" />, 'warn', later.length ? later.map(i => <DayCard key={i.key} item={i} health={health.get(i.studentId) ?? 'active'} />) : <p className="kb-empty">Nada atrasado.</p>, later.length, 'Lo que ya debió registrarse.')}
      {col('now', 'Para hoy', <Sun size={16} weight="bold" />, 'info', now.length ? now.map(i => <DayCard key={i.key} item={i} health={health.get(i.studentId) ?? 'active'} />) : <p className="kb-empty">Nada para hoy.</p>, now.length, 'Revisiones de hoy y entregas que vencen hoy.')}
      {col('done', 'Hecho hoy', <SealCheck size={16} weight="bold" />, 'ok', done.length ? done.map(e => <div key={e.id} className="kb-done"><CheckCircle size={16} weight="fill" aria-hidden="true" /><span><strong>{describeEvent(e, app.workspace).replace(/^./, c => c.toUpperCase())}</strong><small>{timeAgo(e.createdAt)}</small></span></div>) : <p className="kb-empty">Aún nada. Suelta aquí una tarjeta para registrarla.</p>, done.length, 'Lo que registraste hoy. Suelta aquí para registrar.')}
    </div>
  </>;
}
function DayCard({ item, health }: { item: Item; health: Health }) {
  const app = useApp(); const w = app.workspace;
  const st = w.students.find(s => s.id === item.studentId); const act = useTaskAction(item);
  const drag: DragItem = { id: item.key, title: item.assignment?.title ?? st?.name ?? 'Pendiente', person: st?.name ?? 'Alumno', avatar: st?.avatar, tip: 'Soltar para registrarlo', accepts: t => t === 'done' ? true : 'Suéltala en «Hecho hoy»', drop: () => act() };
  return <article className="kb-card is-draggable" onPointerDown={e => { if (!(e.target as HTMLElement).closest('.button, .icon-button, [aria-haspopup]')) beginDrag(drag, e); }}>
    <button type="button" className="kb-card-main" onClick={() => item.assignment ? app.openAssignment(item.assignment.id) : app.openStudent(item.studentId)}>
      <span className="kb-tags"><span className={`kb-tag tone-${KIND[item.kind].tone}`}>{KIND[item.kind].action}</span></span>
      <strong>{item.assignment?.title ?? st?.name}</strong>
      <span className="kb-desc">{itemDetail(item, scoped(w))}</span>
    </button>
    <footer className="kb-card-foot"><StatusAvatar name={st?.name ?? 'Alumno'} avatar={st?.avatar} health={health} size="sm" /><span className="kb-person-name">{st?.name}</span><Button size="sm" className="kb-card-action" onClick={act}>{KIND[item.kind].action}<ArrowRight size={13} weight="bold" /></Button></footer>
  </article>;
}

/* ---------- Participación ---------- */

type Phase = 'new' | 'active' | 'idle' | 'waiting' | 'paused' | 'ending' | 'done';
const PHASES: { id: Phase; title: string; hint: string; icon: typeof Circle; tone: string }[] = [
  { id: 'new', title: 'Recién llegados', hint: 'Alta en los últimos 14 días', icon: Sparkle, tone: 'info' },
  { id: 'active', title: 'Activos', hint: 'Con trabajo en curso', icon: CircleHalf, tone: 'ok' },
  { id: 'idle', title: 'Sin actividad', hint: 'Necesitan una actividad', icon: UserPlus, tone: 'idle' },
  { id: 'waiting', title: 'En espera', hint: 'Detenidos por algo externo', icon: Hourglass, tone: 'wait' },
  { id: 'paused', title: 'En pausa', hint: 'Participación pausada', icon: Pause, tone: 'neutral' },
  { id: 'ending', title: 'Por terminar', hint: 'Su periodo termina en 30 días', icon: Flag, tone: 'warn' },
  { id: 'done', title: 'Terminaron', hint: 'Participación concluida', icon: SealCheck, tone: 'ok' },
];
function phaseOf(s: Student, w: Workspace): Phase {
  if (s.status === 'completed') return 'done';
  if (s.status === 'paused') return 'paused';
  // Solo con fecha de término registrada: sin ella no se sabe cuándo termina.
  const h = studentHealth(w, s); const end = s.endDate;
  if (end && dayDiff(`${end}T12:00:00-06:00`) <= 30 && dayDiff(`${end}T12:00:00-06:00`) >= 0) return 'ending';
  if (h === 'idle') return 'idle';
  if (h === 'waiting') return 'waiting';
  if (dayDiff(s.createdAt) >= -14) return 'new';
  return 'active';
}
function PeopleBoard() {
  const app = useApp(); const w = scoped(app.workspace); const ro = app.readonly;
  const drag = useDragState(); const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const people = w.students.filter(s => !q || normalize(`${s.name} ${s.registration}`).includes(q)).map(s => ({ s, phase: phaseOf(s, w) }));
  const dragFor = (s: Student, from: Phase): DragItem | undefined => ro ? undefined : {
    id: s.id, title: s.name, person: s.name, avatar: s.avatar, tip: 'Soltar para registrarlo',
    accepts: to => to === from ? 'Ya está aquí' : to === 'paused' ? (from === 'done' ? 'Ya terminó' : true) : from === 'paused' && (to === 'active' || to === 'new') ? true : to === 'active' && from === 'idle' ? true : to === 'done' ? true : 'Esta etapa se calcula sola',
    drop: to => { if (to === 'paused') app.modal({ type: 'pause', student: s }); else if (from === 'paused') app.modal({ type: 'resume', student: s }); else if (from === 'idle' && to === 'active') app.modal({ type: 'assignment', studentId: s.id }); else if (to === 'done') app.modal({ type: 'student', student: s }); },
  };
  return <>
    <div className="board-tools"><Search value={query} onChange={setQuery} placeholder="Buscar alumno" label="Buscar alumno" /><div className="board-summary">{PHASES.filter(p => ['idle', 'waiting', 'paused', 'ending'].includes(p.id)).map(p => <span key={p.id}><strong>{people.filter(x => x.phase === p.id).length}</strong> {p.title.toLowerCase()}</span>)}</div></div>
    <div className="kb kb-people" style={{ '--cols': PHASES.length } as CSSProperties}>
      <div className="kb-heads">{PHASES.map(p => <div key={p.id} className={`kb-col-head tone-${p.tone}`} title={p.hint}><p.icon size={16} weight="bold" aria-hidden="true" /><strong>{p.title}</strong><span className="kb-count">{people.filter(x => x.phase === p.id).length}</span></div>)}</div>
      <div className="kb-lane kb-flat">{PHASES.map(p => <div key={p.id} data-drop={p.id} className={`kb-cell ${drag?.over === p.id ? (drag.blocked ? 'is-blocked' : 'is-over') : ''}`}>
        {people.filter(x => x.phase === p.id).map(({ s }) => <PersonCard key={s.id} s={s} w={w} drag={dragFor(s, p.id)} />)}
        {!people.some(x => x.phase === p.id) && <p className="kb-empty">Nadie</p>}
      </div>)}</div>
    </div>
    {!ro && <p className="board-foot">Suelta en «En pausa» para pausar, desde «En pausa» para retomar, desde «Sin actividad» a «Activos» para asignarle una, o en «Terminaron» para cerrar su participación. Las demás etapas se calculan solas.</p>}
  </>;
}
function PersonCard({ s, w, drag }: { s: Student; w: Workspace; drag?: DragItem }) {
  const app = useApp();
  const h = studentHealth(w, s); const open = w.assignments.filter(a => a.studentId === s.id && isOpen(a));
  const pause = pauseOf(s, w.user.areaId);
  return <article className={`kb-card kb-person-card ${drag ? 'is-draggable' : ''}`} onPointerDown={drag ? e => { if (!(e.target as HTMLElement).closest('.button, .icon-button, [aria-haspopup]')) beginDrag(drag, e); } : undefined}>
    <button type="button" className="kb-card-main kb-person-main" onClick={() => app.openStudent(s.id)}>
      <StatusAvatar name={s.name} avatar={s.avatar} health={h} />
      <span><strong>{s.name}</strong><small>{pause ? `${PAUSE_LABELS[pause.kind]}${pause.returnAt ? ` · regresa ${formatDate(`${pause.returnAt}T12:00:00-06:00`)}` : ''}` : HEALTH[h].label}</small></span>
    </button>
    <footer className="kb-card-foot">
      <span className="kb-meta"><span><Stack size={13} aria-hidden="true" />{plural(open.length, 'abierta', 'abiertas')}</span>{s.modalities[0] && <span>{s.modalities[0]}</span>}</span>
      {s.endDate && <span className="kb-due"><CalendarBlank size={13} aria-hidden="true" />Termina {formatDate(`${s.endDate}T12:00:00-06:00`)}</span>}
    </footer>
  </article>;
}

/* ---------- Banco de actividades ---------- */

function BankBoard() {
  const app = useApp(); const w = scoped(app.workspace);
  const drag = useDragState();
  const drafts = (app.workspace.drafts ?? []).filter(d => d.areaId === w.user.areaId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const students = w.students.filter(s => s.status === 'active').map(s => ({ s, h: studentHealth(w, s), open: w.assignments.filter(a => a.studentId === s.id && isOpen(a)).length }))
    .sort((a, b) => a.open - b.open || a.s.name.localeCompare(b.s.name));
  const dragFor = (d: ActivityDraft): DragItem => ({ id: d.id, title: d.title, person: 'Banco de actividades', tip: 'Soltar para asignarla', accepts: t => t.startsWith('student|') ? true : 'Suéltala sobre un alumno', drop: t => app.modal({ type: 'assignment', studentId: t.split('|')[1], draft: d }) });
  return <div className="bank">
    <section className="bank-list" aria-labelledby="bank-title">
      <header className="kb-col-head"><Archive size={16} weight="bold" aria-hidden="true" /><strong id="bank-title">Banco de actividades</strong><span className="kb-count">{drafts.length}</span></header>
      <p className="kb-col-hint">Prepáralas una vez y asígnalas a quien le toque. Al asignar puedes conservarlas aquí.</p>
      <Button variant="secondary" className="bank-new" onClick={() => app.modal({ type: 'draft' })}><Plus size={15} weight="bold" />Nueva en el banco</Button>
      {drafts.length ? drafts.map(d => { const skills = d.skillIds.map(id => w.skills.find(s => s.id === id)?.name).filter(Boolean) as string[];
        return <article key={d.id} className="kb-card is-draggable" onPointerDown={e => { if (!(e.target as HTMLElement).closest('.button, .icon-button, [aria-haspopup]')) beginDrag(dragFor(d), e); }}>
          <div className="kb-card-main">
            <span className="kb-tags">{d.phase && <span className="kb-tag is-phase">{d.phase}</span>}{skills.slice(0, 3).map(s => <span key={s} className="kb-tag">{s}</span>)}</span>
            <strong>{d.title}</strong>{d.description && <span className="kb-desc">{d.description}</span>}
          </div>
          <footer className="kb-card-foot"><span className="kb-meta">{d.links.length > 0 && <span><LinkSimple size={13} aria-hidden="true" />{d.links.length}</span>}<span>Actualizada {formatDate(d.updatedAt)}</span></span>
            <Button size="sm" className="kb-card-action" onClick={() => app.modal({ type: 'assignment', draft: d })}>Asignar</Button>
            <Menu label={`Más acciones: ${d.title}`} items={[{ label: 'Editar', icon: <ListChecks size={16} />, onSelect: () => app.modal({ type: 'draft', draft: d }) }, { label: 'Quitar del banco', icon: <Archive size={16} />, danger: true, onSelect: () => app.modal({ type: 'draft', draft: d, remove: true }) }]} />
          </footer>
        </article>; })
        : <Empty compact icon={<Archive size={20} />} title="El banco está vacío" description="Guarda aquí actividades que repites con varios alumnos." />}
    </section>
    <section className="bank-people" aria-labelledby="bank-people-title">
      <header className="kb-col-head"><Users size={16} weight="bold" aria-hidden="true" /><strong id="bank-people-title">Alumnos</strong><span className="kb-count">{students.length}</span></header>
      <p className="kb-col-hint">Primero quienes tienen menos trabajo. Suelta una actividad sobre un alumno para asignársela.</p>
      <div className="bank-grid">{students.map(({ s, h, open }) => <div key={s.id} data-drop={`student|${s.id}`} className={`bank-person ${open === 0 ? 'is-idle' : open > 3 ? 'is-over' : ''} ${drag?.over === `student|${s.id}` ? 'is-over-drop' : ''}`}>
        <StatusAvatar name={s.name} avatar={s.avatar} health={h} />
        <span><strong>{s.name}</strong><small>{open === 0 ? (s.thesis ? `Tesis · ${phaseInfo(s.thesis.phase).short}` : 'Sin actividad') : `${plural(open, 'abierta', 'abiertas')}${open > 3 ? ' · sobrecargado' : ''}`}</small></span>
      </div>)}</div>
    </section>
  </div>;
}

/* ---------- Tesis (Investigación) ---------- */

function ThesisBoard() {
  const app = useApp(); const ro = app.readonly || app.workspace.user.areaId !== 'research';
  const drag = useDragState(); const [query, setQuery] = useState('');
  const q = normalize(query.trim());
  const people = app.workspace.students.filter(s => s.thesis && s.status === 'active' && (!q || normalize(`${s.name} ${s.thesis.topic}`).includes(q)));
  const count = (step: ThesisStep) => people.filter(s => s.thesis!.step === step).length;
  const dragFor = (s: Student): DragItem | undefined => ro ? undefined : {
    id: s.id, title: s.name, person: phaseInfo(s.thesis!.phase).label, avatar: s.avatar, tip: 'Soltar para registrar la llamada',
    accepts: to => to === s.thesis!.phase ? 'Ya está en esta fase' : true,
    // En la llamada, a la siguiente fase se aprueba (o se regresa a diseño); cualquier otro movimiento pide el motivo.
    drop: to => { const t = s.thesis!; const call = t.step === 'call';
      if (call && to === nextPhase(t.phase)) app.modal({ type: 'thesisStep', student: s, action: 'advance' });
      else if (call && to === phaseInfo(t.phase).backTo) app.modal({ type: 'thesisStep', student: s, action: 'back' });
      else app.modal({ type: 'thesisStep', student: s, action: 'moved', to: to as ThesisPhase }); },
  };
  return <>
    <div className="board-tools">
      <Search value={query} onChange={setQuery} placeholder="Buscar tesista o tema" label="Buscar tesista" />
      <a className="board-toggle" href={RESEARCH_DRIVE} target="_blank" rel="noopener noreferrer"><FolderOpen size={15} aria-hidden="true" />Carpeta de tesis en Drive</a>
      <div className="board-summary"><span><strong>{count('review')}</strong> por revisar</span><span><strong>{count('call')}</strong> llamadas pendientes</span><span><strong>{count('kickoff')}</strong> llamadas iniciales</span><span><strong>{count('working')}</strong> trabajando</span></div>
    </div>
    <div className="kb kb-thesis" style={{ '--cols': THESIS_PHASES.length } as CSSProperties}>
      <div className="kb-heads">{THESIS_PHASES.map(p => <div key={p.id} className="kb-col-head tone-info" title={`${p.label} · puntos ${p.points} del flujo`}><span className="th-col-n">{p.n}</span><strong>{p.short}</strong><span className="kb-count">{people.filter(s => s.thesis!.phase === p.id).length}</span></div>)}</div>
      <div className="kb-lane kb-flat">{THESIS_PHASES.map(p => <div key={p.id} data-drop={p.id} className={`kb-cell ${drag?.over === p.id ? (drag.blocked ? 'is-blocked' : 'is-over') : ''}`}>
        {people.filter(s => s.thesis!.phase === p.id).sort((a, b) => STEP_ORDER.indexOf(a.thesis!.step) - STEP_ORDER.indexOf(b.thesis!.step)).map(s => <ThesisCard key={s.id} s={s} drag={dragFor(s)} ro={ro} />)}
        {!people.some(s => s.thesis!.phase === p.id) && <p className="kb-empty">—</p>}
      </div>)}</div>
    </div>
    {!ro && <p className="board-foot">Primero lo que te toca (revisar, llamadas). Arrastra un tesista a otra fase: en la llamada, a la siguiente se aprueba; cualquier otro cambio te pide el motivo y queda en su historial.</p>}
  </>;
}
const STEP_ORDER: ThesisStep[] = ['call', 'review', 'kickoff', 'working', 'done'];
function ThesisCard({ s, drag, ro }: { s: Student; drag?: DragItem; ro: boolean }) {
  const app = useApp(); const t = s.thesis!; const next = thesisNext(t.step); const days = daysInPhase(s);
  return <article className={`kb-card th-card is-${t.step} ${drag ? 'is-draggable' : ''}`} onPointerDown={drag ? e => { if (!(e.target as HTMLElement).closest('.button, .icon-button, [aria-haspopup]')) beginDrag(drag, e); } : undefined}>
    <button type="button" className="kb-card-main kb-person-main" onClick={() => app.openStudent(s.id)}>
      <Avatar name={s.name} avatar={s.avatar} />
      <span><strong>{s.name}</strong><small>{t.topic || 'Sin tema'}</small></span>
    </button>
    <span className={`th-step is-${t.step}`}>{STEP_LABEL[t.step]}</span>
    {t.phase !== 'defense' && t.step !== 'kickoff' && t.step !== 'done' && <ThesisCycle step={t.step} compact />}
    <footer className="kb-card-foot"><span className={`kb-due ${days > 30 && next.who === 'student' ? 'is-warn' : ''}`}><ClockCountdown size={13} aria-hidden="true" />{plural(days, 'día', 'días')} en la fase</span></footer>
    {!ro && next.who === 'you' && <Button size="sm" className="kb-card-action th-card-action" onClick={() => app.modal({ type: 'thesisStep', student: s, action: t.step === 'call' ? 'advance' : next.action! })}>{next.label}</Button>}
  </article>;
}
