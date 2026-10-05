import { useMemo, useState } from 'react';
import { CaretLeft, CaretRight, Plus, WarningCircle, FlagPennant, CalendarPlus } from '@phosphor-icons/react';
import { AREAS, type AreaId } from '../../shared/types';
import { useApp } from '../context';
import { activitySteps, dueText, isLate, isOpen, capitalize, dateKey, formatDate, formatTime, isPastUnrecorded, meetingsOn, plural, reviewsOn, scoped, startOfToday, today, weekDays } from '../lib';
import { Avatar, Button, Empty, IconButton, Notice, PageHeader, Segmented, Select, Steps } from '../components/ui';
import ReviewCard from '../components/ReviewCard';
import MeetingCard from '../components/MeetingCard';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const noonOf = (key: string) => new Date(`${key}T12:00:00-06:00`);

export default function Agenda() {
  const app = useApp();
  const [area, setArea] = useState<AreaId | 'all'>((app.params.get('area') as AreaId) ?? 'all');
  const w = scoped(app.workspace, area);
  const [cursor, setCursor] = useState(() => noonOf(today()));
  const [selected, setSelected] = useState(today());
  const [view, setView] = useState<'month' | 'week'>(() => window.matchMedia('(max-width: 720px)').matches ? 'week' : 'month');
  const backlog = w.reviews.filter(r => r.status === 'scheduled' && Date.parse(r.startsAt) < startOfToday()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const days = useMemo(() => {
    if (view === 'week') return weekDays(cursor);
    const key = dateKey(cursor); const [year, month] = key.split('-').map(Number);
    const first = noonOf(`${year}-${String(month).padStart(2, '0')}-01`);
    const offset = (first.getUTCDay() + 6) % 7;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const count = Math.ceil((lastDay + offset) / 7) * 7;
    return Array.from({ length: count }, (_, i) => new Date(first.getTime() + (i - offset) * 86_400_000));
  }, [cursor, view]);
  const month = dateKey(cursor).slice(0, 7);
  const title = view === 'month'
    ? capitalize(formatDate(cursor, { day: undefined, month: 'long', year: 'numeric' }))
    : `${formatDate(days[0])} al ${formatDate(days[6], { year: 'numeric' })}`;
  function move(by: number) { const next = new Date(cursor); if (view === 'month') next.setUTCMonth(next.getUTCMonth() + by, 1); else next.setUTCDate(next.getUTCDate() + by * 7); setCursor(next); }
  function goTo(key: string) { setCursor(noonOf(key)); setSelected(key); }
  // Integración: la agenda muestra también las fechas límite de entrega, no solo las revisiones.
  const dueOn = (key: string) => w.assignments.filter(a => isOpen(a) && a.dueAt && dateKey(a.dueAt) === key);
  const delivered = (id: string) => w.deliveries.some(d => d.assignmentId === id && d.completeness === 'complete');
  const selectedReviews = reviewsOn(w, selected); const selectedMeetings = meetingsOn(w, selected);
  const selectedDue = dueOn(selected);
  const weekCount = weekDays(noonOf(today())).reduce((n, d) => n + reviewsOn(w, dateKey(d)).length, 0);
  const isDirector = app.readonly;

  return <>
    <PageHeader title="Agenda" subtitle={weekCount ? `${plural(weekCount, 'revisión', 'revisiones')} esta semana` : 'Sin revisiones esta semana'} actions={isDirector
      ? <><Select label="Área" value={area} onChange={v => setArea(v as AreaId | 'all')}><option value="all">Todas las áreas</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select><Button onClick={() => app.modal({ type: 'meeting', date: selected >= today() ? selected : undefined, areaIds: area === 'all' ? undefined : [area] })}><CalendarPlus size={16} weight="bold" />Agendar reunión</Button></>
      : <Button onClick={() => app.modal({ type: 'review', date: selected >= today() ? selected : today() })}><Plus size={16} weight="bold" />Programar revisión</Button>} />
    {backlog.length > 0 && <Notice tone="warn" icon={<WarningCircle size={18} weight="fill" />}>
      <p>{backlog.length === 1 ? 'Hay 1 revisión pasada sin registrar' : `Hay ${backlog.length} revisiones pasadas sin registrar`}{isDirector ? '.' : '. Registra si se realizó para mantener el historial al día.'}</p>
      <button type="button" className="text-link" onClick={() => goTo(dateKey(backlog[0].startsAt))}>Ir a la más antigua</button>
    </Notice>}
    <div className="agenda-layout">
      <section className="calendar" aria-label="Calendario">
        <div className="calendar-toolbar">
          <h2 className="calendar-title" aria-live="polite">{title}</h2>
          <div className="calendar-nav">
            <IconButton label="Periodo anterior" onClick={() => move(-1)}><CaretLeft size={16} /></IconButton>
            <Button variant="secondary" size="sm" onClick={() => goTo(today())}>Hoy</Button>
            <IconButton label="Periodo siguiente" onClick={() => move(1)}><CaretRight size={16} /></IconButton>
          </div>
          <Segmented label="Vista del calendario" value={view} onChange={setView} options={[{ value: 'month', label: 'Mes' }, { value: 'week', label: 'Semana' }]} />
        </div>
        <div className="calendar-weekdays" aria-hidden="true">{WEEKDAYS.map(d => <span key={d}>{d}</span>)}</div>
        <div className={`calendar-grid calendar-${view}`}>
          {days.map(day => {
            const key = dateKey(day); const reviews = reviewsOn(w, key); const dues = dueOn(key); const meetings = meetingsOn(w, key);
            const outside = view === 'month' && key.slice(0, 7) !== month;
            const visible = view === 'month' ? reviews.slice(0, 2) : reviews;
            return <button type="button" key={key} onClick={() => setSelected(key)} aria-pressed={selected === key} aria-label={`${capitalize(formatDate(day, { weekday: 'long', month: 'long' }))}: ${reviews.length ? plural(reviews.length, 'revisión', 'revisiones') : 'sin revisiones'}${dues.length ? `, ${plural(dues.length, 'entrega', 'entregas')}` : ''}`}
              className={`day ${outside ? 'day-outside' : ''} ${key === today() ? 'day-today' : ''} ${selected === key ? 'day-selected' : ''} ${key < today() ? 'day-past' : ''}`}>
              <span className="day-number">{day.getUTCDate()}</span>
              <span className="day-events">
                {meetings.map(m => <span key={m.id} className="event event-meeting"><span className="event-time">{formatTime(m.startsAt)}</span><span className="event-name">{m.title}</span></span>)}
                {visible.map(r => <span key={r.id} className={`event ${isDirector ? `event-area-${r.areaId}` : ''} ${r.status === 'completed' ? 'event-done' : isPastUnrecorded(r) ? 'event-due' : r.status === 'missed' ? 'event-missed' : ''}`}>
                  <span className="event-time">{formatTime(r.startsAt)}</span>
                  <span className="event-name">{w.students.find(s => s.id === r.studentId)?.name.split(' ')[0]}</span>
                </span>)}
                {reviews.length > visible.length && <span className="event-more">+{reviews.length - visible.length} más</span>}
                {dues.length > 0 && (view === 'month' ? <span className={`event-due-date ${dues.some(a => isLate(a, w)) ? 'is-late' : dues.every(a => delivered(a.id)) ? 'is-done' : ''}`}><FlagPennant size={11} weight="fill" aria-hidden="true" />{plural(dues.length, 'entrega', 'entregas')}</span>
                  : dues.map(a => <span key={a.id} className={`event-due-date ${isLate(a, w) ? 'is-late' : delivered(a.id) ? 'is-done' : ''}`}><FlagPennant size={11} weight="fill" aria-hidden="true" />{w.students.find(s => s.id === a.studentId)?.name.split(' ')[0]}</span>))}
              </span>
              {(reviews.length > 0 || dues.length > 0) && <span className="day-dots" aria-hidden="true">{reviews.slice(0, 3).map(r => <i key={r.id} className={isPastUnrecorded(r) ? 'event-due' : r.status === 'completed' ? 'event-done' : ''} />)}{dues.length > 0 && <i className="dot-flag" />}</span>}
            </button>;
          })}
        </div>
        <div className="calendar-legend" aria-label="Leyenda">
          {isDirector ? AREAS.map(a => <span key={a.id}><i className={`legend-swatch event-area-${a.id}`} />{a.name}</span>)
            : <><span><i className="legend-swatch" />Programada</span><span><i className="legend-swatch event-done" />Realizada</span><span><i className="legend-swatch event-due" />Sin registrar</span></>}
          <span><FlagPennant size={12} weight="fill" className="legend-flag" aria-hidden="true" />Fecha límite de entrega</span>
        </div>
      </section>
      <aside className="day-panel" aria-labelledby="day-title">
        <div className="day-panel-head">
          <h2 id="day-title">{selected === today() ? 'Hoy' : capitalize(formatDate(noonOf(selected), { weekday: 'long', day: undefined, month: undefined }))}<span>{formatDate(noonOf(selected), { month: 'long' })}</span></h2>
        </div>
        {selectedMeetings.length > 0 && <div className="day-panel-list">{selectedMeetings.map(m => <MeetingCard key={m.id} meeting={m} />)}</div>}
        {selectedReviews.length ? <div className="day-panel-list">{selectedReviews.map(r => <ReviewCard key={r.id} review={r} />)}</div>
          : <Empty compact icon={null} title="Sin revisiones" description={!isDirector && selected >= today() ? 'Usa «Programar revisión»; se propondrá este día.' : undefined} />}
        {selectedDue.length > 0 && <section className="due-list" aria-label="Fechas límite de este día">
          <h3><FlagPennant size={14} weight="fill" aria-hidden="true" />Vencen este día<span className="count">{selectedDue.length}</span></h3>
          <ul>{selectedDue.map(a => { const st = w.students.find(s => s.id === a.studentId); return <li key={a.id}><button type="button" onClick={() => app.openAssignment(a.id)}>
            <Avatar name={st?.name ?? 'Alumno'} avatar={st?.avatar} size="sm" /><span><strong>{a.title}</strong><small>{st?.name} · {dueText(a)}</small></span><Steps {...activitySteps(a, w)} />
          </button></li>; })}</ul>
        </section>}
      </aside>
    </div>
  </>;
}
