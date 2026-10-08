import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowRight, ArrowsLeftRight, CalendarBlank, FlagPennant, CalendarPlus, CaretDown, CaretLeft, CaretRight, CaretUp, CheckCircle, Check, ClockCountdown, FileText, Notepad, Play, Plus, Sparkle, UsersThree, WarningCircle, X } from '@phosphor-icons/react';
import { AREAS, type Assignment, type Meeting, type Review, type Workspace } from '../../shared/types';
import { createPortal } from 'react-dom';
import { useApp } from '../context';
import { capitalize, dateKey, dueText, formatDate, formatTime, isLate, isOpen, isPastUnrecorded, plural, reviewLabels, today, weekDays } from '../lib';
import { Avatar, Button, IconButton, Menu, Segmented } from './ui';
import { beginDrag, DragLayer, useDragState, type DragItem } from './CalendarDrag';
import { MovePicker, type MoveItem } from './MovePicker';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const noonOf = (key: string) => new Date(`${key}T12:00:00-06:00`);
const addDays = (key: string, n: number) => dateKey(new Date(noonOf(key).getTime() + n * 86_400_000));
const longDay = (key: string, options: Intl.DateTimeFormatOptions = {}) => capitalize(formatDate(noonOf(key), { weekday: 'long', month: 'long', ...options })).replace(',', '');
const firstLast = (name = '') => { const [a, b] = name.split(' '); return b ? `${a} ${b[0]}.` : a; };

interface DayInfo { reviews: Review[]; meetings: Meeting[]; dues: Assignment[]; total: number }
const EMPTY: DayInfo = { reviews: [], meetings: [], dues: [], total: 0 };
// Índice por día, construido una vez por espacio de trabajo: el calendario lo consulta en cada día de la cuadrícula.
const indexes = new WeakMap<Workspace, Map<string, DayInfo>>();
function dayIndex(w: Workspace) {
  let index = indexes.get(w);
  if (index) return index;
  index = new Map();
  const at = (key: string) => { let d = index!.get(key); if (!d) { d = { reviews: [], meetings: [], dues: [], total: 0 }; index!.set(key, d); } d.total++; return d; };
  for (const r of w.reviews) if (r.status !== 'cancelled') at(dateKey(r.startsAt)).reviews.push(r);
  for (const m of w.meetings ?? []) if (m.status === 'scheduled') at(dateKey(m.startsAt)).meetings.push(m);
  for (const a of w.assignments) if (isOpen(a) && a.dueAt) at(dateKey(a.dueAt)).dues.push(a);
  for (const d of index.values()) { d.reviews.sort((a, b) => a.startsAt.localeCompare(b.startsAt)); d.meetings.sort((a, b) => a.startsAt.localeCompare(b.startsAt)); }
  indexes.set(w, index);
  return index;
}
/** Lo que pasa en un día: revisiones, reuniones y fechas límite abiertas. */
const dayData = (w: Workspace, key: string): DayInfo => dayIndex(w).get(key) ?? EMPTY;
const reviewState = (r: Review) => r.status === 'completed' ? 'done' : r.status === 'missed' ? 'missed' : isPastUnrecorded(r) ? 'due' : 'scheduled';
const reviewName = (r: Review) => `Revisión de ${reviewLabels[r.type].toLowerCase()}`;

interface Props { w: Workspace; selected: string | null; onSelect: (key: string | null) => void; byArea?: boolean; detail?: boolean }

/** Calendario de mes y semana. Con `detail` (Hoy del responsable): vista previa al pasar el cursor, detalle del día,
 *  selección de varios días con resumen y arrastrar pendientes o eventos a otro día. `byArea`: el jefe ve el color del área. */
