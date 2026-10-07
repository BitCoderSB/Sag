import { useState, type ReactNode } from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { ArrowRight, MagnifyingGlass, Notepad, FlagPennant, HandGrabbing } from '@phosphor-icons/react';
import type { AnimalId } from '../../shared/avatars';
import { formatDate, formatTime, normalize, plural } from '../lib';
import { Avatar, openLayer } from './ui';

export interface MoveItem { id: string; kind: 'review' | 'due'; person: string; avatar?: AnimalId | string | null; title: string; at: string; late?: boolean; onSelect: () => void }

/** Lista para elegir qué llevar a un día: quién (avatar y nombre), qué es, de qué fecha sale y a cuál llega.
 *  Elegir no guarda: abre el diálogo de confirmación con la fecha nueva ya puesta. */
export function MovePicker({ items, target, trigger, title }: { items: MoveItem[]; target?: string; trigger: ReactNode; title: string }) {
  const [query, setQuery] = useState(''); const [layer, setLayer] = useState<HTMLElement | undefined>();
  const q = normalize(query.trim());
  const visible = q ? items.filter(i => normalize(`${i.person} ${i.title}`).includes(q)) : items;
  const groups = [
    { kind: 'review' as const, label: 'Revisiones programadas', icon: <Notepad size={14} weight="bold" /> },
    { kind: 'due' as const, label: 'Fechas límite', icon: <FlagPennant size={14} weight="fill" /> },
  ].map(g => ({ ...g, items: visible.filter(i => i.kind === g.kind) })).filter(g => g.items.length);
  const to = target ? formatDate(`${target}T12:00:00-06:00`) : null;
  return <Dropdown.Root modal={false} onOpenChange={o => { if (o) setLayer(openLayer()); else setQuery(''); }}>
    <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
    <Dropdown.Portal container={layer}>
      <Dropdown.Content className="menu move-picker" align="end" side="top" sideOffset={8} collisionPadding={12}>
        <div className="mp-head">
          <strong>{title}</strong>
          <span>{items.length ? `${plural(items.length, 'opción', 'opciones')} · se confirma antes de guardar` : 'No hay nada que mover'}</span>
        </div>
        {items.length > 5 && <label className="mp-search">
          <MagnifyingGlass size={15} aria-hidden="true" />
          {/* El texto se escribe aquí sin que el menú lo use para saltar entre opciones. */}
          <input autoFocus placeholder="Buscar alumno o actividad" aria-label="Buscar alumno o actividad" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); (e.currentTarget.closest('.move-picker')?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus(); return; } if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation(); }} />
        </label>}
        <div className="mp-list">
          {groups.map(g => <Dropdown.Group key={g.kind} className="mp-group">
            <Dropdown.Label className="mp-label">{g.icon}{g.label}<span className="count">{g.items.length}</span></Dropdown.Label>
            {g.items.map(i => <Dropdown.Item key={i.id} className="mp-item" onSelect={i.onSelect}>
              <Avatar name={i.person} avatar={i.avatar} size="md" />
              <span className="mp-text"><strong>{i.person}</strong><small>{i.title}</small></span>
              <span className={`mp-when ${i.late ? 'is-late' : ''}`}>
                <span className="mp-from">{i.late ? (i.kind === 'review' ? 'Sin registrar · ' : 'Venció ') : ''}{formatDate(i.at)}{i.kind === 'review' ? ` · ${formatTime(i.at)}` : ''}</span>
                {to && <><ArrowRight size={12} weight="bold" aria-hidden="true" /><span className="mp-to">{to}</span></>}
              </span>
            </Dropdown.Item>)}
          </Dropdown.Group>)}
          {!groups.length && <p className="mp-empty">{q ? `Nada coincide con «${query.trim()}».` : 'No hay revisiones ni entregas abiertas.'}</p>}
        </div>
        <p className="mp-foot"><HandGrabbing size={14} aria-hidden="true" />También puedes arrastrar desde la columna derecha o el calendario.</p>
      </Dropdown.Content>
    </Dropdown.Portal>
  </Dropdown.Root>;
}
