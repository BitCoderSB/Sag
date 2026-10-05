import { useState, type FormEvent } from 'react';
import { Plus } from '@phosphor-icons/react';
import { useApp } from '../context';
import { post } from '../lib';
import { AreaTag, Badge, Button, ErrorMessage, Field, Modal, PageHeader, SectionTitle, areaName } from '../components/ui';

const LEVELS = [
  { range: '0 a 2', label: 'Inicial', text: 'Necesita acompañamiento continuo.' },
  { range: '3 a 5', label: 'En desarrollo', text: 'Resuelve partes con apoyo.' },
  { range: '6 a 8', label: 'Competente', text: 'Resuelve con autonomía creciente.' },
  { range: '9 a 10', label: 'Avanzado', text: 'Resuelve, justifica y mejora.' },
];

export default function Settings() {
  const app = useApp(); const w = app.workspace;
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  async function addSkill(e: FormEvent) {
    e.preventDefault(); setPending(true); setError('');
    try { await post('/skills', { name: name.trim(), description: description.trim() }); await app.refresh(); app.toast('Habilidad agregada.'); setOpen(false); setName(''); setDescription(''); }
    catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  const skills = [...w.skills].sort((a, b) => Number(!!b.areaId && b.areaId === w.user.areaId) - Number(!!a.areaId && a.areaId === w.user.areaId) || a.name.localeCompare(b.name));
  return <>
    <PageHeader title="Configuración" subtitle={app.readonly ? 'Solo lectura: consultas las tres áreas sin modificar registros.' : `Responsable de ${areaName(w.user.areaId!)}.`} />
    <section className="settings-section" aria-labelledby="settings-skills">
      <SectionTitle id="settings-skills" title="Habilidades" count={w.skills.length}>{!app.readonly && <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><Plus size={14} weight="bold" />Agregar habilidad</Button>}</SectionTitle>
      <p className="settings-note">Son las que eliges al asignar una actividad y las que calificas al evaluarla.</p>
      <div className="panel table-panel"><div className="table-scroll"><table className="table">
        <thead><tr><th>Habilidad</th><th>Qué se observa</th><th>Área</th></tr></thead>
        <tbody>{skills.map(skill => <tr key={skill.id}>
          <td><strong>{skill.name}</strong></td>
          <td className="cell-wrap muted">{skill.description || 'Sin criterio descrito.'}</td>
          <td>{skill.areaId ? <AreaTag id={skill.areaId} /> : <Badge>Todas</Badge>}</td>
        </tr>)}</tbody>
      </table></div></div>
    </section>
    <section className="settings-section" aria-labelledby="settings-scale">
      <SectionTitle id="settings-scale" title="Escala de evaluación" />
      <p className="settings-note">De 0 a 10. Deja vacía una habilidad que no pudiste observar: <strong>sin evaluar</strong> no es lo mismo que cero.</p>
      <ol className="scale">{LEVELS.map(level => <li key={level.label}><strong>{level.range}</strong><span>{level.label}</span><small>{level.text}</small></li>)}</ol>
    </section>
    {open && <Modal title="Agregar habilidad" description="Quedará disponible para las actividades de tu área." onClose={() => !pending && setOpen(false)}>
      <form onSubmit={addSkill}>
        <div className="dialog-body">
          <ErrorMessage message={error} />
          <Field label="Nombre" required><input autoFocus value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} placeholder="Ej. Diseño de bases de datos" /></Field>
          <Field label="Qué debe demostrar el alumno" required><textarea value={description} onChange={e => setDescription(e.target.value)} required maxLength={500} rows={3} /></Field>
        </div>
        <div className="dialog-foot"><Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button><Button type="submit" loading={pending}>Agregar habilidad</Button></div>
      </form>
    </Modal>}
  </>;
}