export default function Calendar({ w, selected, onSelect, byArea = false, detail = false }: Props) {
  const app = useApp(); const canWrite = detail && !app.readonly;
  const [cursor, setCursor] = useState(() => noonOf(selected ?? today()));
  const [view, setView] = useState<'month' | 'week'>(() => window.matchMedia('(max-width: 720px)').matches ? 'week' : 'month');
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [open, setOpen] = useState(true);
  const [hover, setHover] = useState<{ key: string; left: number; top: number; flip: boolean; below: boolean } | null>(null);
  const shell = useRef<HTMLElement>(null); const hoverTimer = useRef(0); const anchor = useRef<string | null>(null); const painting = useRef(false);
  const drag = useDragState();
  useEffect(() => { if (!selected) return; setOpen(true); setRange(null); if (selected.slice(0, 7) !== dateKey(cursor).slice(0, 7)) setCursor(noonOf(selected)); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => {
    if (view === 'week') return weekDays(cursor);
    const [year, month] = dateKey(cursor).split('-').map(Number);
    const first = noonOf(`${year}-${String(month).padStart(2, '0')}-01`);
    const offset = (first.getUTCDay() + 6) % 7;
    const count = Math.ceil((new Date(Date.UTC(year, month, 0)).getUTCDate() + offset) / 7) * 7;
    return Array.from({ length: count }, (_, i) => new Date(first.getTime() + (i - offset) * 86_400_000));
  }, [cursor, view]);
  const month = dateKey(cursor).slice(0, 7);
  const title = view === 'month'
    ? capitalize(formatDate(cursor, { day: undefined, month: 'long', year: 'numeric' }))
    : `${formatDate(days[0])} al ${formatDate(days[6], { year: 'numeric' })}`;
  function move(by: number) { const next = new Date(cursor); if (view === 'month') next.setUTCMonth(next.getUTCMonth() + by, 1); else next.setUTCDate(next.getUTCDate() + by * 7); setCursor(next); setHover(null); }
  function goToday() { setCursor(noonOf(today())); setRange(null); onSelect(today()); setOpen(true); }
  const inRange = (key: string) => !!range && key >= range.from && key <= range.to;
  const multi = !!range && range.from !== range.to;

  // Elegir un día; Mayús + clic o arrastrar sobre varios días selecciona un rango.
  function choose(key: string, shift: boolean) {
    setHover(null);
    if (detail && shift && selected) { const [a, b] = [selected, key].sort(); setRange({ from: a, to: b }); setOpen(true); return; }
    setRange(null);
    if (detail && selected === key && open) { onSelect(null); return; }
    onSelect(key); setOpen(true);
  }
  function down(key: string, e: ReactPointerEvent) { if (!detail || e.button !== 0 || e.shiftKey || drag) return; anchor.current = key; painting.current = false; }
  function enter(key: string, e: ReactPointerEvent<HTMLElement>) {
    if (detail && anchor.current && e.buttons === 1 && key !== anchor.current) { painting.current = true; const [a, b] = [anchor.current, key].sort(); setRange({ from: a, to: b }); setHover(null); return; }
    if (!detail || view === 'week' || drag || e.pointerType !== 'mouse' || !matchMedia('(hover: hover) and (pointer: fine)').matches || dayData(w, key).total === 0) return;
    const el = e.currentTarget; window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      // Coordenadas de pantalla: la vista previa flota sobre todo y no la recorta ningún panel.
      const box = shell.current!.getBoundingClientRect(); const r = el.getBoundingClientRect();
      setHover({ key, left: r.left + r.width / 2, top: r.top, flip: r.left + r.width / 2 + 330 > box.right, below: r.top < 280 });
    }, 120);
  }
  // Al salir del día la vista previa se quita al instante.
  function leave() { window.clearTimeout(hoverTimer.current); setHover(null); }
  useEffect(() => {
    const up = () => { if (painting.current) { painting.current = false; anchor.current = null; const stop = (c: Event) => { c.stopPropagation(); c.preventDefault(); }; window.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0); } else anchor.current = null; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setRange(null); setHover(null); } };
    const scroll = () => setHover(null);
    window.addEventListener('pointerup', up); window.addEventListener('keydown', esc); window.addEventListener('scroll', scroll, true);
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('keydown', esc); window.removeEventListener('scroll', scroll, true); window.clearTimeout(hoverTimer.current); };
  }, []);

  const nameOf = (id: string) => w.students.find(s => s.id === id);
  const reviewDrag = (r: Review): DragItem => ({ id: r.id, title: reviewName(r), person: nameOf(r.studentId)?.name ?? 'Alumno', avatar: nameOf(r.studentId)?.avatar, drop: day => app.modal({ type: 'reviewUpdate', review: r, mode: 'reschedule', date: day }) });
  const dueDrag = (a: Assignment): DragItem => ({ id: a.id, title: a.title, person: nameOf(a.studentId)?.name ?? 'Alumno', avatar: nameOf(a.studentId)?.avatar, drop: day => app.modal({ type: 'assignmentEdit', assignment: a, mode: 'edit', dueDate: day }) });

  return <section ref={shell} className={`cal ${detail ? 'cal-live' : ''}`} aria-label="Calendario">
    <div className="cal-card">
      <CalWaves />
      <div className="cal-toolbar">
        <div className="cal-nav">
          <IconButton className="cal-arrow" label="Periodo anterior" onClick={() => move(-1)}><CaretLeft size={18} /></IconButton>
          <IconButton className="cal-arrow" label="Periodo siguiente" onClick={() => move(1)}><CaretRight size={18} /></IconButton>
        </div>
        <h2 key={title} className="cal-title" aria-live="polite">{title}</h2>
        <Segmented label="Vista del calendario" className="cal-views" value={view} onChange={v => { setView(v); setHover(null); }} options={[{ value: 'month', label: 'Mes' }, { value: 'week', label: 'Semana' }]} />
        <Button variant="secondary" className="cal-today-button" onClick={goToday}>Hoy</Button>
      </div>
      {view === 'month' && <div className="cal-weekdays" aria-hidden="true">{WEEKDAYS.map(d => <span key={d}>{d}</span>)}</div>}
      <div className={`cal-grid cal-${view} ${drag ? 'is-drop-zone' : ''}`}>
        {days.map((day, i) => {
          const key = dateKey(day); const { reviews, dues, meetings } = dayData(w, key);
          const outside = view === 'month' && key.slice(0, 7) !== month;
          const late = dues.some(a => isLate(a, w));
          const state = [outside && 'is-outside', key === today() && 'is-today', selected === key && open && !multi && 'is-selected', inRange(key) && multi && 'is-ranged', key < today() && 'is-past', drag?.over === key && (drag.blocked ? 'is-drop-blocked' : 'is-drop-target'), hover?.key === key && 'is-hovered'].filter(Boolean).join(' ');
          const label = `${longDay(key)}: ${reviews.length ? plural(reviews.length, 'revisión', 'revisiones') : 'sin revisiones'}${meetings.length ? `, ${plural(meetings.length, 'reunión', 'reuniones')}` : ''}${dues.length ? `, ${plural(dues.length, 'entrega', 'entregas')}` : ''}`;
          if (view === 'week') return <div key={key} data-day={key} className={`cal-day cal-col ${state}`} style={{ '--i': i } as CSSProperties} onPointerEnter={e => enter(key, e)} onPointerDown={e => down(key, e)}>
            <button type="button" className="cal-col-head" aria-pressed={selected === key} aria-label={label} onClick={e => choose(key, e.shiftKey)}>
              <span className="cal-number">{day.getUTCDate()}</span><span className="cal-wd">{WEEKDAYS[i]}</span>
              <Dots reviews={reviews} dues={dues} meetings={meetings} byArea={byArea} late={late} max={4} />
            </button>
            <WeekEvents w={w} dayKey={key} reviews={reviews} dues={dues} meetings={meetings} byArea={byArea} canDrag={canWrite} reviewDrag={reviewDrag} dueDrag={dueDrag} onMore={() => choose(key, false)} />
          </div>;
          return <button type="button" key={key} data-day={key} onClick={e => choose(key, e.shiftKey)} aria-pressed={selected === key} aria-label={label}
            className={`cal-day ${state}`} style={{ '--i': i } as CSSProperties} onPointerEnter={e => enter(key, e)} onPointerLeave={leave} onPointerDown={e => down(key, e)}>
            <span className="cal-number">{day.getUTCDate()}</span>
            <Dots reviews={reviews} dues={dues} meetings={meetings} byArea={byArea} late={late} max={3} />
          </button>;
        })}
      </div>
      <div className="cal-legend" aria-label="Leyenda">
        {byArea ? AREAS.map(a => <span key={a.id}><i className={`cal-key is-area-${a.id}`} />{a.name}</span>)
          : <><span><i className="cal-key" />Programada</span><span><i className="cal-key is-due" />Sin registrar</span><span><i className="cal-key is-done" />Realizada</span></>}
        <span><i className="cal-key is-meeting" />Reunión</span>
        <span><i className="cal-key is-flag" />Fecha límite</span>
        {detail && <span className="cal-legend-days"><span><i className="cal-swatch is-today" />Hoy</span><span><i className="cal-swatch is-picked" />Día elegido</span></span>}
        {detail && (selected || multi) && <IconButton className="cal-collapse" label={open ? 'Ocultar detalle' : 'Mostrar detalle'} aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? <CaretUp size={15} weight="bold" /> : <CaretDown size={15} weight="bold" />}</IconButton>}
      </div>
      {hover && <DayPeek w={w} dayKey={hover.key} pos={hover} />}
    </div>
    {detail && open && (multi ? <RangeSummary key={`${range!.from}${range!.to}`} w={w} from={range!.from} to={range!.to} onClear={() => setRange(null)} />
      : selected && <DayDetail key={selected} w={w} dayKey={selected} reviewDrag={reviewDrag} dueDrag={dueDrag} onClose={() => onSelect(null)} />)}
    {detail && <DragLayer />}
  </section>;
}

