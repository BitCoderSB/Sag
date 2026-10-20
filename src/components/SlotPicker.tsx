import { useMemo, useState } from 'react';
import { CalendarBlank, Lightning, WarningCircle } from '@phosphor-icons/react';
import type { Workspace } from '../../shared/types';
import { capitalize, dateKey, formatDate, today } from '../lib';

/** Un rato ocupado de tu agenda (revisión o reunión). */
export interface Busy { start: number; end: number; label: string }

const DAY_START = 8 * 60; const DAY_END = 20 * 60; // horario de trabajo: 8:00 a 20:00 (hora del centro de México)
const at = (day: string, minutes: number) => Date.parse(`${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00-06:00`);
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00-06:00`); d.setUTCDate(d.getUTCDate() + n); return dateKey(d); };
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const toMinutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };

/** Tu agenda: revisiones programadas de tu área y reuniones con el jefe. `skip` excluye la cita que estás moviendo. */
export function agenda(w: Workspace, skip?: string): Busy[] {
  const name = (id: string) => w.students.find(s => s.id === id)?.name.split(' ')[0] ?? 'un alumno';
  return [
    ...w.reviews.filter(r => r.status === 'scheduled' && r.id !== skip && (!w.user.areaId || r.areaId === w.user.areaId))
      .map(r => ({ start: Date.parse(r.startsAt), end: Date.parse(r.startsAt) + r.durationMinutes * 60000, label: `Revisión con ${name(r.studentId)}` })),
    ...w.meetings.filter(m => m.status === 'scheduled' && m.id !== skip)
      .map(m => ({ start: Date.parse(m.startsAt), end: Date.parse(m.startsAt) + m.durationMinutes * 60000, label: `Reunión: ${m.title}` })),
  ];
}
const clashOf = (busy: Busy[], start: number, minutes: number) => busy.find(b => b.start < start + minutes * 60000 && b.end > start);

/** El primer horario libre desde `from` (en los próximos 21 días, dentro del horario de trabajo). */
export function firstFree(busy: Busy[], minutes: number, from = Date.now(), step = 30): string | null {
  const start = dateKey(new Date(from));
  for (let d = 0; d < 21; d++) {
    const day = addDays(start, d);
    for (let m = DAY_START; m + minutes <= DAY_END; m += step) {
      const t = at(day, m);
      if (t < from) continue;
      if (!clashOf(busy, t, minutes)) return `${day}T${hhmm(m)}`;
    }
  }
  return null;
}

/**
 * Elegir fecha y hora sin pelear con el control del navegador: días a un toque, horarios en botones (los ocupados se
 * ven y no se pueden elegir), «Primer horario libre» y, si la hora elegida choca, una sugerencia para moverla.
 * `value` usa el formato de los campos de fecha («AAAA-MM-DDTHH:MM», hora del centro de México).
 */
export default function SlotPicker({ value, onChange, minutes, busy, label = 'Fecha y hora', allowPast = false }: {
  value: string; onChange: (value: string) => void; minutes: number; busy: Busy[]; label?: string; allowPast?: boolean;
}) {
  const now = Date.now(); const first = today();
  const day = value.slice(0, 10) || first; const time = value.slice(11, 16);
  const [shown, setShown] = useState(() => Math.max(14, Math.round((Date.parse(`${day}T12:00:00-06:00`) - Date.parse(`${first}T12:00:00-06:00`)) / 86_400_000) + 1));
  const step = minutes <= 15 ? 15 : 30;
  const days = useMemo(() => Array.from({ length: shown }, (_, i) => addDays(first, i)), [first, shown]);
  const slots = useMemo(() => {
    const list: { minutes: number; state: 'free' | 'busy' | 'past'; why?: string }[] = [];
    for (let m = DAY_START; m + minutes <= DAY_END; m += step) {
      const t = at(day, m); const c = clashOf(busy, t, minutes);
      list.push({ minutes: m, state: !allowPast && t < now ? 'past' : c ? 'busy' : 'free', why: c?.label });
    }
    return list;
  }, [day, busy, minutes, step, now, allowPast]);
  const free = slots.filter(s => s.state === 'free').length;
  const start = value ? at(day, toMinutes(time || '00:00')) : NaN;
  const clash = Number.isNaN(start) ? undefined : clashOf(busy, start, minutes);
  const suggestion = clash ? firstFree(busy, minutes, Math.max(start, now), step) : null;
  const soonest = firstFree(busy, minutes, now, step);
  const pickDay = (d: string) => {
    // Al cambiar de día se conserva la hora si está libre; si no, el primer horario libre de ese día.
    const keep = time && at(d, toMinutes(time)) >= now && !clashOf(busy, at(d, toMinutes(time)), minutes);
    onChange(keep ? `${d}T${time}` : firstFree(busy, minutes, Math.max(at(d, 0), now), step)?.startsWith(d) ? firstFree(busy, minutes, Math.max(at(d, 0), now), step)! : `${d}T${time || '10:00'}`);
  };
  const dayName = (d: string) => d === first ? 'Hoy' : d === addDays(first, 1) ? 'Mañana' : capitalize(formatDate(`${d}T12:00:00-06:00`, { weekday: 'short', day: undefined, month: undefined }).replace('.', ''));
  const groups = [{ title: 'Mañana', from: 0, to: 12 * 60 }, { title: 'Tarde', from: 12 * 60, to: 17 * 60 }, { title: 'Noche', from: 17 * 60, to: 24 * 60 }]
    .map(g => ({ ...g, slots: slots.filter(s => s.minutes >= g.from && s.minutes < g.to) })).filter(g => g.slots.length);

  return <div className="slot-picker" role="group" aria-label={label}>
    <div className="slot-quick">
      <button type="button" className="slot-soonest" disabled={!soonest} onClick={() => soonest && onChange(soonest)}>
        <Lightning size={15} weight="fill" aria-hidden="true" />
        <span><strong>Primer horario libre</strong><small>{soonest ? `${dayName(soonest.slice(0, 10))} ${formatDate(`${soonest.slice(0, 10)}T12:00:00-06:00`, { weekday: undefined })}, ${soonest.slice(11)}` : 'Sin espacios en 3 semanas'}</small></span>
      </button>
      <span className="slot-summary" aria-live="polite">{value ? <>{dayName(day)} {formatDate(`${day}T12:00:00-06:00`, { weekday: undefined })} · <strong>{time}–{hhmm(toMinutes(time || '00:00') + minutes)}</strong></> : 'Sin elegir'}</span>
    </div>

    <div className="slot-days" role="radiogroup" aria-label="Día">
      {days.map(d => { const busyCount = busy.filter(b => dateKey(new Date(b.start)) === d).length; const weekend = [0, 6].includes(new Date(`${d}T12:00:00-06:00`).getUTCDay());
        return <button key={d} type="button" role="radio" aria-checked={d === day} className={`slot-day ${weekend ? 'is-weekend' : ''}`} onClick={() => pickDay(d)}>
          <small>{dayName(d)}</small><strong>{Number(d.slice(8))}</strong><i aria-hidden="true">{busyCount > 0 && Array.from({ length: Math.min(3, busyCount) }, (_, n) => <b key={n} />)}</i>
          {busyCount > 0 && <span className="sr-only">{busyCount} citas</span>}
        </button>; })}
      <button type="button" className="slot-day slot-more" onClick={() => setShown(n => n + 14)}><CalendarBlank size={16} aria-hidden="true" /><small>Más días</small></button>
    </div>

    <div className="slot-times">
      {free === 0 && <p className="slot-none">{slots.every(s => s.state === 'past') ? 'Este día ya pasó en el horario de trabajo.' : 'No queda espacio libre este día.'}{soonest && <> <button type="button" className="ad-inline-link" onClick={() => onChange(soonest)}>Ir al primer horario libre</button></>}</p>}
      {groups.map(g => <div key={g.title} className="slot-group">
        <span className="slot-group-title">{g.title}</span>
        <div className="slot-grid" role="radiogroup" aria-label={`Horarios de la ${g.title.toLowerCase()}`}>
          {g.slots.map(s => { const t = hhmm(s.minutes); const on = t === time && s.minutes === toMinutes(time);
            return <button key={t} type="button" role="radio" aria-checked={on} disabled={s.state !== 'free' && !on} className={`slot is-${s.state}`} title={s.state === 'busy' ? `Ocupado · ${s.why}` : s.state === 'past' ? 'Ya pasó' : `${t}–${hhmm(s.minutes + minutes)}`} onClick={() => onChange(`${day}T${t}`)}>
              {t}{s.state === 'busy' && <span className="sr-only">, ocupado</span>}
            </button>; })}
        </div>
      </div>)}
      <label className="slot-exact"><span>Otra hora exacta</span><input type="time" value={time} step={300} onChange={e => e.target.value && onChange(`${day}T${e.target.value}`)} /></label>
    </div>

    {clash && <div className="slot-clash" role="status">
      <WarningCircle size={17} weight="fill" aria-hidden="true" />
      <span>Ese horario se cruza con <strong>{clash.label}</strong>.</span>
      {suggestion && <button type="button" className="button button-secondary button-sm" onClick={() => onChange(suggestion)}>Usar el más próximo: {suggestion.slice(0, 10) === day ? '' : `${dayName(suggestion.slice(0, 10))} `}{suggestion.slice(11)}</button>}
    </div>}
  </div>;
}
