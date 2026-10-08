import { useEffect, useState, type ReactNode } from 'react';
import { CalendarCheck, CrosshairSimple, Printer, X } from '@phosphor-icons/react';
import type { AreaId } from '../../shared/types';
import { phaseInfo, STEP_LABEL } from '../../shared/thesis';
import { useApp } from '../context';
import { dayDiff, formatDate, hoursProgress, isOpen, plural, scoped, studentHealth, studentPeriod } from '../lib';
import { Avatar, Button, Empty, IconButton, Segmented } from '../components/ui';
import StudentPlan, { ganttReturn, setGanttReturn, thesisSchedule } from '../components/StudentPlan';
import { Timeline } from './Students';
import type { GanttScale } from '../components/Gantt';

const SCALES: { value: GanttScale; label: string }[] = [{ value: 'week', label: 'Días' }, { value: 'month', label: 'Semanas' }, { value: 'quarter', label: 'Meses' }, { value: 'fit', label: 'Todo' }];
function useScale(): [GanttScale, (s: GanttScale) => void] {
  const [scale, setScale] = useState<GanttScale>(() => { try { const v = localStorage.getItem('sag-gantt-scale') as GanttScale | null; return v && SCALES.some(s => s.value === v) ? v : 'month'; } catch { return 'month'; } });
  return [scale, s => { try { localStorage.setItem('sag-gantt-scale', s); } catch { /* sin almacenamiento */ } setScale(s); }];
}