function Dots({ reviews, dues, meetings, byArea, late, max }: { reviews: Review[]; dues: Assignment[]; meetings: Meeting[]; byArea: boolean; late: boolean; max: number }) {
  if (!reviews.length && !dues.length && !meetings.length) return <span className="cal-dots" aria-hidden="true" />;
  return <span className="cal-dots" aria-hidden="true">
    {meetings.slice(0, 2).map(m => <i key={m.id} className="is-meeting" />)}
    {reviews.slice(0, max).map(r => <i key={r.id} className={byArea ? `is-area-${r.areaId}` : { done: 'is-done', missed: 'is-done', due: 'is-due', scheduled: '' }[reviewState(r)]} />)}
    {dues.length > 0 && <i className={`is-flag ${late ? 'is-late' : ''}`} />}
  </span>;
}

/** Semana: cada día es una columna con sus eventos; los primeros dos y un enlace al resto. */
function WeekEvents({ w, dayKey, reviews, dues, meetings, byArea, canDrag, reviewDrag, dueDrag, onMore }: { w: Workspace; dayKey: string; reviews: Review[]; dues: Assignment[]; meetings: Meeting[]; byArea: boolean; canDrag: boolean; reviewDrag: (r: Review) => DragItem; dueDrag: (a: Assignment) => DragItem; onMore: () => void }) {
  const app = useApp();
  const items = [
    ...meetings.map(m => ({ at: m.startsAt, node: <li key={m.id} className="wk-event wk-meeting"><i className="wk-dot is-meeting" /><span className="wk-time">{formatTime(m.startsAt)}</span><span className="wk-name">{m.title}</span></li> })),
    ...reviews.map(r => { const st = w.students.find(s => s.id === r.studentId); const s = reviewState(r);
      return { at: r.startsAt, node: <li key={r.id} className={`wk-event is-${s} ${byArea ? `is-area-${r.areaId}` : ''}`}>
        <button type="button" onClick={() => r.assignmentId ? app.openAssignment(r.assignmentId) : app.openStudent(r.studentId)} onPointerDown={canDrag && s === 'scheduled' ? e => beginDrag(reviewDrag(r), e) : undefined}>
          <i className="wk-dot" /><span className="wk-time">{formatTime(r.startsAt)}</span><span className="wk-name">{reviewName(r)}</span>
          <span className="wk-person"><UsersThree size={12} aria-hidden="true" />{firstLast(st?.name)}</span>
        </button>
      </li> }; }),
    ...dues.map(a => { const late = isLate(a, w); return { at: `${dateKey(a.dueAt!)}T23:59`, node: <li key={a.id} className={`wk-event wk-due ${late ? 'is-late' : ''}`}>
      <button type="button" onClick={() => app.openAssignment(a.id)} onPointerDown={canDrag ? e => beginDrag(dueDrag(a), e) : undefined}>
        <WarningCircle size={15} weight="fill" className="wk-due-icon" aria-hidden="true" /><span className="wk-name"><strong>Entregar</strong> {a.title}</span>
        <span className="wk-when">{dayKey === today() ? 'Vence hoy' : late ? 'Venció' : `Vence ${formatTime(a.dueAt!)}`}</span>
      </button>
    </li> }; }),
  ].sort((x, y) => x.at.localeCompare(y.at));
  if (!items.length) return <p className="wk-empty">Sin eventos</p>;
  return <>
    <ul className="wk-events">{items.slice(0, 2).map(i => i.node)}</ul>
    {items.length > 2 && <button type="button" className="wk-more" onClick={onMore}><Plus size={12} weight="bold" aria-hidden="true" />{items.length - 2} más</button>}
  </>;
}

