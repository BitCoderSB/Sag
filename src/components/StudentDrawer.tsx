import { useRef, useState, type FormEvent } from 'react';
import { CalendarPlus, Certificate, Pause, Play, EnvelopeSimple, NotePencil, PencilSimple, Plus, TrendUp, TrendDown, Star, Target, ArrowRight } from '@phosphor-icons/react';
import { useApp } from '../context';
import { pauseOf, PAUSE_LABELS, activitySteps, assignmentProgress, assignmentState, studentStep, cleanDetail, currentAssignment, dueText, formatDate, formatTime, groupSkillAverages, HEALTH, isOpen, plural, post, punctuality, scoped, skillStats, skillTrend, studentHealth } from '../lib';
import { AreaTag, Badge, Button, Drawer, Empty, ErrorMessage, Field, Menu, Meter, Notice, ProgressRing, Radar, StatusAvatar, Steps, Tabs, areaName } from './ui';
import ReviewCard from './ReviewCard';
import { ThesisPanel } from './Thesis';
import StudentPlan, { HoursSummary } from './StudentPlan';
import StudentAction from './StudentAction';

type Tab = 'summary' | 'thesis' | 'story' | 'plan' | 'skills' | 'notes' | 'history';

export default function StudentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { workspace: w, readonly, modal, openAssignment, refresh, toast } = useApp();
  const student = w.students.find(s => s.id === id);
  const own = !!student && student.areaIds.includes(w.user.areaId!); const full = readonly || own; const editable = own && !readonly;
  const [tab, setTab] = useState<Tab>(() => { const s = w.students.find(x => x.id === id); return !full ? 'skills' : s?.thesis && w.user.areaId === 'research' ? 'thesis' : 'summary'; });
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  if (!student) return <Drawer label="Alumno no disponible" onClose={onClose}><div className="drawer-body"><Empty title="No encontramos este expediente" description="Puede que ya no tengas acceso. Cierra el panel y búscalo de nuevo." /></div></Drawer>;
  const scope = scoped(w);
  // Tesis: alumnos de Investigación, para su responsable y el jefe.
  const showThesis = student.areaIds.includes('research') && (w.user.areaId === 'research' || readonly) && (!!student.thesis || w.user.areaId === 'research');
  const pause = pauseOf(student, w.user.areaId);
  const health = studentHealth(scope, student);
  const assignments = w.assignments.filter(a => a.studentId === id);
  const current = currentAssignment(w, id);
  const open = assignments.filter(a => isOpen(a) && a.id !== current?.id).sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
  const closed = assignments.filter(a => !isOpen(a)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const reviews = w.reviews.filter(r => r.studentId === id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const upcoming = reviews.filter(r => r.status === 'scheduled');
  const stats = skillStats(w.evaluations, id);
  const averages = groupSkillAverages(w.evaluations);
  const notes = w.notes.filter(n => n.studentId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const entityIds = new Set([id, ...assignments.map(a => a.id), ...reviews.map(r => r.id)]);
  const history = w.audit.filter(a => entityIds.has(a.entityId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tabs: { id: Tab; label: string; count?: number }[] = full ? [{ id: 'summary', label: 'Resumen' }, ...(showThesis ? [{ id: 'thesis' as const, label: 'Tesis' }] : []), { id: 'story', label: 'Historia', count: assignments.filter(a => a.status !== 'cancelled').length }, { id: 'plan', label: 'Plan' }, { id: 'skills', label: 'Habilidades', count: stats.length }, { id: 'notes', label: 'Notas', count: notes.length }, { id: 'history', label: 'Historial' }] : [{ id: 'skills', label: 'Habilidades', count: stats.length }];
  const skillName = (skillId: string) => w.skills.find(k => k.id === skillId)?.name ?? 'Habilidad';
  const best = stats[0]; const weakest = stats.length > 1 ? stats[stats.length - 1] : undefined;
  const onTime = punctuality(w, id);
  const totalOpen = student.openAssignmentCount ?? assignments.filter(isOpen).length;
  const evaluatedAverage = (assignmentId: string) => { const e = w.evaluations.find(x => x.assignmentId === assignmentId && x.current); const scores = e?.scores.filter(s => s.score !== null).map(s => s.score!) ?? []; return scores.length ? scores.reduce((n, v) => n + v, 0) / scores.length : null; };
  async function saveNote(e: FormEvent) {
    e.preventDefault(); if (lock.current || !note.trim()) return; lock.current = true; setBusy(true); setError('');
    try { await post('/notes', { studentId: id, text: note.trim() }); await refresh(); setNote(''); toast('Nota guardada.'); }
    catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }

  // Perfil de habilidades: hasta 8 ejes, los de más evidencia, en el orden del catálogo para que la forma sea estable.
  const radarSkills = [...stats].sort((a, b) => b.count - a.count).slice(0, 8).sort((a, b) => w.skills.findIndex(k => k.id === a.skillId) - w.skills.findIndex(k => k.id === b.skillId));
  const profile = radarSkills.length >= 3 ? <figure className="radar-figure">
    <Radar axes={radarSkills.map(s => skillName(s.skillId))} label={`Perfil de habilidades de ${student.name}: ${radarSkills.map(s => `${skillName(s.skillId)} ${s.average.toFixed(1)}`).join(', ')}`}
      series={[{ name: 'Promedio del laboratorio', kind: 'reference', values: radarSkills.map(s => averages.get(s.skillId) ?? null) }, { name: student.name, kind: 'main', values: radarSkills.map(s => s.average) }]} />
    <figcaption className="radar-legend"><span><i className="legend-line legend-main" />{student.name.split(' ')[0]}</span><span><i className="legend-line legend-reference" />Promedio del laboratorio</span></figcaption>
  </figure> : stats.length ? <ul className="skill-bars">{stats.map(s => <li key={s.skillId}><span>{skillName(s.skillId)}</span><Meter value={s.average} /><strong>{s.average.toFixed(1)}</strong></li>)}</ul> : null;

  return <Drawer label={student.name} onClose={onClose}>
    <header className="drawer-head student-profile-head">
      <StatusAvatar name={student.name} avatar={student.avatar} health={health} size="xl" />
      <div className="drawer-head-text">
        <h2>{student.name}</h2>
        <p>{[student.registration, student.career, student.semester].filter(Boolean).join(' · ')}</p>
        <div className="tag-row">{student.areaIds.map(areaId => <AreaTag key={areaId} id={areaId} />)}{full && <Badge tone={HEALTH[health].tone} dot={HEALTH[health].dot}>{HEALTH[health].label}</Badge>}</div>
      </div>
    </header>
    {editable && <div className="drawer-actions">
      {student.status === 'active' && !pause && <StudentAction student={student} full size="md" primary />}
      {student.status === 'active' && !pause && studentStep(scope, student).kind !== 'assign' && <Button variant="secondary" title="Asignar otra actividad" onClick={() => modal({ type: 'assignment', studentId: id })}><Plus size={16} weight="bold" />Actividad</Button>}
      {student.status === 'active' && <Button variant="secondary" title="Programar revisión" onClick={() => modal({ type: 'review', studentId: id })}><CalendarPlus size={16} />Revisión</Button>}
      <Menu label="Más acciones" items={[{ label: 'Editar expediente', icon: <PencilSimple size={16} />, onSelect: () => modal({ type: 'student', student }) }, { label: 'Generar constancia', icon: <Certificate size={16} />, onSelect: () => modal({ type: 'certificate', studentId: id }) },
        pause ? { label: 'Retomar participación', icon: <Play size={16} />, onSelect: () => modal({ type: 'resume', student }) } : { label: 'Pausar participación', icon: <Pause size={16} />, onSelect: () => modal({ type: 'pause', student }) }]} />
    </div>}
    {pause && <div className="pause-banner"><Pause size={16} weight="fill" aria-hidden="true" /><span><strong>En pausa en tu área · {PAUSE_LABELS[pause.kind]}</strong><small>Desde {formatDate(pause.since)} · {pause.returnAt ? `regresa el ${formatDate(`${pause.returnAt}T12:00:00-06:00`, { weekday: 'short' })}` : 'sin fecha de regreso'}{pause.reason ? ` · ${pause.reason}` : ''}</small></span>{editable && <Button size="sm" variant="secondary" onClick={() => modal({ type: 'resume', student })}>Retomar</Button>}</div>}
    {readonly && <div className="drawer-actions"><Button variant="secondary" onClick={() => modal({ type: 'certificate', studentId: id })}><Certificate size={16} />Generar constancia</Button></div>}
    {tabs.length > 1 && <Tabs value={tab} onChange={setTab} tabs={tabs} label="Secciones del expediente" idPrefix="student-tab" panelId="student-panel" />}
    <div key={tab} className="drawer-body tab-panel" role="tabpanel" id="student-panel" aria-labelledby={`student-tab-${tab}`}>
      {!full && <Notice tone="info"><p>Participa en {student.areaIds.map(areaName).join(' y ')}. Para trabajar con este alumno, coordina con su responsable.</p></Notice>}

      {tab === 'summary' && full && <>
        <section className="highlights" aria-label="Lo importante">
          <div className="highlight highlight-now">
            <span className="highlight-label">Ahora{current && (() => { const st = assignmentState(current, w); return <Badge tone={st.tone} dot>{st.label}</Badge>; })()}</span>
            {current ? <button type="button" className="highlight-now-body" onClick={() => openAssignment(current.id)}>
              <span className="highlight-title">{current.title}</span>
              <span className="highlight-now-row"><Steps {...activitySteps(current, w)} size="lg" /></span>
              <span className="highlight-sub">{dueText(current)}</span>
              {(() => { const p = assignmentProgress(current, w); return p !== null ? <span className="highlight-progress"><span className="progress-preview"><span style={{ width: `${p}%` }} /></span><small>{p} %</small></span> : null; })()}
            </button> : <p className="highlight-title muted">Sin actividad abierta{readonly ? '' : ' en tu área'}</p>}
            <span className="highlight-foot">{totalOpen === 0 ? 'Sin trabajo abierto en ninguna área' : `${plural(totalOpen, 'actividad abierta', 'actividades abiertas')} en total`}</span>
          </div>
          <div className="highlight tone-ok">
            <span className="highlight-label"><Star size={13} weight="fill" aria-hidden="true" />Destaca en</span>
            {best ? <><span className="highlight-title">{skillName(best.skillId)}</span><span className="highlight-score">{best.average.toFixed(1)}<small>/10</small></span></> : <span className="highlight-sub">Aún sin evaluar</span>}
          </div>
          <div className="highlight tone-warn">
            <span className="highlight-label"><Target size={13} weight="bold" aria-hidden="true" />Puede mejorar en</span>
            {weakest ? <><span className="highlight-title">{skillName(weakest.skillId)}</span><span className="highlight-score">{weakest.average.toFixed(1)}<small>/10</small></span></> : <span className="highlight-sub">Hace falta más evidencia</span>}
          </div>
          <div className="highlight tone-info">
            <span className="highlight-label">Entrega a tiempo</span>
            {onTime.counted ? <span className="highlight-ring"><ProgressRing value={onTime.onTime} total={onTime.counted} tone={onTime.onTime / onTime.counted >= .8 ? 'ok' : 'warn'} /><span><strong>{onTime.onTime} de {onTime.counted}</strong><small>con fecha límite</small></span></span> : <span className="highlight-sub">Sin entregas con fecha límite</span>}
          </div>
        </section>

        {student.hoursRequired ? <section className="drawer-section"><h3>Horas<button type="button" className="text-link" onClick={() => setTab('plan')}>Ver plan<ArrowRight size={13} /></button></h3><HoursSummary w={scope} student={student} /></section> : null}
        {profile && <section className="drawer-section">
          <h3>Habilidades<button type="button" className="text-link" onClick={() => setTab('skills')}>Ver evidencia<ArrowRight size={13} /></button></h3>
          {profile}
        </section>}
        <section className="drawer-section">
          <h3>Próximas revisiones<span className="count">{upcoming.length}</span></h3>
          {upcoming.length ? <div className="stack">{upcoming.map(r => <ReviewCard key={r.id} review={r} withDate showStudent={false} />)}</div> : <p className="drawer-empty">Sin revisiones programadas.</p>}
        </section>
        {open.length > 0 && <section className="drawer-section">
          <h3>También tiene abiertas<span className="count">{open.length}</span></h3>
          <ul className="item-list">{open.map(a => { const state = assignmentState(a, w); return <li key={a.id}><button type="button" className="item" onClick={() => openAssignment(a.id)}>
            <span className="item-text"><strong>{a.title}</strong><small>{dueText(a)}{readonly ? ` · ${areaName(a.areaId)}` : ''}</small></span>
            <Steps {...activitySteps(a, w)} />
            <Badge tone={state.tone}>{state.label}</Badge>
          </button></li>; })}</ul>
        </section>}
        {closed.length > 0 && <section className="drawer-section">
          <h3>Terminadas<span className="count">{closed.length}</span></h3>
          <ul className="item-list">{closed.slice(0, 6).map(a => { const state = assignmentState(a, w); const avg = evaluatedAverage(a.id); return <li key={a.id}><button type="button" className="item" onClick={() => openAssignment(a.id)}>
            <span className="item-text"><strong>{a.title}</strong><small>{formatDate(a.updatedAt, { year: 'numeric' })}</small></span>
            {avg !== null ? <span className="item-score" title="Promedio de la evaluación">{avg.toFixed(1)}</span> : <Badge tone={state.tone}>{state.label}</Badge>}
          </button></li>; })}</ul>
        </section>}
        <section className="drawer-section">
          <h3>Datos</h3>
          <dl className="facts">
            {student.email && <><dt>Correo</dt><dd><a href={`mailto:${student.email}`}><EnvelopeSimple size={14} aria-hidden="true" />{student.email}</a></dd></>}
            {student.modalities.length > 0 && <><dt>Modalidad</dt><dd>{student.modalities.join(', ')}</dd></>}
            <dt>Tecnologías</dt><dd>{student.technologies.length ? <span className="tag-row">{student.technologies.map(t => <span className="chip" key={t}>{t}</span>)}</span> : <span className="muted">Sin registrar</span>}</dd>
            <dt>Alta</dt><dd>{formatDate(student.createdAt, { year: 'numeric' })}</dd>
          </dl>
        </section>
      </>}

      {tab === 'thesis' && full && showThesis && <ThesisPanel student={student} />}
      {tab === 'story' && full && <StudentStory studentId={id} />}
      {tab === 'plan' && full && <StudentPlan student={student} />}

      {tab === 'skills' && (stats.length ? <>
        {radarSkills.length >= 3 && <section className="drawer-section">{profile}</section>}
        <ul className="skill-detail-list">{stats.map(s => {
          const evaluations = w.evaluations.filter(e => e.studentId === id && e.current && e.scores.some(v => v.skillId === s.skillId && v.score !== null));
          const trend = skillTrend(w.evaluations, id, s.skillId); const avg = averages.get(s.skillId);
          return <li key={s.skillId} className="skill-detail">
            <div className="skill-detail-head">
              <strong>{skillName(s.skillId)}</strong>
              {trend !== null && Math.abs(trend) >= .1 && <span className={`trend ${trend > 0 ? 'trend-up' : 'trend-down'}`} title="Cambio respecto a la evaluación anterior">{trend > 0 ? <TrendUp size={13} weight="bold" /> : <TrendDown size={13} weight="bold" />}{trend > 0 ? '+' : ''}{trend.toFixed(1)}</span>}
              <span className="score">{s.average.toFixed(1)}</span>
            </div>
            <span className="meter-compare"><Meter value={s.average} />{avg !== undefined && <i className="meter-mark" style={{ left: `${avg * 10}%` }} title={`Promedio del laboratorio: ${avg.toFixed(1)}`} />}</span>
            <small>{plural(s.count, 'evaluación', 'evaluaciones')} · última {formatDate(s.latest, { year: 'numeric' })}{avg !== undefined ? ` · promedio del laboratorio ${avg.toFixed(1)}` : ''}</small>
            <details className="evidence"><summary>Ver evidencia</summary>
              <ul>{evaluations.map(e => { const score = e.scores.find(v => v.skillId === s.skillId)!; const assignment = w.assignments.find(a => a.id === e.assignmentId); return <li key={e.id}>
                <span className="evidence-score">{score.score?.toFixed(1)}</span>
                <span className="evidence-text">{assignment ? <button type="button" className="link-strong" onClick={() => openAssignment(assignment.id)}>{assignment.title}</button> : <strong>Actividad de {areaName(e.areaId)}</strong>}<small>{e.evaluatorName} · {formatDate(e.createdAt, { year: 'numeric' })}</small>{score.comment && <span>{score.comment}</span>}</span>
              </li>; })}</ul>
            </details>
          </li>;
        })}</ul>
      </> : <Empty title="Sin habilidades evaluadas" description="Aparecerán al evaluar sus actividades. Sin evaluar no es lo mismo que cero." />)}

      {tab === 'notes' && full && <>
        {editable && <form className="note-form" onSubmit={saveNote}>
          <ErrorMessage message={error} />
          <Field label="Nueva nota" hint="La ven tú y el jefe."><textarea required rows={3} value={note} maxLength={5000} onChange={e => setNote(e.target.value)} placeholder="Un avance, un acuerdo o algo a dar seguimiento" /></Field>
          <Button type="submit" size="sm" loading={busy} disabled={!note.trim()}><NotePencil size={15} />Guardar nota</Button>
        </form>}
        {notes.length ? <ul className="notes">{notes.map(n => <li key={n.id} className="note">
          <div className="note-meta"><strong>{n.authorName}</strong><span>{formatDate(n.createdAt, { year: 'numeric' })}, {formatTime(n.createdAt)}</span>{readonly && <AreaTag id={n.areaId} compact />}</div>
          <p>{n.text}</p>
        </li>)}</ul> : <p className="drawer-empty">Sin notas todavía.</p>}
      </>}

      {tab === 'history' && full && <>
        {reviews.some(r => r.status !== 'scheduled') && <section className="drawer-section">
          <h3>Revisiones anteriores</h3>
          <div className="stack">{reviews.filter(r => r.status !== 'scheduled').reverse().map(r => <ReviewCard key={r.id} review={r} withDate showStudent={false} />)}</div>
        </section>}
        <section className="drawer-section">
          <h3>Cambios</h3>
          {history.length ? <ol className="history">{history.map(event => <li key={event.id}><p>{cleanDetail(event.detail)}</p><small>{event.actorName} · {formatDate(event.createdAt, { year: 'numeric' })}, {formatTime(event.createdAt)}</small></li>)}</ol> : <p className="drawer-empty">Sin cambios registrados.</p>}
        </section>
      </>}
    </div>
  </Drawer>;
}

/** Historia del alumno: su recorrido como tablero. Columnas por fase (si las usa) o por mes; cada tarjeta con su resultado. */
function StudentStory({ studentId }: { studentId: string }) {
  const { workspace: w, openAssignment } = useApp();
  const list = w.assignments.filter(a => a.studentId === studentId && a.status !== 'cancelled').sort((a, b) => (a.startAt ?? a.createdAt).localeCompare(b.startAt ?? b.createdAt));
  if (!list.length) return <Empty title="Aún no hay historia" description="Cuando tenga actividades, aquí verás su recorrido por fase o por mes." />;
  const byPhase = list.some(a => a.phase);
  const keyOf = (a: typeof list[number]) => byPhase ? (a.phase || 'Sin fase') : formatDate(a.startAt ?? a.createdAt, { day: undefined, month: 'long', year: 'numeric' });
  const groups = [...new Set(list.map(keyOf))].map(k => ({ key: k, items: list.filter(a => keyOf(a) === k) }));
  const done = list.filter(a => a.status === 'completed').length;
  return <div className="story">
    <p className="story-summary"><strong>{done} de {list.length}</strong> actividades terminadas · agrupadas por {byPhase ? 'fase' : 'mes'}</p>
    <div className="story-board">{groups.map(g => <section key={g.key} className="story-col" aria-label={g.key}>
      <header><strong>{g.key}</strong><span className="count">{g.items.length}</span><small>{g.items.filter(a => a.status === 'completed').length} terminadas</small></header>
      {g.items.map(a => { const st = assignmentState(a, w); const ev = w.evaluations.find(e => e.assignmentId === a.id && e.current); const scores = ev?.scores.filter(s => s.score !== null).map(s => s.score!) ?? []; const avg = scores.length ? scores.reduce((n, v) => n + v, 0) / scores.length : null;
        return <button type="button" key={a.id} className={`story-card tone-${st.tone}`} onClick={() => openAssignment(a.id)}>
          <Badge tone={st.tone} dot>{st.label}</Badge>
          <strong>{a.title}</strong>
          <small>{formatDate(a.startAt ?? a.createdAt)} → {a.status === 'completed' ? formatDate(a.updatedAt) : a.dueAt ? formatDate(a.dueAt) : 'sin fecha'}</small>
          {avg !== null && <span className="story-score"><Meter value={avg} /><b>{avg.toFixed(1)}</b></span>}
        </button>; })}
    </section>)}</div>
  </div>;
}
