import { useState } from 'react';
import { DownloadSimple } from '@phosphor-icons/react';
import { AREAS, type AreaId } from '../../shared/types';
import { useApp } from '../context';
import { isOpen, plural, scoped, statusLabels, DAY } from '../lib';
import { AreaTag, Empty, PageHeader, Radar, SectionTitle, Select } from '../components/ui';
import Trends from '../components/Trends';

const STATUSES = ['in_progress', 'pending_review', 'changes_requested', 'completed', 'cancelled'] as const;

export default function Reports() {
  const app = useApp();
  const [area, setArea] = useState<AreaId | 'all'>('all'); const [period, setPeriod] = useState('90');
  const w = scoped(app.workspace, area);
  const since = period === 'all' ? 0 : Date.now() - Number(period) * DAY;
  const areaFilter = app.readonly ? area === 'all' ? null : area : w.user.areaId;
  const tasks = w.assignments.filter(a => Date.parse(a.createdAt) >= since);
  const valid = tasks.filter(a => a.status !== 'cancelled');
  const completed = tasks.filter(a => a.status === 'completed').length;
  const ids = new Set(tasks.map(a => a.id));
  const first = new Map<string, string>();
  w.deliveries.filter(d => ids.has(d.assignmentId) && d.completeness === 'complete').forEach(d => { const prior = first.get(d.assignmentId); if (!prior || d.receivedAt < prior) first.set(d.assignmentId, d.receivedAt); });
  const withDeadline = [...first].filter(([id]) => tasks.find(a => a.id === id)?.dueAt);
  const onTime = withDeadline.filter(([id, at]) => Date.parse(at) <= Date.parse(tasks.find(a => a.id === id)!.dueAt!)).length;
  const evaluations = w.evaluations.filter(e => e.current && (!areaFilter || e.areaId === areaFilter) && Date.parse(e.createdAt) >= since);
  const skills = w.skills.map(skill => {
    const values = evaluations.flatMap(e => e.scores.filter(s => s.skillId === skill.id && s.score !== null).map(s => ({ score: s.score!, studentId: e.studentId })));
    return { ...skill, count: values.length, students: new Set(values.map(v => v.studentId)).size, average: values.length ? values.reduce((n, v) => n + v.score, 0) / values.length : 0 };
  }).filter(s => s.count).sort((a, b) => b.students - a.students || b.average - a.average);
  const maxStudents = Math.max(1, ...skills.map(s => s.students));
  const radarSkills = skills.slice(0, 8).sort((a, b) => app.workspace.skills.findIndex(k => k.id === a.id) - app.workspace.skills.findIndex(k => k.id === b.id));
  const active = w.students.filter(s => s.status === 'active').length;
  return <>
    <PageHeader title="Reportes" actions={<>
      {app.readonly && <Select label="Área" value={area} onChange={v => setArea(v as AreaId | 'all')}><option value="all">Todas las áreas</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}
      <Select label="Periodo" value={period} onChange={setPeriod}><option value="30">Últimos 30 días</option><option value="90">Últimos 3 meses</option><option value="180">Últimos 6 meses</option><option value="all">Todo el historial</option></Select>
      <a href="/api/export" className="button button-secondary button-md" download><DownloadSimple size={16} />Exportar CSV</a>
    </>} />
    <dl className="stats">
      <div><dt>Alumnos activos</dt><dd>{active}</dd><dd className="stat-note">Personas únicas, hoy</dd></div>
      <div><dt>Actividades terminadas</dt><dd>{completed}<span> de {valid.length}</span></dd><dd className="stat-note">Sin contar canceladas</dd></div>
      <div><dt>Entregas a tiempo</dt><dd>{withDeadline.length ? `${Math.round(onTime / withDeadline.length * 100)}%` : 'Sin datos'}</dd><dd className="stat-note">{withDeadline.length ? `${onTime} de ${withDeadline.length} con fecha límite` : 'Ninguna entrega con plazo'}</dd></div>
      <div><dt>Evaluaciones</dt><dd>{evaluations.length}</dd><dd className="stat-note">{plural(skills.length, 'habilidad observada', 'habilidades observadas')}</dd></div>
    </dl>
    <div className="report-grid">
      <section className="panel report-section" aria-labelledby="report-status">
        <SectionTitle id="report-status" title="Estado de las actividades" count={tasks.length} />
        {tasks.length ? <ul className="bars">{STATUSES.map(status => { const count = tasks.filter(a => a.status === status).length; return <li key={status}>
          <span className="bar-label">{statusLabels[status]}</span>
          <span className="bar-track">{count > 0 && <span className={`bar-fill status-${status}`} style={{ width: `${count / tasks.length * 100}%` }} />}</span>
          <strong>{count}</strong>
        </li>; })}</ul> : <Empty compact icon={null} title="Sin actividades en este periodo" />}
      </section>
      <section className="panel report-section" aria-labelledby="report-skills">
        <SectionTitle id="report-skills" title="Perfil de habilidades" />
        {radarSkills.length >= 3 && <figure className="radar-figure radar-figure-compact"><Radar size={220} axes={radarSkills.map(k => k.name)} series={[{ name: 'Promedio', kind: 'main', values: radarSkills.map(k => k.average) }]} label={'Nivel promedio por habilidad: ' + radarSkills.map(k => k.name + ' ' + k.average.toFixed(1)).join(', ')} /><figcaption className="radar-legend"><span><i className="legend-line legend-main" />Nivel promedio del periodo</span></figcaption></figure>}
        <h3 className="subhead">Alumnos con evidencia por habilidad</h3>
        {skills.length ? <ul className="bars">{skills.slice(0, 8).map(skill => <li key={skill.id}>
          <span className="bar-label">{skill.name}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${skill.students / maxStudents * 100}%` }} /></span>
          <strong title={`Promedio ${skill.average.toFixed(1)}`}>{plural(skill.students, 'alumno', 'alumnos')}</strong>
        </li>)}</ul> : <Empty compact icon={null} title="Sin evaluaciones en este periodo" description="Aparecerán al evaluar actividades." />}
      </section>
    </div>
    <Trends w={w} areaFilter={areaFilter} />
    {app.readonly && <section className="panel table-panel" aria-labelledby="report-areas">
      <div className="panel-head"><SectionTitle id="report-areas" title="Por área" /></div>
      <div className="table-scroll"><table className="table">
        <thead><tr><th>Área</th><th className="num">Alumnos activos</th><th className="num">Abiertas</th><th className="num">Por evaluar</th><th className="num">Con impedimento</th><th className="num">Terminadas</th></tr></thead>
        <tbody>{AREAS.filter(a => area === 'all' || a.id === area).map(a => { const list = tasks.filter(t => t.areaId === a.id); return <tr key={a.id}>
          <td><AreaTag id={a.id} /></td>
          <td className="num">{app.workspace.students.filter(s => s.areaIds.includes(a.id) && s.status === 'active').length}</td>
          <td className="num">{list.filter(isOpen).length}</td>
          <td className="num">{list.filter(t => t.status === 'pending_review').length}</td>
          <td className="num">{list.filter(t => isOpen(t) && t.blockedReason).length}</td>
          <td className="num">{list.filter(t => t.status === 'completed').length}</td>
        </tr>; })}</tbody>
      </table></div>
    </section>}
    <p className="footnote">El periodo filtra actividades por fecha de asignación y evaluaciones por fecha de registro. El CSV exporta todo, sin estos filtros.</p>
  </>;
}