/** Vista previa al pasar el cursor: cuántas revisiones y vencimientos hay y quiénes. Solo con ratón; el clic abre lo mismo completo. */
function DayPeek({ w, dayKey, pos }: { w: Workspace; dayKey: string; pos: { left: number; top: number; flip: boolean; below: boolean } }) {
  const { reviews, dues, meetings } = dayData(w, dayKey);
  const rows = [
    ...reviews.map(r => { const st = w.students.find(s => s.id === r.studentId); const a = w.assignments.find(x => x.id === r.assignmentId); const s = reviewState(r);
      return { id: r.id, st, title: a?.title ?? reviewName(r), tag: s === 'due' ? 'Revisión sin registrar' : s === 'done' ? 'Revisión realizada' : 'Revisión', tone: s === 'due' ? 'warn' : s === 'done' ? 'ok' : 'info' }; }),
    ...dues.map(a => { const st = w.students.find(s => s.id === a.studentId); return { id: a.id, st, title: a.title, tag: isLate(a, w) ? 'Venció' : 'Fecha límite', tone: 'warn' }; }),
  ];
  // Solo informa: no recibe el cursor, así que desaparece en cuanto el puntero sale del día. El clic abre el detalle completo.
  return createPortal(<div className={`peek ${pos.flip ? 'is-flip' : ''} ${pos.below ? 'is-below' : ''}`} style={{ left: pos.left, top: pos.top }} aria-hidden="true">
    <div className="peek-head">
      <strong>{capitalize(formatDate(noonOf(dayKey), { weekday: 'short', month: 'long' })).replace(/.?,/, '')}</strong>
      <span className="peek-hint">Clic para abrir</span>
    </div>
    <div className="peek-chips">
      {reviews.length > 0 && <span className="peek-chip tone-info"><Notepad size={15} />{plural(reviews.length, 'revisión', 'revisiones')}</span>}
      {dues.length > 0 && <span className="peek-chip tone-warn"><ClockCountdown size={15} />{plural(dues.length, 'vencimiento', 'vencimientos')}</span>}
      {meetings.length > 0 && <span className="peek-chip tone-neutral"><UsersThree size={15} />{plural(meetings.length, 'reunión', 'reuniones')}</span>}
    </div>
    {rows.length > 0 && <ul className="peek-list">{rows.slice(0, 3).map(r => <li key={r.id}>
      <Avatar name={r.st?.name ?? 'Alumno'} avatar={r.st?.avatar} size="md" />
      <span><strong>{r.title}</strong><small>{r.st?.name ?? 'Alumno'} · <em className={`tone-${r.tone}`}>{r.tag}</em></small></span>
    </li>)}</ul>}
    {rows.length > 3 && <p className="peek-more">y {rows.length - 3} más</p>}
  </div>, document.body);
}

