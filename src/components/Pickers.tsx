import { useRef, useState, type ReactNode } from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { CaretDown, Check, MagnifyingGlass } from '@phosphor-icons/react';
import type { AnimalId } from '../../shared/avatars';
import { normalize } from '../lib';
import { Avatar, openLayer } from './ui';

export interface PickOption { value: string; label: string; sub?: string; avatar?: AnimalId | string | null; person?: boolean; tone?: 'warn' | 'danger' | 'info' | 'ok' }

/** Selector con contexto: avatar, nombre y una línea que ayuda a reconocer (situación, actividad, fecha).
 *  Reemplaza al <select> nativo, cuya lista no respeta el tema oscuro y no muestra quién es quién. */
export function RichSelect({ label, value, onChange, options, placeholder, invalid = false, autoFocus = false, empty = 'Sin opciones', id }: { label: string; value: string; onChange: (v: string) => void; options: PickOption[]; placeholder: string; invalid?: boolean; autoFocus?: boolean; empty?: string; id?: string }) {
  const [query, setQuery] = useState(''); const [open, setOpen] = useState(false); const [layer, setLayer] = useState<HTMLElement | undefined>();
  const trigger = useRef<HTMLButtonElement>(null);
  const picked = options.find(o => o.value === value);
  const q = normalize(query.trim());
  const visible = q ? options.filter(o => normalize(`${o.label} ${o.sub ?? ''}`).includes(q)) : options;
  return <Dropdown.Root modal={false} open={open} onOpenChange={o => { if (o) setLayer(openLayer()); setOpen(o); if (!o) setQuery(''); }}>
    <Dropdown.Trigger asChild>
      <button ref={trigger} id={id} type="button" className={`rich-select ${picked ? 'has-value' : ''} ${invalid ? 'is-invalid' : ''}`} aria-label={`${label}: ${picked ? picked.label : placeholder}`} autoFocus={autoFocus} data-autofocus={autoFocus || undefined}>
        {picked ? <>
          {picked.person && <Avatar name={picked.label} avatar={picked.avatar} size="sm" />}
          <span className="rich-select-text"><strong>{picked.label}</strong>{picked.sub && <small className={picked.tone ? `tone-${picked.tone}` : ''}>{picked.sub}</small>}</span>
        </> : <span className="rich-select-placeholder">{placeholder}</span>}
        <CaretDown size={14} weight="bold" className="rich-select-caret" aria-hidden="true" />
      </button>
    </Dropdown.Trigger>
    <Dropdown.Portal container={layer}>
      <Dropdown.Content className="menu rich-select-menu" align="start" sideOffset={6} collisionPadding={12} style={{ width: 'var(--radix-dropdown-menu-trigger-width)' }} onCloseAutoFocus={e => { e.preventDefault(); trigger.current?.focus(); }}>
        {options.length > 6 && <label className="mp-search">
          <MagnifyingGlass size={15} aria-hidden="true" />
          {/* El texto se escribe aquí sin que el menú lo use para saltar entre opciones. */}
          <input autoFocus placeholder="Buscar" aria-label={`Buscar en ${label.toLowerCase()}`} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => {
            // ↓ entra a la lista; Enter elige la primera coincidencia; el resto se escribe sin saltar entre opciones.
            if (e.key === 'ArrowDown') { e.preventDefault(); (e.currentTarget.closest('.rich-select-menu')?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus(); return; }
            if (e.key === 'Enter') { e.preventDefault(); if (visible[0]) { onChange(visible[0].value); setOpen(false); setQuery(''); } return; }
            if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
          }} />
        </label>}
        <div className="rich-select-list">
          {visible.map(o => <Dropdown.Item key={o.value} className={`mp-item rich-select-item ${o.value === value ? 'is-picked' : ''}`} onSelect={() => onChange(o.value)}>
            {o.person ? <Avatar name={o.label} avatar={o.avatar} size="md" /> : <span className="rich-select-dot" aria-hidden="true" />}
            <span className="mp-text"><strong>{o.label}</strong>{o.sub && <small className={o.tone ? `tone-${o.tone}` : ''}>{o.sub}</small>}</span>
            {o.value === value ? <Check size={15} weight="bold" className="rich-select-check" aria-label="Elegido" /> : <span />}
          </Dropdown.Item>)}
          {!visible.length && <p className="mp-empty">{q ? `Nada coincide con «${query.trim()}».` : empty}</p>}
        </div>
      </Dropdown.Content>
    </Dropdown.Portal>
  </Dropdown.Root>;
}

/** Bloque de un formulario con su pregunta: «¿Para quién?», «¿Cuándo?»… Ordena la lectura y dice qué falta. */
export function FormSection({ title, hint, children, aside }: { title: string; hint?: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="form-section">
    <header className="form-section-head"><h3>{title}</h3>{hint && <p>{hint}</p>}{aside}</header>
    <div className="form-section-body">{children}</div>
  </section>;
}
