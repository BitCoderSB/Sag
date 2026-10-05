import { useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Plus, ClipboardText, CalendarPlus, UserPlus, TrendUp, X, MagnifyingGlass, ArrowRight, CircleNotch, WarningCircle, CheckCircle, CaretDown, Code, Cpu, Flask, StackSimple, ArrowUpRight, DotsThree, Barricade, HourglassMedium, Exam } from '@phosphor-icons/react';
import { AREAS, type AreaId, type Review } from '../../shared/types';
import { HEALTH, dayLabel, formatTime, initials, type Health, type StepState, type Tone } from '../lib';
import { useIndicator, useRoll } from '../motion';
import { isAnimal, type AnimalId } from '../../shared/avatars';
import { ANIMAL_ART, AnimalFace } from './animals';

export function Brand() {
  return <div className="brand"><span className="brand-mark"><StackSimple size={18} weight="fill" /></span><span className="brand-name">SAG</span></div>;
}
/** Con `avatar` dibuja el animal del alumno; sin él (cuentas, autores) muestra las iniciales sobre un color pleno. */
export function Avatar({ name, avatar, size = 'md' }: { name: string; avatar?: AnimalId | string | null; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  if (isAnimal(avatar)) return <span className={`avatar avatar-${size} avatar-animal`} aria-hidden="true"><AnimalFace id={avatar} /></span>;
  const color = [...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 6;
  return <span className={`avatar avatar-${size} avatar-${color}`} aria-hidden="true">{initials(name)}</span>;
}
export const animalName = (id: AnimalId) => ANIMAL_ART[id].name;
const HEALTH_ICON: Partial<Record<Health, typeof Barricade>> = { blocked: Barricade, late: HourglassMedium, review: Exam };
/** Avatar con aro de semáforo y, si algo pide atención, un pictograma en la esquina. */
export function StatusAvatar({ name, avatar, health, size = 'md' }: { name: string; avatar?: AnimalId | string | null; health: Health; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const Icon = HEALTH_ICON[health];
  return <span className={`status-avatar status-avatar-${size} ring-${HEALTH[health].dot}`} title={`${name} · ${HEALTH[health].label}`}>
    <Avatar name={name} avatar={avatar} size={size} />
    {Icon && <span className={`status-badge tone-${HEALTH[health].dot}`} aria-hidden="true"><Icon size={size === 'xl' || size === 'lg' ? 12 : 9} weight="bold" /></span>}
  </span>;
}
/** Pictograma de avance de una actividad: asignada, entregada, evaluada. */
export function Steps({ steps, label, size = 'sm' }: { steps: StepState[]; label: string; size?: 'sm' | 'lg' }) {
  const names = ['Asignada', 'Entregada', 'Evaluada'];
  return <span className={`steps steps-${size}`} role="img" aria-label={label} title={label}>
    {steps.map((s, i) => <span key={i} className={`step step-${s}`}>
      {i > 0 && <span className={`step-line ${steps[i - 1] === 'done' && s !== 'off' ? 'is-filled' : ''}`} aria-hidden="true" />}
      <span className="step-dot" aria-hidden="true" />
      {size === 'lg' && <span className="step-name" aria-hidden="true">{names[i]}</span>}
    </span>)}
  </span>;
}
/** Dona de segmentos; cada segmento se dibuja al aparecer. */
export function Donut({ segments, size = 112, stroke = 12, children, label }: { segments: { value: number; tone: string }[]; size?: number; stroke?: number; children?: ReactNode; label: string }) {
  const radius = (size - stroke) / 2; const length = 2 * Math.PI * radius;
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  const gap = segments.filter(s => s.value).length > 1 ? 3 : 0;
  let offset = 0;
  return <div className="donut" style={{ width: size, height: size }} role="img" aria-label={label}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} className="donut-track" strokeWidth={stroke} fill="none" />
      {segments.filter(s => s.value).map((s, i) => {
        const arc = Math.max(0, s.value / total * length - gap);
        const node = <circle key={i} cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="butt" className={`donut-arc tone-${s.tone}`}
          style={{ strokeDasharray: `${arc} ${length}`, strokeDashoffset: -offset, ['--arc' as string]: `${arc}px`, animationDelay: `${i * 70}ms` }} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
        offset += s.value / total * length;
        return node;
      })}
    </svg>
    {children && <div className="donut-center">{children}</div>}
  </div>;
}
export interface RadarSeries { name: string; values: (number | null)[]; kind: 'main' | 'reference' | 'c1' | 'c2' | 'c3' }
/**
 * Gráfica de araña (hexagonal con seis habilidades): cada eje es una habilidad de 0 a 10.
 * La forma dice de un vistazo en qué destaca el alumno y qué le falta; la serie de referencia
 * (promedio del laboratorio) se dibuja punteada para comparar sin competir.
 */
export function Radar({ axes, series, size = 260, label, showValues = true, live = false }: { axes: string[]; series: RadarSeries[]; size?: number; label: string; showValues?: boolean; live?: boolean }) {
  // Margen ancho a los lados para las etiquetas y estrecho arriba y abajo: la gráfica ocupa el espacio.
  const padX = 122; const padY = 30; const width = size + padX * 2; const height = size + padY * 2; const cx = width / 2; const cy = height / 2; const r = size / 2;
  const n = axes.length;
  const point = (i: number, value: number) => { const angle = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(angle) * r * value / 10, cy + Math.sin(angle) * r * value / 10] as const; };
  const polygon = (values: (number | null)[]) => values.map((v, i) => point(i, Math.max(0, Math.min(10, v ?? 0))).join(',')).join(' ');
  const main = series.find(s => s.kind === 'main') ?? series[0];
  return <svg className="radar" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    {[2.5, 5, 7.5, 10].map(level => <polygon key={level} className={`radar-ring ${level === 10 ? 'is-outer' : ''}`} points={polygon(axes.map(() => level))} />)}
    {axes.map((_, i) => { const [x, y] = point(i, 10); return <line key={i} className="radar-spoke" x1={cx} y1={cy} x2={x} y2={y} />; })}
    {[5, 10].map(level => { const [x, y] = point(0, level); return <text key={level} className="radar-scale" x={x + 5} y={y + 3}>{level}</text>; })}
    {series.map((s, si) => <g key={s.name} className={`radar-series radar-${s.kind} ${live ? 'is-live' : ''}`} style={{ animationDelay: `${si * 90}ms` }}>
      {/* En vivo la forma se transforma con el trazo (propiedad d), así crece mientras se califica. */}
      {live ? <path style={{ d: `path('M ${polygon(s.values).split(' ').join(' L ')} Z')` } as CSSProperties} /> : <polygon points={polygon(s.values)} />}
      {s.kind !== 'reference' && s.values.map((v, i) => v === null ? null : live ? <circle key={i} r={s.kind === 'main' ? 3.5 : 3} style={{ cx: point(i, v)[0], cy: point(i, v)[1] } as CSSProperties} /> : <circle key={i} cx={point(i, v)[0]} cy={point(i, v)[1]} r={s.kind === 'main' ? 3.5 : 3} />)}
    </g>)}
    {axes.map((axis, i) => {
      const [x, y] = point(i, 11.2); const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
      const value = main?.values[i];
      const short = axis.length > 16 ? `${axis.slice(0, 15)}…` : axis;
      return <text key={axis} className="radar-label" x={x} y={y} textAnchor={anchor} dominantBaseline="middle">
        <title>{axis}</title>{short}{showValues && value !== null && value !== undefined && <tspan className="radar-value" dx="5">{value.toFixed(1)}</tspan>}
      </text>;
    })}
  </svg>;
}
/** Aro de progreso para una proporción (por ejemplo, entregas a tiempo). */
export function ProgressRing({ value, total, size = 44, tone = 'ok' }: { value: number; total: number; size?: number; tone?: Tone }) {
  const stroke = 5; const radius = (size - stroke) / 2; const length = 2 * Math.PI * radius; const ratio = total ? value / total : 0;
  return <svg className={`progress-ring tone-${tone}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} r={radius} className="progress-ring-track" strokeWidth={stroke} fill="none" />
    <circle cx={size / 2} cy={size / 2} r={radius} className="progress-ring-value" strokeWidth={stroke} fill="none" strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ strokeDasharray: `${ratio * length} ${length}` }} />
  </svg>;
}
/** Número que rueda hacia abajo o hacia arriba al cambiar. */
export function RollingNumber({ value, className = '' }: { value: number; className?: string }) {
  const direction = useRoll(value);
  return <span className={`rolling ${className}`}><span key={value} className={`rolling-value roll-${direction}`}>{value}</span></span>;
}
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean };
export function Button({ children, variant = 'primary', size = 'md', loading, className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`button button-${variant} button-${size} ${className}`} {...props} disabled={props.disabled || loading} aria-busy={loading || undefined}>{loading && <CircleNotch className="spin" size={16} />}{children}</button>;
}
export function IconButton({ children, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
}
export function Badge({ children, tone = 'neutral', dot = false }: { children: ReactNode; tone?: Tone; dot?: boolean | Tone }) {
  return <span className={`badge badge-${tone}`}>{dot && <span className={`badge-dot ${typeof dot === 'string' ? `tone-${dot}` : ''}`} aria-hidden="true" />}{children}</span>;
}
export const areaName = (id: AreaId) => AREAS.find(a => a.id === id)?.name ?? id;
export const AreaIcon = ({ id, size = 16 }: { id: AreaId; size?: number }) => { const Icon = id === 'software' ? Code : id === 'hardware' ? Cpu : Flask; return <Icon size={size} weight="bold" aria-hidden="true" />; };
export function AreaTag({ id, compact = false }: { id: AreaId; compact?: boolean }) {
  return <span title={compact ? areaName(id) : undefined} className={`area-tag area-${id}`}><AreaIcon id={id} size={12} />{compact ? <span className="sr-only">{areaName(id)}</span> : areaName(id)}</span>;
}
export function Empty({ icon, title, description, action, compact = false }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`empty ${compact ? 'empty-compact' : ''}`}>{icon !== null && <div className="empty-icon">{icon ?? <MagnifyingGlass size={20} />}</div>}<strong>{title}</strong>{description && <p>{description}</p>}{action}</div>;
}
export function Search({ value, onChange, placeholder = 'Buscar', label = 'Buscar', className = '', autoFocus = false }: { value: string; onChange: (s: string) => void; placeholder?: string; label?: string; className?: string; autoFocus?: boolean }) {
  return <div className={`search-field ${className}`}><MagnifyingGlass size={16} aria-hidden="true" /><input type="search" aria-label={label} placeholder={placeholder} value={value} autoFocus={autoFocus} onChange={e => onChange(e.target.value)} />{value && <button type="button" aria-label="Limpiar búsqueda" onClick={() => onChange('')}><X size={13} /></button>}</div>;
}
export function Field({ label, children, hint, required, className = '' }: { label: string; children: ReactNode; hint?: ReactNode; required?: boolean; className?: string }) {
  const id = useId();
  return <div className={`field ${className}`}><label id={id}><span className="field-label">{label}{required && <span className="required" aria-hidden="true"> *</span>}</span>{children}</label>{hint && <small className="field-hint">{hint}</small>}</div>;
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? <div className="form-error" role="alert"><WarningCircle size={18} weight="fill" /><span>{message}</span></div> : null;
}
export function Notice({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return <div className={`notice notice-${tone}`}>{icon}<div>{children}</div></div>;
}
export function Modal({ onClose, title, description, children, wide = false }: { onClose: () => void; title: string; description?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <Dialog.Root open onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="overlay" /><Dialog.Content className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-describedby={undefined}><div className="dialog-head"><div><Dialog.Title>{title}</Dialog.Title>{description && <p className="dialog-description">{description}</p>}</div><Dialog.Close asChild><IconButton label="Cerrar ventana"><X size={18} /></IconButton></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Drawer({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  return <Dialog.Root open onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="overlay overlay-drawer" /><Dialog.Content className="drawer" aria-describedby={undefined}><Dialog.Title className="sr-only">{label}</Dialog.Title><Dialog.Close asChild><IconButton className="drawer-close" label="Cerrar detalle"><X size={18} /></IconButton></Dialog.Close>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Select({ value, onChange, children, label, className = '' }: { value: string; onChange: (s: string) => void; children: ReactNode; label: string; className?: string }) {
  return <div className={`select ${className}`}><select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{children}</select><CaretDown size={12} aria-hidden="true" /></div>;
}
export function Segmented<T extends string>({ value, onChange, options, label, className = '' }: { value: T; onChange: (value: T) => void; options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[]; label: string; className?: string }) {
  const { container, indicator } = useIndicator<HTMLDivElement>([value, options.length]);
  return <div ref={container} className={`segmented ${className}`} role="radiogroup" aria-label={label}>
    <span ref={indicator} className="segmented-thumb" aria-hidden="true" />
    {options.map(o => <button type="button" role="radio" key={o.value} aria-checked={value === o.value} aria-label={o.title} title={o.title} disabled={o.disabled} onClick={() => onChange(o.value)}>{o.label}</button>)}
  </div>;
}
export function FilterTabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; count?: number; tone?: Tone }[]; label: string }) {
  const { container, indicator } = useIndicator<HTMLDivElement>([value, options.map(o => o.count).join()]);
  return <div ref={container} className="filter-tabs" role="group" aria-label={label}>
    <span ref={indicator} className="filter-thumb" aria-hidden="true" />
    {options.map(o => <button type="button" key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}{o.count !== undefined && <span className={`count ${o.count && o.tone && ['info', 'warn', 'danger'].includes(o.tone) ? 'count-' + o.tone : ''}`}>{o.count}</span>}</button>)}
  </div>;
}
/** Pestañas con subrayado que se desliza. */
export function Tabs<T extends string>({ value, onChange, tabs, label, idPrefix, panelId }: { value: T; onChange: (value: T) => void; tabs: { id: T; label: string; count?: number }[]; label: string; idPrefix: string; panelId: string }) {
  const { container, indicator } = useIndicator<HTMLDivElement>([value, tabs.map(t => t.count).join()]);
  return <div ref={container} className="tabs" role="tablist" aria-label={label}>
    <span ref={indicator} className="tabs-thumb" aria-hidden="true" />
    {tabs.map(t => <button type="button" role="tab" key={t.id} id={`${idPrefix}-${t.id}`} aria-selected={value === t.id} aria-controls={panelId} onClick={() => onChange(t.id)}>{t.label}{!!t.count && <span className="count">{t.count}</span>}</button>)}
  </div>;
}
export function TextLink({ children, onClick, icon = true }: { children: ReactNode; onClick: () => void; icon?: boolean }) {
  return <button type="button" className="text-link" onClick={onClick}>{children}{icon && <ArrowRight size={14} />}</button>;
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return <header className="page-header"><div className="page-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}
export function SectionTitle({ title, count, children, id }: { title: string; count?: number; children?: ReactNode; id?: string }) {
  return <div className="section-title"><h2 id={id}>{title}{count !== undefined && <span className="count">{count}</span>}</h2>{children}</div>;
}
export interface MenuItem { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }
export function Menu({ label, items, trigger, align = 'end' }: { label: string; items: (MenuItem | 'separator')[]; trigger?: ReactNode; align?: 'start' | 'end' }) {
  return <Dropdown.Root modal={false}><Dropdown.Trigger asChild>{trigger ?? <IconButton label={label} onClick={e => e.stopPropagation()}><DotsThree size={20} weight="bold" /></IconButton>}</Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="menu" align={align} sideOffset={6} collisionPadding={12} onClick={e => e.stopPropagation()}>{items.map((item, i) => item === 'separator' ? <Dropdown.Separator key={i} className="menu-separator" /> : <Dropdown.Item key={item.label} disabled={item.disabled} className={`menu-item ${item.danger ? 'menu-item-danger' : ''}`} onSelect={item.onSelect}>{item.icon}{item.label}</Dropdown.Item>)}</Dropdown.Content></Dropdown.Portal></Dropdown.Root>;
}
export type CreateKind = 'assignment' | 'progress' | 'review' | 'student';
const CREATE_OPTIONS: { kind: CreateKind; label: string; hint: string; icon: typeof Plus; tone: Tone }[] = [
  { kind: 'assignment', label: 'Actividad', hint: 'Asigna una tarea a un alumno', icon: ClipboardText, tone: 'info' },
  { kind: 'progress', label: 'Avance o entrega', hint: 'Registra lo que presentó un alumno', icon: TrendUp, tone: 'warn' },
  { kind: 'review', label: 'Revisión', hint: 'Programa una cita de seguimiento', icon: CalendarPlus, tone: 'ok' },
  { kind: 'student', label: 'Alumno', hint: 'Registra un alumno en tu área', icon: UserPlus, tone: 'neutral' },
];
/** Un solo botón para crear: actividad, revisión o alumno. Es la acción principal en la barra lateral y en Hoy. */
export function CreateMenu({ onPick, align = 'start', className = '', block = false }: { onPick: (kind: CreateKind) => void; align?: 'start' | 'end'; className?: string; block?: boolean }) {
  return <Dropdown.Root modal={false}>
    <Dropdown.Trigger asChild><button type="button" className={`button button-primary button-md create-trigger ${block ? 'create-block' : ''} ${className}`}><Plus size={16} weight="bold" aria-hidden="true" /><span>Nuevo</span><CaretDown size={13} weight="bold" className="create-caret" aria-hidden="true" /></button></Dropdown.Trigger>
    <Dropdown.Portal><Dropdown.Content className="menu create-menu" align={align} sideOffset={8} collisionPadding={12}>
      {CREATE_OPTIONS.map((o, i) => <Dropdown.Item key={o.kind} className="menu-item create-item" style={{ ['--i' as string]: i }} onSelect={() => onPick(o.kind)}>
        <span className={`create-icon tone-${o.tone}`} aria-hidden="true"><o.icon size={17} weight="bold" /></span>
        <span className="create-text"><strong>{o.label}</strong><small>{o.hint}</small></span>
      </Dropdown.Item>)}
    </Dropdown.Content></Dropdown.Portal>
  </Dropdown.Root>;
}
/** Palomita que se dibuja (aviso, botón confirmado, acuerdo cumplido). */
export function CheckDraw({ className = '' }: { className?: string }) {
  return <svg className={`check-svg ${className}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.2 8.6 6.4 11.8 12.8 4.6" pathLength={1} /></svg>;
}
/** Aviso breve: el círculo y la palomita se dibujan; una barra marca el tiempo antes de que se vaya. */
export function Toast({ message, kind, leaving = false }: { message: string; kind: 'success' | 'error'; leaving?: boolean }) {
  return <div className={`toast toast-${kind} ${leaving ? 'is-leaving' : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
    <span className="toast-icon" aria-hidden="true">{kind === 'success' ? <svg viewBox="0 0 24 24" width="22" height="22"><circle className="toast-ring" cx="12" cy="12" r="10" pathLength={1} /><path className="toast-check" d="M7.4 12.6 10.5 15.6 16.8 8.8" pathLength={1} /></svg> : <WarningCircle size={20} weight="fill" />}</span>
    <span>{message}</span>
    <i className="toast-timer" aria-hidden="true" />
  </div>;
}
export function ExternalLink({ url, children }: { url: string; children: ReactNode }) {
  return <a className="external-link" href={url} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={13} /></a>;
}
export function Meter({ value, label }: { value: number; label?: string }) {
  return <span className="meter" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}><span style={{ width: `${Math.max(0, Math.min(10, value)) * 10}%` }} /></span>;
}
/** Próxima revisión de un alumno; sin cita y sin contacto reciente, avisa en ámbar desde cuándo. */
export function NextReviewCell({ next, follow, idle = false }: { next?: Review; follow: { days: number; stale: boolean }; idle?: boolean }) {
  if (next) return <span className="cell-stack"><span>{dayLabel(next.startsAt)}</span><small>{formatTime(next.startsAt)}</small></span>;
  if (follow.stale && !idle) return <span className="cell-stack cell-stale"><span><WarningCircle size={14} weight="fill" aria-hidden="true" />Sin seguimiento</span><small>Desde hace {follow.days} días</small></span>;
  return <span className="muted">Sin programar</span>;
}
export function Loading() {
  return <div className="loading" aria-label="Cargando" role="status"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-hero" /><div className="loading-grid"><div className="skeleton skeleton-block" /><div className="skeleton skeleton-block" /></div><span className="sr-only">Cargando…</span></div>;
}