/** Detalle del día elegido, debajo del calendario: horario, a quién le toca y la acción de cada cosa. */
function DayDetail({ w, dayKey, reviewDrag, dueDrag, onClose }: { w: Workspace; dayKey: string; reviewDrag: (r: Review) => DragItem; dueDrag: (a: Assignment) => DragItem; onClose: () => void }) {
  const app = useApp(); const ro = app.readonly;
  const { reviews, dues, meetings, total } = dayData(w, dayKey);
  const future = dayKey >= today();
  const heading = capitalize(formatDate(noonOf(dayKey), { weekday: 'short', month: 'long' })).replace('.', '');
  if (!total) return <EmptyDay w={w} dayKey={dayKey} future={future} onClose={onClose} />;
  const st = (id: string) => w.students.find(s => s.id === id);
  type Row = { id: string; at: string; allDay?: boolean; time: string; sub?: string; dot: string; icon: 'review' | 'due' | 'meeting'; title: string; person: string; tag: string; tone: string; action?: ReactNode; menu?: { label: string; onSelect: () => void }[]; drag?: DragItem; open?: () => void; done?: boolean };
  const rows: Row[] = [
    ...reviews.map(r => { const s = reviewState(r); const a = w.assignments.find(x => x.id === r.assignmentId); const isToday = dayKey === today();
      return { id: r.id, at: r.startsAt, time: formatTime(r.startsAt), sub: r.durationMinutes >= 60 ? `${r.durationMinutes / 60} h` : `${r.durationMinutes} min`, dot: s, icon: 'review' as const, title: reviewName(r), person: `${st(r.studentId)?.name ?? 'Alumno'} · ${a?.title ?? 'Seguimiento general'}`,
        tag: { scheduled: 'Programada', due: 'Sin registrar', done: 'Realizada', missed: 'No se realizó' }[s], tone: { scheduled: 'neutral', due: 'warn', done: 'ok', missed: 'neutral' }[s], done: s === 'done',
        // Azul solo para lo que toca hacer ya; lo que aún no llega va en botón secundario del mismo tamaño.
        action: ro ? undefined : s === 'due' || (s === 'scheduled' && isToday) ? <Button size="sm" className="dd-btn" onClick={() => app.modal({ type: 'reviewUpdate', review: r, mode: 'record', early: Date.parse(r.startsAt) > Date.now() })}>Registrar revisión</Button>
          // Día futuro: si el alumno se adelantó, se registra ya; reprogramar queda en el menú.
          : s === 'scheduled' ? <Button size="sm" variant="secondary" className="dd-btn" title="El alumno se adelantó: registra la revisión ahora" onClick={() => app.modal({ type: 'reviewUpdate', review: r, mode: 'record', early: true })}>Registrar ahora</Button>
          : s === 'done' ? <span className="dd-done dd-btn"><CheckCircle size={16} weight="fill" />Realizada</span> : undefined,
        menu: ro || s === 'done' || s === 'missed' ? undefined : [{ label: 'Reprogramar', onSelect: () => app.modal({ type: 'reviewUpdate', review: r, mode: 'reschedule' }) }, { label: 'Cancelar revisión', onSelect: () => app.modal({ type: 'reviewUpdate', review: r, mode: 'cancel' }) }],
        drag: !ro && s === 'scheduled' ? reviewDrag(r) : undefined, open: () => a ? app.openAssignment(a.id) : app.openStudent(r.studentId) }; }),
    ...meetings.map(m => ({ id: m.id, at: m.startsAt, time: formatTime(m.startsAt), sub: `${m.durationMinutes} min`, dot: 'meeting', icon: 'meeting' as const, title: m.title, person: `Reunión${ro ? '' : ` con ${m.organizerName}`}${m.place ? ` · ${m.place}` : ''}`, tag: 'Reunión', tone: 'ink' })),
    ...dues.map(a => { const late = isLate(a, w);
      return { id: a.id, at: '', allDay: true, time: 'Todo el día', dot: 'flag', icon: 'due' as const, title: a.title, person: `${st(a.studentId)?.name ?? 'Alumno'} · ${dueText(a)}`, tag: late ? 'Venció' : dayKey === today() ? 'Vence hoy' : 'Fecha límite', tone: 'warn',
        action: ro ? undefined : <Button size="sm" variant={late || dayKey <= today() ? 'primary' : 'secondary'} className="dd-btn" onClick={() => app.modal({ type: 'delivery', assignment: a })}>Registrar entrega</Button>,
        menu: ro ? undefined : [{ label: 'Cambiar fecha', onSelect: () => app.modal({ type: 'assignmentEdit', assignment: a, mode: 'edit' }) }, { label: 'Programar revisión', onSelect: () => app.modal({ type: 'review', studentId: a.studentId, assignmentId: a.id, date: future ? dayKey : undefined }) }, a.blockedReason ? { label: 'Resolver impedimento', onSelect: () => app.modal({ type: 'block', assignment: a, mode: 'resolve' }) } : { label: 'Marcar impedimento', onSelect: () => app.modal({ type: 'block', assignment: a, mode: 'mark' }) }],
        drag: ro ? undefined : dueDrag(a), open: () => app.openAssignment(a.id) }; }),
  ];
  // Primero lo que tiene hora, en orden de hora; las fechas límite (todo el día) van aparte, al final.
  const timed = rows.filter(r => !r.allDay).sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
  const allDay = rows.filter(r => r.allDay);
  const renderRow = (r: Row, i: number) => <li key={r.id} className={`dd-row is-${r.dot}`} style={{ '--i': i } as CSSProperties}>
      <span className="dd-when"><strong>{r.time}</strong>{r.sub && <small>{r.sub}</small>}</span>
      <span className="dd-dot" aria-hidden="true" />
      <div className={`dd-card ${r.drag ? 'is-draggable' : ''}`} onPointerDown={r.drag ? e => { if (!(e.target as HTMLElement).closest('.dd-actions')) beginDrag(r.drag!, e); } : undefined}>
        <span className={`dd-icon is-${r.icon}`} aria-hidden="true">{r.icon === 'review' ? <Notepad size={18} /> : r.icon === 'due' ? <FileText size={18} /> : <UsersThree size={18} />}</span>
        {r.open ? <button type="button" className="dd-text" onClick={r.open}><strong>{r.title}</strong><small>{r.person}</small></button> : <span className="dd-text"><strong>{r.title}</strong><small>{r.person}</small></span>}
        <span className={`dd-tag tone-${r.tone}`}>{r.tag}</span>
        <span className="dd-actions">{r.action ?? <span className="dd-btn" />}{r.menu ? <Menu label={`Más acciones: ${r.title}`} items={r.menu} /> : <span className="dd-menu-space" />}</span>
      </div>
    </li>;
  return <section className="cal-panel dd" aria-labelledby="dd-title">
    <header className="dd-head">
      <h3 id="dd-title">{heading}</h3>
      <span className="dd-count">{plural(total, 'actividad', 'actividades')}</span>
      {!ro && <Button variant="secondary" className="dd-add" onClick={() => app.modal({ type: 'assignment', dueDate: future ? dayKey : undefined })}><Plus size={16} weight="bold" />Agregar actividad</Button>}
      {ro && future && <Button className="dd-add" onClick={() => app.modal({ type: 'meeting', date: dayKey })}><CalendarPlus size={16} weight="bold" />Agendar reunión</Button>}
      <Menu label="Más acciones del día" items={[
        ...(!ro && future ? [{ label: 'Programar revisión en este día', icon: <CalendarPlus size={16} />, onSelect: () => app.modal({ type: 'review', date: dayKey }) }] : []),
      ]} />
      <IconButton className="dd-close" label="Cerrar detalle del día" onClick={onClose}><X size={18} /></IconButton>
    </header>
    {timed.length > 0 && <ol className="dd-rows">{timed.map(renderRow)}</ol>}
    {allDay.length > 0 && <>
      <h4 className="dd-sub"><FlagPennant size={13} weight="fill" aria-hidden="true" />Fechas límite de este día<span className="count">{allDay.length}</span></h4>
      <ol className="dd-rows dd-rows-allday">{allDay.map((r, i) => renderRow(r, timed.length + i))}</ol>
    </>}
  </section>;
}

