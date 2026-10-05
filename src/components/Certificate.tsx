import { Printer } from '@phosphor-icons/react';
import { useApp } from '../context';
import { formatDate, hoursProgress, plural, punctuality, skillStats, studentPeriod } from '../lib';
import { AreaTag, Avatar, Button, Modal, Radar, areaName } from './ui';

const long = (key: string) => formatDate(`${key}T12:00:00-06:00`, { month: 'long', year: 'numeric' });

/**
 * Constancia de participación: periodo, horas, actividades terminadas y habilidades con evidencia.
 * Se imprime con el diálogo del navegador («Guardar como PDF»); la hoja de impresión oculta todo lo demás.
 */
export default function Certificate({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const { workspace: w, readonly } = useApp();
  const student = w.students.find(s => s.id === studentId);
  if (!student) return null;
  const period = studentPeriod(w, student); const hours = hoursProgress(w, student); const onTime = punctuality(w, student.id);
  const done = w.assignments.filter(a => a.studentId === student.id && a.status === 'completed').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const average = (assignmentId: string) => { const e = w.evaluations.find(x => x.assignmentId === assignmentId && x.current); const v = e?.scores.filter(s => s.score !== null).map(s => s.score!) ?? []; return v.length ? v.reduce((n, x) => n + x, 0) / v.length : null; };
  const skills = skillStats(w.evaluations, student.id); const name = (id: string) => w.skills.find(k => k.id === id)?.name ?? 'Habilidad';
  const radar = skills.slice(0, 8);
  return <Modal wide title="Constancia" description="Revisa los datos y usa «Imprimir» para guardarla como PDF." onClose={onClose}>
    <div className="dialog-body">
      <article className="certificate" aria-label={`Constancia de ${student.name}`}>
        <header className="certificate-head">
          <div><p className="certificate-kicker">Laboratorio · {student.areaIds.map(areaName).join(', ')}</p><h2>Constancia de participación</h2></div>
          <Avatar name={student.name} avatar={student.avatar} size="xl" />
        </header>
        <p className="certificate-lead">Se hace constar que <strong>{student.name}</strong>{student.registration && <> (matrícula {student.registration})</>}{student.career && <>, de {student.career}</>}, participó en el laboratorio{student.modalities.length ? <> en la modalidad de {student.modalities.join(' y ').toLowerCase()}</> : null} {period.end ? <>del {long(period.start)} al {long(period.end)}</> : <>desde {long(period.start)}</>}.</p>
        <dl className="certificate-facts">
          <div><dt>Actividades terminadas</dt><dd>{done.length}</dd></div>
          {hours && <div><dt>Horas registradas</dt><dd>{hours.done}<small> de {hours.required}</small></dd></div>}
          <div><dt>Entregas a tiempo</dt><dd>{onTime.counted ? <>{onTime.onTime}<small> de {onTime.counted}</small></> : '—'}</dd></div>
          <div><dt>Habilidades evaluadas</dt><dd>{skills.length}</dd></div>
        </dl>
        {radar.length >= 3 && <figure className="certificate-radar"><Radar size={260} axes={radar.map(s => name(s.skillId))} series={[{ name: student.name, kind: 'main', values: radar.map(s => s.average) }]} label={`Habilidades: ${radar.map(s => `${name(s.skillId)} ${s.average.toFixed(1)}`).join(', ')}`} /></figure>}
        {skills.length > 0 && <section><h3>Habilidades con evidencia</h3><ul className="certificate-skills">{skills.map(s => <li key={s.skillId}><span>{name(s.skillId)}</span><strong>{s.average.toFixed(1)}</strong><small>{plural(s.count, 'evaluación', 'evaluaciones')}</small></li>)}</ul></section>}
        <section><h3>Actividades terminadas</h3>{done.length ? <ol className="certificate-list">{done.map(a => { const avg = average(a.id); return <li key={a.id}><span><strong>{a.title}</strong><small>{areaName(a.areaId)} · {formatDate(a.updatedAt, { year: 'numeric' })}</small></span>{avg !== null && <span className="certificate-score">{avg.toFixed(1)}</span>}</li>; })}</ol> : <p className="muted">Aún no tiene actividades terminadas{readonly ? '' : ' en tu área'}.</p>}</section>
        <footer className="certificate-foot">
          <div className="certificate-sign"><span />{w.user.name}<small>{readonly ? 'Jefe del laboratorio' : `Responsable de ${areaName(w.user.areaId!)}`}</small></div>
          <p>Emitida el {formatDate(new Date(), { month: 'long', year: 'numeric' })}. Generada por SAG a partir de los registros del laboratorio. Calificaciones de 0 a 10; sin evaluar no equivale a cero.</p>
          <span className="certificate-areas">{student.areaIds.map(id => <AreaTag key={id} id={id} />)}</span>
        </footer>
      </article>
    </div>
    <div className="dialog-foot"><Button variant="secondary" onClick={onClose}>Cerrar</Button><Button onClick={() => window.print()}><Printer size={16} />Imprimir o guardar PDF</Button></div>
  </Modal>;
}
