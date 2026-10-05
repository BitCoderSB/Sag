import { useState } from 'react';
import { ListChecks, ListBullets, Kanban, WarningCircle, PersonSimpleRun, Exam, ArrowsClockwise, CheckCircle } from '@phosphor-icons/react';
import { AREAS, type AreaId, type Assignment, type AssignmentStatus } from '../../shared/types';
import { useApp } from '../context';
import { activitySteps, assignmentState, dueText, isLate, isOpen, normalize, plural, scoped, statusLabels } from '../lib';
import { AreaTag, Avatar, Badge, Steps, Empty, FilterTabs, PageHeader, Search, Segmented, Select } from '../components/ui';

type Filter = 'open' | 'pending_review' | 'late' | 'blocked' | 'completed' | 'cancelled';
const BOARD: AssignmentStatus[] = ['in_progress', 'pending_review', 'changes_requested', 'completed'];
/** Cada columna dice qué pasa y a quién le toca. */
const COLUMN: Record<string, { title: string; who: string; icon: typeof Exam; tone: string }> = {
  in_progress: { title: 'En curso', who: 'El alumno está trabajando', icon: PersonSimpleRun, tone: 'neutral' },
  pending_review: { title: 'Por evaluar', who: 'Te toca evaluar', icon: Exam, tone: 'info' },
  changes_requested: { title: 'Corrigiendo', who: 'El alumno corrige lo que pediste', icon: ArrowsClockwise, tone: 'warn' },
  completed: { title: 'Terminadas', who: 'Entregadas y evaluadas', icon: CheckCircle, tone: 'ok' },
};