/** Día sin nada: se ofrece qué hacer con él. «Mover actividad aquí» lista lo que se puede traer. */
function EmptyDay({ w, dayKey, future, onClose }: { w: Workspace; dayKey: string; future: boolean; onClose: () => void }) {
  const app = useApp(); const ro = app.readonly;
  const person = (id: string) => w.students.find(s => s.id === id);
  // Lo que se puede traer: revisiones por venir (o sin registrar) y fechas límite abiertas de otros días, lo más próximo primero.
  const movable: MoveItem[] = [
    ...w.reviews.filter(r => r.status === 'scheduled' && dateKey(r.startsAt) !== dayKey).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(r => ({ id: r.id, kind: 'review' as const, person: person(r.studentId)?.name ?? 'Alumno', avatar: person(r.studentId)?.avatar, title: w.assignments.find(a => a.id === r.assignmentId)?.title ?? reviewName(r), at: r.startsAt, late: isPastUnrecorded(r), onSelect: () => app.modal({ type: 'reviewUpdate', review: r, mode: 'reschedule', date: dayKey }) })),
    ...w.assignments.filter(a => isOpen(a) && a.dueAt && dateKey(a.dueAt) !== dayKey).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!)).map(a => ({ id: a.id, kind: 'due' as const, person: person(a.studentId)?.name ?? 'Alumno', avatar: person(a.studentId)?.avatar, title: a.title, at: a.dueAt!, late: isLate(a, w), onSelect: () => app.modal({ type: 'assignmentEdit', assignment: a, mode: 'edit', dueDate: dayKey }) })),
  ];
  return <section className="cal-panel empty-day" aria-labelledby="ed-title">
    <span className="ed-art" aria-hidden="true"><CalendarBlank size={34} weight="duotone" /><span className="ed-plus"><Plus size={14} weight="bold" /></span><Sparkle size={14} weight="fill" className="ed-spark ed-spark-1" /><Sparkle size={10} weight="fill" className="ed-spark ed-spark-2" /></span>
    <div className="ed-text">
      <small>{longDay(dayKey, { year: 'numeric' })}</small>
      <h3 id="ed-title">{future ? 'No hay revisiones ni pendientes' : 'No hubo revisiones ni pendientes'}</h3>
      <p>{!future ? 'Este día ya pasó sin citas ni entregas.' : ro ? 'Este día está libre.' : 'Este día está libre. Aprovecha para programar una revisión, crear una tarea o mover alguna actividad aquí.'}</p>
    </div>
    <div className="ed-actions">
      {!ro && future && <>
        <Button size="lg" onClick={() => app.modal({ type: 'review', date: dayKey })}><CalendarPlus size={17} />Programar revisión</Button>
        <Button size="lg" variant="secondary" onClick={() => app.modal({ type: 'assignment', dueDate: dayKey })}><FileText size={17} />Agregar tarea</Button>
        {movable.length > 0 && <MovePicker items={movable} target={dayKey} title={`Traer al ${formatDate(noonOf(dayKey), { weekday: 'long', month: 'long' })}`} trigger={<button type="button" className="button button-secondary button-lg"><ArrowsLeftRight size={17} />Mover actividad aquí</button>} />}
      </>}
      {ro && future && <Button size="lg" onClick={() => app.modal({ type: 'meeting', date: dayKey })}><CalendarPlus size={17} />Agendar reunión</Button>}
      {!future && <Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    </div>
  </section>;
}

