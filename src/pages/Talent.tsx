import { useMemo, useState } from 'react';
import { Sparkle, SlidersHorizontal, ArrowRight, X } from '@phosphor-icons/react';
import { AREAS, type AreaId } from '../../shared/types';
import { useApp } from '../context';
import { formatDate, normalize, plural, skillStats } from '../lib';
import { AreaTag, Avatar, Button, Empty, Meter, Modal, PageHeader, Radar, Search, Select } from '../components/ui';

export default function Talent() {
  const app = useApp(); const w = app.workspace;
  const [skillId, setSkillId] = useState(app.params.get('skill') ?? '');
  const [query, setQuery] = useState(''); const [area, setArea] = useState<AreaId | 'all'>('all');
  const [minimum, setMinimum] = useState('0'); const [recency, setRecency] = useState('all'); const [evidence, setEvidence] = useState('1');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); const [compare, setCompare] = useState(false);
  const skillName = (id: string) => w.skills.find(s => s.id === id)?.name ?? 'Habilidad';
  const observed = useMemo(() => w.skills.filter(s => w.evaluations.some(e => e.current && e.scores.some(sc => sc.skillId === s.id && sc.score !== null))).sort((a, b) => a.name.localeCompare(b.name)), [w]);
  const advanced = Number(minimum !== '0') + Number(recency !== 'all') + Number(evidence !== '1');
  const results = useMemo(() => {
    const q = normalize(query.trim());
    return w.students.filter(s => s.status === 'active').map(student => ({ student, stats: skillStats(w.evaluations, student.id) })).filter(({ student, stats }) => {
      if (!normalize(`${student.name} ${student.registration} ${student.technologies.join(' ')}`).includes(q)) return false;
      if (area !== 'all' && !student.areaIds.includes(area)) return false;
      if (!skillId) return true;
      const skill = stats.find(s => s.skillId === skillId);
      return !!skill && skill.average >= Number(minimum) && skill.count >= Number(evidence) && (recency === 'all' || Date.parse(skill.latest) >= Date.now() - Number(recency) * 86_400_000);
    }).sort((a, b) => {
      if (!skillId) return a.student.name.localeCompare(b.student.name);
      const x = a.stats.find(s => s.skillId === skillId)!; const y = b.stats.find(s => s.skillId === skillId)!;
      return y.average - x.average || y.count - x.count;
    });
  }, [w, query, area, skillId, minimum, evidence, recency]);
  function toggle(id: string) { setSelected(old => old.includes(id) ? old.filter(s => s !== id) : old.length < 3 ? [...old, id] : old); }
  function reset() { setSkillId(''); setMinimum('0'); setRecency('all'); setEvidence('1'); setArea('all'); setQuery(''); }
  const comparison = w.students.filter(s => selected.includes(s.id));
  // Ejes comunes: solo habilidades evaluadas en todos los seleccionados. Sin evaluar no es cero, así que no se dibuja como cero.
  const compareStats = comparison.map(s => skillStats(w.evaluations, s.id));
  const compareAxes = w.skills.filter(k => compareStats.length > 0 && compareStats.every(st => st.some(x => x.skillId === k.id)))
    .sort((a, b) => compareStats.reduce((n, st) => n + (st.find(x => x.skillId === b.id)?.count ?? 0), 0) - compareStats.reduce((n, st) => n + (st.find(x => x.skillId === a.id)?.count ?? 0), 0))
    .slice(0, 8).sort((a, b) => w.skills.indexOf(a) - w.skills.indexOf(b));
  return <>
    <PageHeader title="Talento" subtitle="Busca alumnos por habilidad evaluada en las tres áreas." />
    <div className="skill-picker" role="group" aria-label="Habilidad">
      <button type="button" aria-pressed={!skillId} onClick={() => setSkillId('')}>Todas</button>
      {observed.map(s => <button type="button" key={s.id} aria-pressed={skillId === s.id} onClick={() => setSkillId(s.id)}>{s.name}</button>)}
    </div>
    <div className="toolbar toolbar-secondary">
      <Search value={query} onChange={setQuery} placeholder="Nombre o tecnología" label="Buscar talento por nombre o tecnología" />
      <div className="toolbar-filters">
        <Select label="Área" value={area} onChange={v => setArea(v as AreaId | 'all')}><option value="all">Las tres áreas</option>{AREAS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Button variant="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(v => !v)}><SlidersHorizontal size={16} />Filtros{advanced > 0 && <span className="count count-info">{advanced}</span>}</Button>
      </div>
    </div>
    {filtersOpen && <div className="filter-panel">
      <label><span>Nivel mínimo</span><Select label="Nivel mínimo" value={minimum} onChange={setMinimum}><option value="0">Cualquiera</option>{[5, 6, 7, 8, 9].map(n => <option value={n} key={n}>{n} o más</option>)}</Select></label>
      <label><span>Evidencia reciente</span><Select label="Evidencia reciente" value={recency} onChange={setRecency}><option value="all">Cualquier fecha</option><option value="30">Últimos 30 días</option><option value="90">Últimos 3 meses</option><option value="180">Últimos 6 meses</option></Select></label>
      <label><span>Evaluaciones mínimas</span><Select label="Evaluaciones mínimas" value={evidence} onChange={setEvidence}>{[1, 2, 3, 5].map(n => <option value={n} key={n}>{plural(n, 'evaluación', 'evaluaciones')}</option>)}</Select></label>
      <p className="filter-panel-note">{skillId ? `Se aplican a ${skillName(skillId)}.` : 'Elige una habilidad para aplicar estos filtros.'}</p>
    </div>}
    <p className="results-caption">{plural(results.length, 'alumno', 'alumnos')}{skillId ? `, de mayor a menor en ${skillName(skillId)}` : ', en orden alfabético'}</p>
    {results.length ? <ol className="talent-list">{results.map(({ student, stats }, index) => {
      const focus = skillId ? stats.find(s => s.skillId === skillId)! : null;
      const others = (focus ? stats.filter(s => s.skillId !== skillId) : stats).slice(0, focus ? 2 : 3);
      const checked = selected.includes(student.id);
      return <li key={student.id} className={`talent-card ${checked ? 'is-selected' : ''}`}>
        {focus && <span className="talent-rank" aria-label={`Posición ${index + 1}`}>{index + 1}</span>}
        <button type="button" className="talent-person" onClick={() => app.openStudent(student.id)}>
          <Avatar name={student.name} avatar={student.avatar} />
          <span><strong>{student.name}</strong><span className="tag-row">{student.areaIds.map(id => <AreaTag key={id} id={id} compact />)}<small>{student.openAssignmentCount === undefined ? '' : student.openAssignmentCount === 0 ? 'Sin actividades abiertas' : `${plural(student.openAssignmentCount, 'actividad abierta', 'actividades abiertas')} en total`}</small></span></span>
        </button>
        <div className="talent-skills">
          {focus && <div className="talent-focus">
            <span className="score">{focus.average.toFixed(1)}</span>
            <span className="talent-focus-meta"><Meter value={focus.average} /><small>{plural(focus.count, 'evaluación', 'evaluaciones')} · última {formatDate(focus.latest)}</small></span>
          </div>}
          {others.length > 0 ? <ul className={focus ? 'talent-others' : 'talent-top'}>{others.map(s => <li key={s.skillId}><span>{skillName(s.skillId)}</span>{!focus && <Meter value={s.average} />}<strong>{s.average.toFixed(1)}</strong></li>)}</ul>
            : !focus && <span className="muted">Sin habilidades evaluadas</span>}
        </div>
        <label className="talent-compare"><input type="checkbox" checked={checked} disabled={selected.length === 3 && !checked} onChange={() => toggle(student.id)} />Comparar</label>
      </li>;
    })}</ol> : <section className="panel"><Empty icon={<Sparkle size={20} />} title="Sin coincidencias" description="Amplía los filtros. Sin evaluar no significa calificación cero." action={<Button variant="secondary" size="sm" onClick={reset}>Quitar filtros</Button>} /></section>}
    {selected.length > 0 && <div className="compare-tray" role="region" aria-label="Comparación">
      <span className="compare-avatars">{comparison.map(s => <Avatar name={s.name} avatar={s.avatar} key={s.id} size="sm" />)}</span>
      <span>{selected.length} de 3 seleccionados</span>
      <Button size="sm" disabled={selected.length < 2} onClick={() => setCompare(true)}>Comparar<ArrowRight size={14} /></Button>
      <button type="button" className="icon-button" aria-label="Quitar selección" onClick={() => setSelected([])}><X size={16} /></button>
    </div>}
    {compare && <Modal title="Comparación" description="Promedio de evaluaciones vigentes y cantidad de evidencia por habilidad." wide onClose={() => setCompare(false)}>
      <div className="dialog-body">
        {compareAxes.length < 3 && <p className="side-empty">Tienen menos de tres habilidades evaluadas en común; compáralos en la tabla.</p>}
        {compareAxes.length >= 3 && <figure className="radar-figure">
          <Radar size={280} showValues={false} axes={compareAxes.map(k => k.name)} label={`Comparación de habilidades: ${comparison.map(s => s.name).join(', ')}`}
            series={comparison.map((s, i) => ({ name: s.name, kind: (['c1', 'c2', 'c3'] as const)[i], values: compareAxes.map(k => compareStats[i].find(x => x.skillId === k.id)?.average ?? null) }))} />
          <figcaption className="radar-legend"><span className="radar-note">Habilidades evaluadas en {comparison.length === 2 ? 'ambos' : 'los tres'}</span>{comparison.map((s, i) => <span key={s.id}><i className={`legend-line legend-c${i + 1}`} />{s.name}</span>)}</figcaption>
        </figure>}
        <div className="table-scroll"><table className="table compare-table">
        <thead><tr><th>Habilidad</th>{comparison.map(s => <th key={s.id}><span className="person-inline"><Avatar name={s.name} avatar={s.avatar} size="sm" />{s.name}</span></th>)}</tr></thead>
        <tbody>{w.skills.filter(skill => comparison.some(s => skillStats(w.evaluations, s.id).some(stat => stat.skillId === skill.id))).map(skill => <tr key={skill.id} className={skill.id === skillId ? 'is-focus' : ''}><th>{skill.name}</th>{comparison.map(student => { const stat = skillStats(w.evaluations, student.id).find(s => s.skillId === skill.id); return <td key={student.id}>{stat ? <span className="compare-cell"><strong>{stat.average.toFixed(1)}</strong><small>{plural(stat.count, 'evaluación', 'evaluaciones')}</small></span> : <span className="muted">Sin evaluar</span>}</td>; })}</tr>)}</tbody>
      </table></div></div>
    </Modal>}
  </>;
}
