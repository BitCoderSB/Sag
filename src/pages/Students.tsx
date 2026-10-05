import { useMemo, useState } from 'react';
import { Plus, CalendarPlus, PencilSimple, UsersThree, UserPlus, TrendUp, Rows, ChartBarHorizontal } from '@phosphor-icons/react';
import { AREAS, type AreaId, type Student, type Workspace } from '../../shared/types';
import { useApp } from '../context';
import { activitySteps, currentAssignment, DAY, dueText, followUp, formatDate, HEALTH, isOpen, studentPeriod, type Health, HEALTH_GROUPS, inGroup, nextReview, normalize, plural, scoped, studentHealth, type HealthGroup } from '../lib';
import { AreaTag, Badge, StatusAvatar, Steps, Button, Empty, FilterTabs, Menu, NextReviewCell, PageHeader, Search, Segmented, Select } from '../components/ui';
import Gantt, { type GanttRow } from '../components/Gantt';
import StudentAction from '../components/StudentAction';

type Filter = 'all' | HealthGroup;

export default function Students() {
  const app = useApp();
  const [area, setArea] = useState<AreaId | 'all'>((app.params.get('area') as AreaId) ?? 'all');
  const w = scoped(app.workspace, area);
  const [filter, setFilter] = useState<Filter>((app.params.get('f') as Filter) ?? 'all');
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('active'); const [modality, setModality] = useState('all');
  const [view, setView] = useState<'list' | 'timeline'>(app.params.get('v') === 'timeline' ? 'timeline' : 'list');
  const rows = useMemo(() => w.students
    .filter(s => (status === 'all' || s.status === status) && (modality === 'all' || s.modalities.includes(modality)))
    .map(s => ({ s, health: studentHealth(w, s), current: currentAssignment(w, s.id), next: nextReview(w, s.id), follow: followUp(w, s) }))
    .sort((a, b) => a.s.name.localeCompare(b.s.name)), [w, status, modality]);
  const q = normalize(search.trim());
  const visible = rows.filter(r => (filter === 'all' || inGroup(r.health, filter)) && normalize(`${r.s.name} ${r.s.registration} ${r.s.technologies.join(' ')}`).includes(q));
  const modalities = [...new Set(w.students.flatMap(s => s.modalities))].sort();
  const own = (areaIds: AreaId[]) => !app.readonly && areaIds.includes(w.user.areaId!);
  return <>
    <PageHeader title="Alumnos"
      actions={!app.readonly && <Button onClick={() => app.modal({ type: 'student' })}><UserPlus size={16} weight="bold" />Agregar alumno</Button>} />
    <div className="toolbar">
      <FilterTabs label="Filtrar por situación" value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'Todos', count: rows.length },
        ...HEALTH_GROUPS.map(g => ({ value: g.id, label: g.label, count: rows.filter(r => inGroup(r.health, g.id)).length, tone: g.tone })),
      ]} />
    </div>
    <div className="toolbar toolbar-secondary">
      <Search value={search} onChange={setSearch} placeholder="Nombre, matrícula o tecnología" label="Buscar alumnos" />
      <div className="toolbar-filters">
        <Segmented label="Vista" className="segmented-icons-text" value={view} onChange={setView} options={[{ value: 'list', label: <><Rows size={15} aria-hidden="true" />Lista</> }, { value: 'timeline', label: <><ChartBarHorizontal size={15} aria-hidden="true" />Cronograma</> }]} />
        {app.readonly && <Select label="Área" value={area} onChange={v => setArea(v as AreaId | 'all')}><option value="all">Todas las áreas</option>{AREAS.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</Select>}
        {modalities.length > 1 && <Select label="Modalidad" value={modality} onChange={setModality}><option value="all">Todas las modalidades</option>{modalities.map(m => <option key={m}>{m}</option>)}</Select>}
        <Select label="Estado del alumno" value={status} onChange={setStatus}><option value="active">Activos</option><option value="paused">En pausa</option><option value="completed">Terminaron</option><option value="all">Todos los estados</option></Select>
      </div>
    </div>
    {view === 'timeline' ? <section className="panel timeline-panel"><Timeline w={w} rows={visible} onOpen={app.openStudent} /></section> : <section className="panel table-panel">
      <div className="table-scroll">
        <table className="table table-cards">
          <thead><tr><th>Alumno</th><th className="col-md">Actividad actual</th><th>Situación</th><th className="col-lg">Próxima revisión</th>{app.readonly && <th className="col-lg">Áreas</th>}<th><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody>{visible.map(({ s, health, current, next, follow }) => <tr key={s.id} className={`row-link ${app.fresh.has(s.id) ? 'is-fresh' : ''}`} onClick={() => app.openStudent(s.id)}>
            <td><button type="button" className="student-name" onClick={e => { e.stopPropagation(); app.openStudent(s.id); }}>
              <StatusAvatar name={s.name} avatar={s.avatar} health={health} />
              <span><strong>{s.name}</strong><small>{[s.registration, ...s.modalities].join(' · ')}</small></span>
            </button></td>
            <td className="col-md c-show">{current ? <span className="cell-progress"><Steps {...activitySteps(current, w)} /><span className="cell-stack"><span className="cell-title">{current.title}</span><small>{dueText(current)}</small></span></span> : <span className="muted">Ninguna</span>}</td>
            <td className="c-end c-top"><Badge tone={HEALTH[health].tone} dot={HEALTH[health].dot}>{HEALTH[health].label}</Badge></td>
            <td className="col-lg"><NextReviewCell next={next} follow={follow} idle={health === 'idle'} /></td>
            {app.readonly && <td className="col-lg"><span className="tag-row">{s.areaIds.map(id => <AreaTag key={id} id={id} />)}</span></td>}
            <td className="cell-actions">{own(s.areaIds) && <span className="row-actions"><StudentAction student={s} /><Menu label={`Más acciones para ${s.name}`} items={[
              ...(s.status === 'active' ? [
                ...(current && current.areaId === w.user.areaId ? [{ label: 'Registrar avance o entrega', icon: <TrendUp size={16} />, onSelect: () => app.modal({ type: 'progress', assignment: current }) }] : []),
                { label: 'Asignar actividad', icon: <Plus size={16} />, onSelect: () => app.modal({ type: 'assignment', studentId: s.id }) },
                { label: 'Programar revisión', icon: <CalendarPlus size={16} />, onSelect: () => app.modal({ type: 'review', studentId: s.id }) },
                'separator' as const,
              ] : []),
              { label: 'Editar expediente', icon: <PencilSimple size={16} />, onSelect: () => app.modal({ type: 'student', student: s }) },
            ]} /></span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!visible.length && (rows.length || search ? <Empty icon={<UsersThree size={20} />} title="No encontramos alumnos" description="Prueba con otro nombre o cambia el filtro." action={filter !== 'all' || search ? <Button variant="secondary" size="sm" onClick={() => { setFilter('all'); setSearch(''); }}>Quitar filtros</Button> : undefined} />
        : <Empty icon={<UsersThree size={20} />} title="Aún no hay alumnos" description={app.readonly ? 'Los responsables todavía no registran alumnos.' : 'Usa «Agregar alumno» para registrar al primero y asignarle actividades.'} />)}
    </section>}
    {q && visible.length > 0 && <p className="table-count">{plural(visible.length, 'resultado', 'resultados')}</p>}
  </>;
}

/** Una fila por alumno: su periodo, las fechas límite abiertas y la próxima revisión. Responde quién termina pronto y quién está saturado. */
function Timeline({ w, rows, onOpen }: { w: Workspace; rows: { s: Student; health: Health }[]; onOpen: (id: string) => void }) {
  const at = (key: string) => Date.parse(`${key}T12:00:00-06:00`);
  const items: GanttRow[] = [...rows].sort((a, b) => (studentPeriod(w, a.s).end ?? '9').localeCompare(studentPeriod(w, b.s).end ?? '9')).map(({ s, health }) => {
    const period = studentPeriod(w, s); const start = at(period.start); const end = period.end ? at(period.end) : Math.max(Date.now(), start) + 30 * DAY;
    const dues = w.assignments.filter(a => a.studentId === s.id && isOpen(a) && a.dueAt);
    const next = w.reviews.filter(r => r.studentId === s.id && r.status === 'scheduled' && Date.parse(r.startsAt) >= Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    return {
      id: s.id, label: s.name, sub: `${HEALTH[health].label}${period.end ? ` · termina ${formatDate(new Date(end))}` : ' · sin fecha de término'}`,
      lead: <StatusAvatar name={s.name} avatar={s.avatar} health={health} size="sm" />,
      start, end, tone: HEALTH[health].dot === 'neutral' ? 'idle' : HEALTH[health].dot,
      markers: [...dues.map(a => ({ at: Date.parse(a.dueAt!), kind: 'due' as const, title: `Vence: ${a.title}` })), ...(next ? [{ at: Date.parse(next.startsAt), kind: 'review' as const, title: `Próxima revisión ${formatDate(next.startsAt)}` }] : [])],
      onClick: () => onOpen(s.id),
      describe: `${s.name}: ${HEALTH[health].label}. Periodo del ${formatDate(new Date(start))} ${period.end ? `al ${formatDate(new Date(end))}` : 'sin fecha de término'}. ${plural(dues.length, 'entrega abierta', 'entregas abiertas')}.`,
    };
  });
  const legend = <><span><i className="gantt-key gantt-bar tone-ok" />Al día</span><span><i className="gantt-key gantt-bar tone-info" />Por evaluar</span><span><i className="gantt-key gantt-bar tone-warn" />Atrasado</span><span><i className="gantt-key gantt-bar tone-danger" />Con impedimento</span><span><i className="gantt-key gantt-bar tone-idle" />Sin actividad</span><span><i className="gantt-key gantt-marker gantt-due" />Fecha límite</span><span><i className="gantt-key gantt-marker gantt-review" />Próxima revisión</span></>;
  return <Gantt rows={items} legend={legend} label="Cronograma de alumnos" empty={<Empty icon={<UsersThree size={20} />} title="No hay alumnos en esta vista" description="Cambia el filtro o el estado para verlos." />} />;
}