export default function Assignments() {
  const app = useApp();
  const [area, setArea] = useState<AreaId | 'all'>((app.params.get('area') as AreaId) ?? 'all');
  const w = scoped(app.workspace, area);
  const [filter, setFilter] = useState<Filter>((app.params.get('status') as Filter) ?? 'open');
  const [query, setQuery] = useState(''); const [view, setView] = useState<'list' | 'board'>('list');
  const studentOf = (a: Assignment) => w.students.find(s => s.id === a.studentId) ?? app.workspace.students.find(s => s.id === a.studentId);
  const studentName = (a: Assignment) => w.students.find(s => s.id === a.studentId)?.name ?? app.workspace.students.find(s => s.id === a.studentId)?.name ?? 'Alumno';
  const q = normalize(query.trim());
  const searched = w.assignments.filter(a => normalize(`${a.title} ${studentName(a)}`).includes(q));
  const tests: Record<Filter, (a: Assignment) => boolean> = {
    open: isOpen,
    pending_review: a => a.status === 'pending_review',
    late: a => isLate(a, w),
    blocked: a => isOpen(a) && !!a.blockedReason,
    completed: a => a.status === 'completed',
    cancelled: a => a.status === 'cancelled',
  };
  const count = (f: Filter) => w.assignments.filter(tests[f]).length;
  // Al buscar por nombre se busca en todos los estados: quien escribe un título espera encontrarlo aunque ya esté terminada.
  const list = (q ? searched.filter(a => a.status !== 'cancelled' || filter === 'cancelled') : searched.filter(tests[filter])).sort((a, b) => filter === 'completed' || filter === 'cancelled' ? b.updatedAt.localeCompare(a.updatedAt) : (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
  return <>
    <PageHeader title="Actividades" />
    {view === 'list' && <div className="toolbar">
      <FilterTabs label="Filtrar por estado" value={filter} onChange={setFilter} options={[
        { value: 'open', label: 'Abiertas', count: count('open') },
        { value: 'pending_review', label: 'Por evaluar', count: count('pending_review'), tone: 'info' },
        { value: 'late', label: 'Atrasadas', count: count('late'), tone: 'warn' },
        { value: 'blocked', label: 'Con impedimento', count: count('blocked'), tone: 'danger' },
        { value: 'completed', label: 'Terminadas', count: count('completed') },
        { value: 'cancelled', label: 'Canceladas', count: count('cancelled') },
      ]} />
    </div>}
    <div className="toolbar toolbar-secondary">
      <Search value={query} onChange={setQuery} placeholder="Actividad o alumno" label="Buscar actividades" />
      {q && view === 'list' && <span className="toolbar-note">Resultados de todos los estados</span>}
      <div className="toolbar-filters">
        {app.readonly && <Select label="Área" value={area} onChange={v => setArea(v as AreaId | 'all')}><option value="all">Todas las áreas</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
        <Segmented label="Vista" value={view} onChange={setView} className="segmented-icons" options={[{ value: 'list', label: <ListBullets size={17} />, title: 'Lista' }, { value: 'board', label: <Kanban size={17} />, title: 'Tablero por estado' }]} />
      </div>
    </div>
    {view === 'list' ? <section className="panel table-panel">
      <div className="table-scroll">
        <table className="table table-cards">
          <thead><tr><th>Actividad</th><th>Alumno</th><th>Estado</th><th className="col-md">Fecha límite</th><th className="col-lg">Habilidades</th>{app.readonly && <th className="col-lg">Área</th>}</tr></thead>
          <tbody>{list.map(a => { const state = assignmentState(a, w); const late = isLate(a, w); return <tr key={a.id} className={`row-link ${app.fresh.has(a.id) ? 'is-fresh' : ''}`} onClick={() => app.openAssignment(a.id)}>
            <td className="c-wide"><button type="button" className="activity-name" onClick={e => { e.stopPropagation(); app.openAssignment(a.id); }}>
              <strong>{a.title}</strong>{a.blockedReason && isOpen(a) && <small className="text-danger">{a.blockedReason}</small>}
            </button></td>
            <td><span className="person-inline"><Avatar name={studentName(a)} avatar={studentOf(a)?.avatar} size="sm" />{studentName(a)}</span></td>
            <td className="c-end"><span className="state-cell"><Steps {...activitySteps(a, w)} /><Badge tone={state.tone}>{state.label}</Badge></span></td>
            <td className="col-md c-show"><span className={late ? 'text-warn' : 'muted'}>{late && <WarningCircle size={13} weight="fill" aria-hidden="true" />}{isOpen(a) ? dueText(a) : a.status === 'completed' ? 'Entregada' : 'Sin efecto'}</span></td>
            <td className="col-lg"><span className="tag-row">{a.skillIds.slice(0, 2).map(id => <span className="chip" key={id}>{w.skills.find(s => s.id === id)?.name}</span>)}{a.skillIds.length > 2 && <span className="chip chip-more">+{a.skillIds.length - 2}</span>}</span></td>
            {app.readonly && <td className="col-lg"><AreaTag id={a.areaId} /></td>}
          </tr>; })}</tbody>
        </table>
      </div>
      {!list.length && <Empty icon={<ListChecks size={20} />} title={query ? 'Sin coincidencias' : filter === 'open' ? 'No hay actividades abiertas' : 'Nada en este estado'}
        description={query ? 'Prueba con otro nombre de actividad o alumno.' : filter === 'open' && !app.readonly ? 'Usa «Asignar actividad» en la barra lateral para crear la primera.' : undefined} />}
    </section> : <div className="board">
      {BOARD.map(status => {
        const all = searched.filter(a => a.status === status).sort((a, b) => status === 'completed' ? b.updatedAt.localeCompare(a.updatedAt) : (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
        const items = status === 'completed' && !query ? all.slice(0, 6) : all;
        const meta = COLUMN[status]; const Icon = meta.icon;
        return <section className={`board-column tone-${meta.tone}`} key={status} aria-label={`${meta.title}: ${meta.who}`}>
          <header className="board-head">
            <span className="board-icon"><Icon size={15} weight="bold" aria-hidden="true" /></span>
            <span><h2 className="board-title">{meta.title}<span className="count">{all.length}</span></h2><small>{app.readonly && status === 'pending_review' ? 'Falta que el responsable evalúe' : meta.who}</small></span>
          </header>
          {items.map(a => { const state = assignmentState(a, w); return <button type="button" key={a.id} className={`board-card ${app.fresh.has(a.id) ? 'is-fresh' : ''}`} onClick={() => app.openAssignment(a.id)}>
            <span className="board-card-top"><strong>{a.title}</strong><Steps {...activitySteps(a, w)} /></span>
            <span className="person-inline"><Avatar name={studentName(a)} avatar={studentOf(a)?.avatar} size="sm" />{studentName(a)}</span>
            {(state.label !== statusLabels[status] || isOpen(a) || app.readonly) && <span className="board-card-foot">{state.label !== statusLabels[status] && <Badge tone={state.tone}>{state.label}</Badge>}{isOpen(a) && <span className={isLate(a, w) ? 'text-warn' : 'muted'}>{dueText(a)}</span>}{app.readonly && <AreaTag id={a.areaId} compact />}</span>}
          </button>; })}
          {all.length > items.length && <button type="button" className="board-more" onClick={() => { setView('list'); setFilter('completed'); }}>Ver las {all.length} terminadas</button>}
          {!all.length && <p className="board-empty">Nada aquí</p>}
        </section>;
      })}
    </div>}
    {view === 'list' && q && list.length > 0 && <p className="table-count">{plural(list.length, 'resultado', 'resultados')}</p>}
  </>;
}
