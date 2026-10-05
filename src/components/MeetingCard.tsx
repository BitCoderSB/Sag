import { CalendarX, PencilSimple, UsersThree } from '@phosphor-icons/react';
import type { Meeting } from '../../shared/types';
import { useApp } from '../context';
import { dayLabel, formatTime, safeUrl } from '../lib';
import { AreaTag, Menu } from './ui';

/** Reunión del jefe con responsables: la ven los invitados; solo el jefe la edita o la cancela. */
export default function MeetingCard({ meeting, withDate = false }: { meeting: Meeting; withDate?: boolean }) {
  const app = useApp();
  const url = meeting.place ? safeUrl(meeting.place) ?? safeUrl(`https://${meeting.place}`) : null;
  const isLink = !!meeting.place && /^(https?:\/\/|meet\.|zoom\.|teams\.)/i.test(meeting.place) && url;
  return <article className={`meeting-card ${app.fresh.has(meeting.id) ? 'is-fresh' : ''}`}>
    <div className="meeting-head">
      <span className="meeting-icon" aria-hidden="true"><UsersThree size={16} weight="bold" /></span>
      <span className="meeting-when">{withDate && <strong>{dayLabel(meeting.startsAt)}</strong>}<strong>{formatTime(meeting.startsAt)}</strong><span>{meeting.durationMinutes} min · Reunión</span></span>
      {app.readonly && <Menu label="Acciones de la reunión" items={[
        { label: 'Editar reunión', icon: <PencilSimple size={16} />, onSelect: () => app.modal({ type: 'meeting', meeting }) },
        'separator',
        { label: 'Cancelar reunión', icon: <CalendarX size={16} />, danger: true, onSelect: () => app.modal({ type: 'meeting', meeting, cancel: true }) },
      ]} />}
    </div>
    <strong className="meeting-title">{meeting.title}</strong>
    <span className="meeting-who">{app.readonly ? <>Con {meeting.areaIds.map(id => <AreaTag key={id} id={id} compact />)}<span className="sr-only">responsables invitados</span></> : <>Convoca {meeting.organizerName}{meeting.areaIds.length > 1 && <> · también {meeting.areaIds.filter(a => a !== app.workspace.user.areaId).map(id => <AreaTag key={id} id={id} compact />)}</>}</>}</span>
    {meeting.place && <p className="review-note"><span>Lugar</span>{isLink ? <a href={url!} target="_blank" rel="noopener noreferrer">{meeting.place}</a> : meeting.place}</p>}
    {meeting.notes && <p className="review-note"><span>Temas</span>{meeting.notes}</p>}
  </article>;
}