/** Dato destacado de la cabecera. */
function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'ok' | 'info' }) {
  return <div className={`gv-stat ${tone ? `is-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

/**
 * Vista ampliada del Gantt (se abre en otra pestaña con «Expandir»): pantalla completa, escala por días, semanas o
 * meses, plan contra real y datos clave arriba. Sirve para revisar el cronograma de un alumno o el de todos.
 */
export default function GanttView() {
  const app = useApp(); const w = app.workspace;
  const [scale, setScale] = useScale(); const [focus, setFocus] = useState(0);
  const student = w.students.find(s => s.id === app.params.get('student'));
  // Regresa a donde se abrió (y reabre el expediente si venía de ahí); con un enlace directo, a Alumnos.
  const close = () => {
    const from = ganttReturn; setGanttReturn(null);
    if (from) { history.back(); if (from.studentId) { const id = from.studentId; setTimeout(() => app.openStudent(id), 60); } }
    else app.navigate('students', student ? {} : { v: 'timeline' });
  };
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"], .drawer')) close(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });
  const tools = <div className="gv-tools">
    <Segmented label="Escala" value={scale} onChange={setScale} options={SCALES} />
    <Button variant="secondary" size="sm" onClick={() => setFocus(f => f + 1)} disabled={scale === 'fit'}><CrosshairSimple size={15} />Hoy</Button>
    <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={15} />Imprimir</Button>
  </div>;
  const closeButton = <IconButton className="gv-close" label="Cerrar vista ampliada" onClick={close}><X size={18} /></IconButton>;

  if (app.params.get('student') && !student) return <div className="gv"><header className="gv-head">{closeButton}</header><Empty title="No encontramos a este alumno" description="Puede que ya no esté en tu área." /></div>;

  if (student) {
    const t = student.thesis; const sched = thesisSchedule(student); const period = studentPeriod(w, student); const h = hoursProgress(w, student);
    const open = w.assignments.filter(a => a.studentId === student.id && isOpen(a)).length;
    const docs = (w.thesisDocs ?? []).filter(d => d.studentId === student.id).length;
    return <div className="gv">
      <header className="gv-head">
        {closeButton}
        <div className="gv-title"><Avatar name={student.name} avatar={student.avatar} size="lg" /><div><h1>{student.name}</h1><p>{t ? t.topic || 'Tesis sin tema' : `${student.registration}${student.career ? ` · ${student.career}` : ''}`}</p></div></div>
        {tools}
      </header>
      <div className="gv-stats">
        {t ? <>
          <Stat label={`Fase ${phaseInfo(t.phase).n} de 10`} value={phaseInfo(t.phase).short} sub={STEP_LABEL[t.step]} tone="info" />
          {sched ? <>
            <Stat label="Según su cronograma" value={sched.expected ? phaseInfo(sched.expected).short : '—'} sub={sched.ahead ? 'Va adelantado' : sched.expected === t.phase ? 'Va en la fase planeada' : 'Debería ir aquí'} tone={sched.ahead || sched.expected === t.phase ? 'ok' : undefined} />
            <Stat label="Atraso de la fase actual" value={sched.delay ? plural(sched.delay, 'día', 'días') : 'A tiempo'} sub={sched.delay ? 'Después del fin planeado' : 'Dentro de lo planeado'} tone={sched.delay ? 'warn' : 'ok'} />
            <Stat label="Defensa planeada" value={formatDate(new Date(sched.defense), { year: 'numeric' })} sub={dayDiff(new Date(sched.defense)) >= 0 ? `En ${plural(dayDiff(new Date(sched.defense)), 'día', 'días')}` : 'Fecha pasada'} />
          </> : <Stat label="Cronograma" value="Sin cargar" sub="Sube su cronograma .xlsx en la pestaña Tesis" />}
          <Stat label="Documentos" value={docs} sub={docs ? 'En su expediente de tesis' : 'Sin documentos'} />
        </> : <>
          <Stat label="Actividades abiertas" value={open} />
          {h && <Stat label="Horas" value={`${h.done} de ${h.required} h`} sub={h.complete ? 'Completas' : h.behind ? 'Va atrasado' : 'A buen ritmo'} tone={h.complete ? 'ok' : h.behind ? 'warn' : 'info'} />}
          <Stat label="Periodo" value={`${formatDate(`${period.start}T12:00:00-06:00`)} – ${period.end ? formatDate(`${period.end}T12:00:00-06:00`, { year: 'numeric' }) : 'sin fin'}`} sub={period.explicit ? 'Registrado en su expediente' : 'Estimado por sus actividades'} />
        </>}
      </div>
      <section className="gv-chart"><StudentPlan student={student} size="full" scale={scale} key={focus} /></section>
    </div>;
  }

  const area = (app.params.get('area') as AreaId | null) ?? 'all'; const status = app.params.get('status') ?? 'active';
  const sw = scoped(w, area);
  const rows = sw.students.filter(s => status === 'all' || s.status === status).map(s => ({ s, health: studentHealth(sw, s) })).sort((a, b) => a.s.name.localeCompare(b.s.name));
  const theses = rows.filter(r => r.s.thesis).length; const late = rows.filter(r => (thesisSchedule(r.s)?.delay ?? 0) > 0).length;
  const ending = rows.filter(r => { const end = studentPeriod(sw, r.s).end; return end && dayDiff(`${end}T12:00:00-06:00`) >= 0 && dayDiff(`${end}T12:00:00-06:00`) <= 30; }).length;
  return <div className="gv">
    <header className="gv-head">
      {closeButton}
      <div className="gv-title"><span className="gv-icon" aria-hidden="true"><CalendarCheck size={22} /></span><div><h1>Cronograma de alumnos</h1><p>{status === 'active' ? 'Activos' : 'Todos'}{area !== 'all' ? ` · ${w.areas.find(a => a.id === area)?.name}` : ''}</p></div></div>
      {tools}
    </header>
    <div className="gv-stats">
      <Stat label="Alumnos" value={rows.length} />
      {theses > 0 && <Stat label="Tesistas" value={theses} sub={late ? `${late} con atraso según su cronograma` : 'Todos a tiempo'} tone={late ? 'warn' : 'ok'} />}
      <Stat label="Terminan en 30 días" value={ending} />
      <Stat label="Entregas abiertas" value={sw.assignments.filter(a => isOpen(a) && a.dueAt && rows.some(r => r.s.id === a.studentId)).length} />
    </div>
    <section className="gv-chart"><Timeline w={sw} rows={rows} onOpen={app.openStudent} size="full" scale={scale} key={focus} /></section>
  </div>;
}
