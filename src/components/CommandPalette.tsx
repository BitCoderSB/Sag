import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarPlus, ListChecks, MagnifyingGlass, Plus, UserPlus, ArrowRight } from '@phosphor-icons/react';
import { useApp } from '../context';
import { normalize } from '../lib';
import { Avatar, areaName } from './ui';

interface Item { id: string; group: string; label: string; detail?: string; icon: ReactNode; run: () => void }

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const app = useApp(); const w = app.workspace;
  const [query, setQuery] = useState(''); const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const q = normalize(query.trim());
  const items = useMemo(() => {
    const run = (fn: () => void) => () => { onClose(); fn(); };
    const list: Item[] = [];
    if (!app.readonly) {
      const actions: Item[] = [
        { id: 'action-assign', group: 'Acciones', label: 'Asignar actividad', icon: <Plus size={16} />, run: run(() => app.modal({ type: 'assignment' })) },
        { id: 'action-review', group: 'Acciones', label: 'Programar revisión', icon: <CalendarPlus size={16} />, run: run(() => app.modal({ type: 'review' })) },
        { id: 'action-student', group: 'Acciones', label: 'Agregar alumno', icon: <UserPlus size={16} />, run: run(() => app.modal({ type: 'student' })) },
      ];
      list.push(...actions.filter(a => !q || normalize(a.label).includes(q)));
    }
    const own = (areaIds: string[]) => app.readonly || areaIds.includes(w.user.areaId!);
    const students = w.students
      .filter(s => normalize(`${s.name} ${s.registration} ${s.technologies.join(' ')}`).includes(q))
      .sort((a, b) => Number(own(b.areaIds)) - Number(own(a.areaIds)) || a.name.localeCompare(b.name));
    list.push(...students.slice(0, q ? 6 : 4).map(s => ({ id: s.id, group: 'Alumnos', label: s.name, detail: `${s.registration} · ${s.areaIds.map(areaName).join(', ')}`, icon: <Avatar name={s.name} avatar={s.avatar} size="sm" />, run: run(() => app.openStudent(s.id)) })));
    const assignments = w.assignments
      .filter(a => a.status !== 'cancelled' && normalize(`${a.title} ${w.students.find(s => s.id === a.studentId)?.name ?? ''}`).includes(q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    list.push(...assignments.slice(0, q ? 6 : 3).map(a => ({ id: a.id, group: 'Actividades', label: a.title, detail: w.students.find(s => s.id === a.studentId)?.name, icon: <ListChecks size={16} />, run: run(() => app.openAssignment(a.id)) })));
    return list;
  }, [q, w, app, onClose]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  function onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(items.length - 1, i + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    if (event.key === 'Enter' && items[active]) { event.preventDefault(); items[active].run(); }
  }
  const groups = [...new Set(items.map(i => i.group))];
  return <Dialog.Root open onOpenChange={value => !value && onClose()}>
    <Dialog.Portal>
      <Dialog.Overlay className="overlay" />
      <Dialog.Content className="palette" aria-describedby={undefined}>
        <Dialog.Title className="sr-only">Buscar</Dialog.Title>
        <div className="palette-input">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Busca alumnos, actividades o acciones" aria-label="Buscar alumnos y actividades" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {groups.map(group => <div key={group} role="group" aria-label={group}>
            <div className="palette-group">{group}</div>
            {items.filter(i => i.group === group).map(item => { const index = items.indexOf(item); return <button type="button" role="option" id={`palette-${item.id}`} key={item.id} aria-selected={index === active} className="palette-item" onMouseMove={() => setActive(index)} onClick={item.run}>
              <span className="palette-icon">{item.icon}</span>
              <span className="palette-text"><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span>
              <ArrowRight size={14} className="palette-enter" aria-hidden="true" />
            </button>; })}
          </div>)}
          {!items.length && <p className="palette-empty">Sin resultados para «{query}».</p>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