/** Resumen de varios días seleccionados: cuántas revisiones, qué requiere atención y qué ya se hizo. */
function RangeSummary({ w, from, to, onClear }: { w: Workspace; from: string; to: string; onClear: () => void }) {
  const app = useApp(); const ro = app.readonly;
  const keys: string[] = []; for (let k = from; k <= to; k = addDays(k, 1)) keys.push(k);
  const data = keys.map(k => dayData(w, k));
  const reviews = data.flatMap(d => d.reviews); const dues = data.flatMap(d => d.dues);
  const attention = reviews.filter(r => reviewState(r) === 'due').length + dues.filter(a => isLate(a, w)).length;
  const done = reviews.filter(r => r.status === 'completed').length;
  const movable = reviews.filter(r => reviewState(r) === 'scheduled');
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const label = sameMonth ? `${Number(from.slice(8))} – ${formatDate(noonOf(to), { month: 'long', year: 'numeric' })}` : `${formatDate(noonOf(from), { month: 'long' })} – ${formatDate(noonOf(to), { month: 'long', year: 'numeric' })}`;
  const wd = (k: string) => formatDate(noonOf(k), { weekday: 'long', day: undefined, month: undefined });
  const oneWeek = keys.length <= 7 && weekDays(noonOf(from)).some(d => dateKey(d) === to);
  const firstOpen = keys.find(k => k >= today());
  return <section className="cal-panel range" aria-labelledby="range-title">
    <span className="range-art" aria-hidden="true"><CalendarPlus size={24} /></span>
    <div className="range-text">
      <h3 id="range-title">{label.replace(/ de (\d{4})$/, ' de $1')}</h3>
      <p>{keys.length} días seleccionados ({wd(from)} a {wd(to)})</p>
    </div>
    <dl className="range-stats">
      <div className="tone-info"><dt><FileText size={20} weight="fill" aria-hidden="true" /></dt><dd><strong>{reviews.length}</strong><span>Revisiones<small>en este rango</small></span></dd></div>
      <div className="tone-warn"><dt><ClockCountdown size={20} weight="fill" aria-hidden="true" /></dt><dd><strong>{attention}</strong><span className="is-tone">Pendientes<small>requieren atención</small></span></dd></div>
      <div className="tone-ok"><dt><CheckCircle size={20} weight="fill" aria-hidden="true" /></dt><dd><strong>{done}</strong><span className="is-tone">Completadas<small>ya realizadas</small></span></dd></div>
    </dl>
    <div className="range-actions">
      {!ro && firstOpen && <Button onClick={() => app.modal({ type: 'review', date: firstOpen })}>{oneWeek ? 'Programar para esta semana' : 'Programar en estos días'}<ArrowRight size={16} weight="bold" /></Button>}
      {!ro && movable.length > 0 && <MovePicker title="¿Qué revisión quieres mover?" items={movable.map(r => ({ id: r.id, kind: 'review' as const, person: w.students.find(s => s.id === r.studentId)?.name ?? 'Alumno', avatar: w.students.find(s => s.id === r.studentId)?.avatar, title: w.assignments.find(a => a.id === r.assignmentId)?.title ?? reviewName(r), at: r.startsAt, onSelect: () => app.modal({ type: 'reviewUpdate', review: r, mode: 'reschedule' }) }))}
        trigger={<button type="button" className="button button-secondary button-md range-move"><ArrowsLeftRight size={15} />Mover {plural(movable.length, 'revisión', 'revisiones')}<CaretDown size={13} weight="bold" /></button>} />}
      <IconButton className="range-clear" label="Quitar selección" onClick={onClear}><X size={16} /></IconButton>
    </div>
  </section>;
}

/** Ondas de luz del fondo del calendario: decorativas y en movimiento lento. */
function CalWaves() {
  return <svg className="cal-waves" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="wave-a" x1="0" x2="1"><stop offset="0" stopColor="#3d7bff" stopOpacity="0" /><stop offset=".55" stopColor="#5b95ff" stopOpacity=".55" /><stop offset="1" stopColor="#9cc0ff" stopOpacity="0" /></linearGradient>
      <linearGradient id="wave-b" x1="0" x2="1"><stop offset="0" stopColor="#2a5cff" stopOpacity="0" /><stop offset=".6" stopColor="#3f7dff" stopOpacity=".35" /><stop offset="1" stopColor="#2a5cff" stopOpacity="0" /></linearGradient>
    </defs>
    <path className="wave wave-1" d="M380 40 C 560 120, 700 -10, 880 70 S 1080 150, 1200 60" stroke="url(#wave-a)" />
    <path className="wave wave-2" d="M420 10 C 600 90, 760 30, 900 110 S 1060 170, 1200 120" stroke="url(#wave-b)" />
    <path className="wave wave-3" d="M300 150 C 520 60, 700 190, 900 90 S 1100 40, 1200 80" stroke="url(#wave-b)" />
  </svg>;
}
