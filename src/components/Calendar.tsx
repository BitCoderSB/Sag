import { useMemo, useState } from 'react';
import { CaretLeft, CaretRight, FlagPennant } from '@phosphor-icons/react';
import { AREAS, type Workspace } from '../../shared/types';
import { capitalize, dateKey, formatDate, formatTime, isLate, isOpen, isPastUnrecorded, meetingsOn, plural, reviewsOn, today, weekDays } from '../lib';
import { Button, IconButton, Segmented } from './ui';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const noonOf = (key: string) => new Date(`${key}T12:00:00-06:00`);

/** Calendario de mes y semana sin marco: puntos por día en el mes, revisiones con hora en la semana. */
/** `byArea`: el jefe ve las revisiones coloreadas por área en lugar de por estado. */
export default function Calendar({ w, selected, onSelect, byArea = false }: { w: Workspace; selected: string; onSelect: (key: string) => void; byArea?: boolean }) {
  const [cursor, setCursor] = useState(() => noonOf(selected));
  const [view, setView] = useState<'month' | 'week'>(() => window.matchMedia('(max-width: 720px)').matches ? 'week' : 'month');
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
  function move(by: number) { const next = new Date(cursor); if (view === 'month') next.setUTCMonth(next.getUTCMonth() + by, 1); else next.setUTCDate(next.getUTCDate() + by * 7); setCursor(next); }
  function goToday() { setCursor(noonOf(today())); onSelect(today()); }
  const dueOn = (key: string) => w.assignments.filter(a => isOpen(a) && a.dueAt && dateKey(a.dueAt) === key);
  const delivered = (id: string) => w.deliveries.some(d => d.assignmentId === id && d.completeness === 'complete');
  const nameOf = (id: string) => w.students.find(s => s.id === id)?.name.split(' ')[0];

  return <section className="cal" aria-label="Calendario">
    <div className="cal-toolbar">
      <div className="cal-nav">
        <IconButton label="Periodo anterior" onClick={() => move(-1)}><CaretLeft size={16} /></IconButton>
        <IconButton label="Periodo siguiente" onClick={() => move(1)}><CaretRight size={16} /></IconButton>
      </div>
      <h2 className="cal-title" aria-live="polite">{title}</h2>
      <Segmented label="Vista del calendario" value={view} onChange={setView} options={[{ value: 'month', label: 'Mes' }, { value: 'week', label: 'Semana' }]} />
      <Button variant="secondary" size="sm" onClick={goToday}>Hoy</Button>
    </div>
    <div className="cal-weekdays" aria-hidden="true">{WEEKDAYS.map(d => <span key={d}>{d}</span>)}</div>
    <div className={`cal-grid cal-${view}`}>
      {days.map((day, i) => {
        const key = dateKey(day); const reviews = reviewsOn(w, key); const dues = dueOn(key); const meetings = meetingsOn(w, key);
        const outside = view === 'month' && key.slice(0, 7) !== month;
        const late = dues.some(a => isLate(a, w));
        return <button type="button" key={key} onClick={() => onSelect(key)} aria-pressed={selected === key}
          aria-label={`${capitalize(formatDate(day, { weekday: 'long', month: 'long' }))}: ${reviews.length ? plural(reviews.length, 'revisión', 'revisiones') : 'sin revisiones'}${meetings.length ? `, ${plural(meetings.length, 'reunión', 'reuniones')}` : ''}${dues.length ? `, ${plural(dues.length, 'entrega', 'entregas')}` : ''}`}
          className={`cal-day ${outside ? 'is-outside' : ''} ${key === today() ? 'is-today' : ''} ${selected === key ? 'is-selected' : ''} ${key < today() ? 'is-past' : ''}`}>
          {view === 'week' && <span className="cal-wd" aria-hidden="true">{WEEKDAYS[i]}</span>}
          <span className="cal-number">{day.getUTCDate()}</span>
          {view === 'month'
            ? (reviews.length > 0 || dues.length > 0 || meetings.length > 0) && <span className="cal-dots" aria-hidden="true">
              {meetings.slice(0, 2).map(m => <i key={m.id} className="is-meeting" />)}
              {reviews.slice(0, 3).map(r => <i key={r.id} className={byArea ? `is-area-${r.areaId}` : isPastUnrecorded(r) ? 'is-due' : r.status === 'completed' ? 'is-done' : ''} />)}
              {dues.length > 0 && <i className={`is-flag ${late ? 'is-due' : ''}`} />}
            </span>
            : <span className="cal-events">
              {meetings.map(m => <span key={m.id} className="event event-meeting"><span className="event-time">{formatTime(m.startsAt)}</span><span className="event-name">{m.title}</span></span>)}
              {reviews.map(r => <span key={r.id} className={`event ${byArea ? `event-area-${r.areaId}` : ''} ${r.status === 'completed' ? 'event-done' : isPastUnrecorded(r) ? 'event-due' : r.status === 'missed' ? 'event-missed' : ''}`}>
                <span className="event-time">{formatTime(r.startsAt)}</span><span className="event-name">{nameOf(r.studentId)}</span>
              </span>)}
              {dues.map(a => <span key={a.id} className={`event-due-date ${isLate(a, w) ? 'is-late' : delivered(a.id) ? 'is-done' : ''}`}><FlagPennant size={11} weight="fill" aria-hidden="true" />{nameOf(a.studentId)}</span>)}
            </span>}
        </button>;
      })}
    </div>
    <div className="cal-legend" aria-label="Leyenda">
      {byArea ? AREAS.map(a => <span key={a.id}><i className={`cal-key is-area-${a.id}`} />{a.name}</span>)
        : <><span><i className="cal-key" />Programada</span><span><i className="cal-key is-due" />Sin registrar</span><span><i className="cal-key is-done" />Realizada</span></>}
      <span><i className="cal-key is-meeting" />Reunión</span>
      <span><i className="cal-key is-flag" />Fecha límite</span>
    </div>
  </section>;
}
