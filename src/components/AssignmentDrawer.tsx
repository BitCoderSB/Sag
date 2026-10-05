import { useRef, useState, type ReactNode } from 'react';
import { ArrowRight, TrendUp, CalendarPlus, ClipboardText, DownloadSimple, Exam, File, LinkSimple, PencilSimple, UploadSimple, X, XCircle, WarningCircle, CheckCircle, Clock, Prohibit } from '@phosphor-icons/react';
import { useApp } from '../context';
import { activitySteps, assignmentProgress, scoreLevel, api, assignmentState, cleanDetail, dueText, fileSize, formatDate, formatTime, isLate, isOpen, relativeDay, safeUrl, patch, linkLabel, MAX_FILE, FILE_TYPES, toHttpUrl } from '../lib';
import { AreaTag, Avatar, Badge, Button, Drawer, Empty, ErrorMessage, ExternalLink, IconButton, Menu, Meter, Segmented, Steps, Tabs } from './ui';
import ReviewCard from './ReviewCard';

type Tab = 'detail' | 'deliveries' | 'evaluations' | 'history';

export default function AssignmentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { workspace: w, readonly, openStudent, modal, refresh, toast } = useApp();
  const assignment = w.assignments.find(a => a.id === id);
  const [tab, setTab] = useState<Tab>('detail');
  const [fileKind, setFileKind] = useState<'instruction' | 'evidence'>('instruction'); const [newLink, setNewLink] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const lock = useRef(false); const fileInput = useRef<HTMLInputElement>(null);
  if (!assignment) return <Drawer label="Actividad no disponible" onClose={onClose}><div className="drawer-body"><Empty title="No encontramos la actividad" description="Puede que ya no tengas acceso. Cierra el panel e inténtalo de nuevo." /></div></Drawer>;
  const student = w.students.find(s => s.id === assignment.studentId);
  const editable = !readonly && assignment.areaId === w.user.areaId; const active = isOpen(assignment);
  const deliveries = w.deliveries.filter(d => d.assignmentId === id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const complete = deliveries.find(d => d.completeness === 'complete');
  const noDelivery = deliveries.some(d => d.completeness === 'not_submitted');
  const evaluations = w.evaluations.filter(e => e.assignmentId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const currentEval = evaluations.find(e => e.current);
  const attachments = w.attachments.filter(a => a.assignmentId === id);
  const reviews = w.reviews.filter(r => r.assignmentId === id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const history = w.audit.filter(a => a.entityId === id || reviews.some(r => r.id === a.entityId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const state = assignmentState(assignment, w);
  const steps = activitySteps(assignment, w);
  const late = isLate(assignment, w);
  const tabs: { id: Tab; label: string; count?: number }[] = [{ id: 'detail', label: 'Detalle' }, { id: 'deliveries', label: 'Entregas', count: deliveries.length }, { id: 'evaluations', label: 'Evaluaciones', count: evaluations.length }, { id: 'history', label: 'Historial' }];
  const deliver = () => modal({ type: 'progress', assignment });
  const evaluate = () => modal({ type: 'evaluate', assignment });
  const edit = () => modal({ type: 'assignmentEdit', assignment, mode: 'edit' });

  // Siguiente paso: qué falta y el botón exacto para hacerlo.
  let next: { tone: string; icon: ReactNode; text: string; action?: ReactNode } | null = null;
  if (assignment.status === 'cancelled') next = { tone: 'neutral', icon: <Prohibit size={18} />, text: 'Actividad cancelada. Su historial se conserva.' };
  else if (assignment.status === 'completed') next = { tone: 'ok', icon: <CheckCircle size={18} weight="fill" />, text: currentEval ? `Terminada. La evaluó ${currentEval.evaluatorName} ${relativeDay(currentEval.createdAt)}.` : 'Terminada.', action: <Button size="sm" variant="secondary" onClick={() => setTab('evaluations')}>Ver evaluación</Button> };
  else if (assignment.status === 'pending_review') next = { tone: 'info', icon: <Exam size={18} weight="fill" />, text: `Entregó ${complete ? relativeDay(complete.receivedAt) : ''}. Falta evaluarla.`, action: editable && <Button size="sm" onClick={evaluate}>Evaluar actividad</Button> };
  else if (late && noDelivery) next = { tone: 'warn', icon: <WarningCircle size={18} weight="fill" />, text: 'No entregó. Amplía la fecha de entrega o cancela la actividad.', action: editable && <Button size="sm" variant="secondary" onClick={edit}>Cambiar fecha</Button> };
  else if (late) next = { tone: 'warn', icon: <WarningCircle size={18} weight="fill" />, text: `${dueText(assignment)} y no hay entrega registrada. Confirma con el alumno.`, action: editable && <Button size="sm" onClick={deliver}><TrendUp size={14} weight="bold" />Registrar entrega</Button> };
  else if (assignment.status === 'changes_requested') next = { tone: 'neutral', icon: <Clock size={18} />, text: 'Está corrigiendo. Registra la nueva entrega cuando la presente.', action: editable && <Button size="sm" onClick={deliver}><TrendUp size={14} weight="bold" />Registrar entrega</Button> };
  else { const p = assignmentProgress(assignment, w); next = { tone: 'neutral', icon: <Clock size={18} />, text: `El alumno está trabajando${p !== null ? `, lleva ${p} %` : ''}. ${dueText(assignment)}.`, action: editable && <Button size="sm" onClick={deliver}><TrendUp size={14} weight="bold" />Registrar avance</Button> }; }

  // Varios documentos a la vez: se suben uno por uno y se informa cuáles fallaron.
  async function upload(list: FileList | null) {
    const picked = [...(list ?? [])]; if (!picked.length || lock.current) return;
    const tooBig = picked.filter(f => f.size > MAX_FILE).map(f => f.name);
    lock.current = true; setBusy(true); setError('');
    const failed: string[] = []; let uploaded = 0;
    for (const file of picked.filter(f => f.size <= MAX_FILE)) {
      const data = new FormData(); data.append('kind', fileKind); data.append('file', file);
      try { await api(`/assignments/${id}/files`, { method: 'POST', body: data }); uploaded++; }
      catch (e) { failed.push(`${file.name} (${(e as Error).message})`); }
    }
    try { await refresh(); } catch { /* la vista se actualizará en la siguiente recarga */ }
    if (uploaded) toast(uploaded === 1 ? 'Documento subido.' : `${uploaded} documentos subidos.`);
    const problems = [...tooBig.map(n => `${n} pesa más de 10 MB`), ...failed];
    if (problems.length) setError(`No se subió: ${problems.join('; ')}.`);
    lock.current = false; setBusy(false); if (fileInput.current) fileInput.current.value = '';
  }
  // Enlaces (por ejemplo, la carpeta de Drive de la actividad): se añaden o quitan sin abrir otro formulario.
  async function saveLinks(links: { label: string; url: string }[], message: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await patch(`/assignments/${id}`, { version: assignment!.version, links }); await refresh(); toast(message); setNewLink(''); }
    catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  function addLink() {
    if (!newLink.trim()) return;
    const url = toHttpUrl(newLink);
    if (!url) { setError('El enlace no es válido. Pégalo completo.'); return; }
    saveLinks([...assignment!.links, { label: linkLabel(url), url }], 'Enlace añadido.');
  }
  const menuItems = editable ? [
    ...(active ? [{ label: 'Editar actividad', icon: <PencilSimple size={16} />, onSelect: edit }] : []),
    ...(assignment.status !== 'cancelled' && student?.status === 'active' ? [{ label: 'Programar revisión', icon: <CalendarPlus size={16} />, onSelect: () => modal({ type: 'review', studentId: assignment.studentId, assignmentId: id }) }] : []),
    ...(complete && assignment.status !== 'cancelled' && assignment.status !== 'pending_review' ? [{ label: 'Nueva evaluación', icon: <Exam size={16} />, onSelect: evaluate }] : []),
    ...(active ? ['separator' as const, { label: 'Cancelar actividad', icon: <XCircle size={16} />, danger: true, onSelect: () => modal({ type: 'assignmentEdit', assignment, mode: 'cancel' }) }] : []),
  ] : [];

  return <Drawer label={assignment.title} onClose={onClose}>
    <header className="drawer-head assignment-profile-head">
      <div className="drawer-head-text">
        <div className="tag-row"><Badge tone={state.tone} dot>{state.label}</Badge>{readonly && <AreaTag id={assignment.areaId} />}</div>
        <h2>{assignment.title}</h2>
        <button type="button" className="person-link" onClick={() => openStudent(assignment.studentId)}><Avatar name={student?.name ?? 'Alumno'} avatar={student?.avatar} size="sm" />{student?.name ?? 'Ver alumno'}<ArrowRight size={13} aria-hidden="true" /></button>
      </div>
      {menuItems.length > 0 && <Menu label="Más acciones de la actividad" items={menuItems} />}
    </header>
    <div className="drawer-steps"><Steps steps={steps.steps} label={steps.label} size="lg" /></div>
    {next && <div key={`${assignment.status}-${next.text}`} className={`next-step tone-${next.tone}`}>{next.icon}<p>{next.text}</p>{next.action}</div>}
    <Tabs value={tab} onChange={setTab} tabs={tabs} label="Secciones de la actividad" idPrefix="assignment-tab" panelId="assignment-panel" />
    <div key={tab} className="drawer-body tab-panel" role="tabpanel" id="assignment-panel" aria-labelledby={`assignment-tab-${tab}`}>
      <ErrorMessage message={error} />
      {tab === 'detail' && <>
        {assignment.blockedReason && active && <div className="next-step tone-danger"><WarningCircle size={18} weight="fill" /><p><strong>Impedimento:</strong> {assignment.blockedReason}</p>{editable && <Button size="sm" variant="secondary" onClick={edit}>Actualizar</Button>}</div>}
        <dl className="facts facts-inline">
          <dt>Fecha límite</dt><dd>{assignment.dueAt ? `${formatDate(assignment.dueAt, { weekday: 'short', year: 'numeric' })}, ${formatTime(assignment.dueAt)}` : 'Sin fecha'}</dd>
          <dt>Asignada</dt><dd>{formatDate(assignment.createdAt, { year: 'numeric' })}</dd>
        </dl>
        <section className="drawer-section">
          <h3>Qué debe hacer y entregar</h3>
          <p className="prose">{assignment.description || <span className="muted">Sin instrucciones escritas.</span>}</p>
        </section>
        <section className="drawer-section">
          <h3>Habilidades a evaluar</h3>
          <span className="tag-row">{assignment.skillIds.map(skillId => <span className="chip" key={skillId}>{w.skills.find(s => s.id === skillId)?.name ?? skillId}</span>)}</span>
        </section>
        <section className="drawer-section">
          <h3>Material<span className="count">{assignment.links.length + attachments.length}</span></h3>
          {(assignment.links.length > 0 || attachments.length > 0) && <ul className="files">
            {assignment.links.map((l, i) => { const url = safeUrl(l.url); return url && <li key={`l${i}`}><LinkSimple size={16} aria-hidden="true" /><ExternalLink url={url}>{l.label}</ExternalLink>{editable && assignment.status !== 'cancelled' && <IconButton className="file-remove" label={`Quitar ${l.label}`} disabled={busy} onClick={() => saveLinks(assignment.links.filter((_, n) => n !== i), 'Enlace quitado.')}><X size={14} /></IconButton>}</li>; })}
            {attachments.map(a => <li key={a.id}><File size={16} aria-hidden="true" /><a href={`/api/files/${a.id}`} download className="file-link"><span>{a.name}</span><small>{a.kind === 'instruction' ? 'Instrucciones' : 'Evidencia'} · {fileSize(a.size)}</small><DownloadSimple size={15} aria-hidden="true" /></a></li>)}
          </ul>}
          {!assignment.links.length && !attachments.length && <p className="drawer-empty">Sin material.</p>}
          {editable && assignment.status !== 'cancelled' && <div className="material-add">
            <div className="material-link-add">
              <LinkSimple size={16} aria-hidden="true" />
              <input type="text" inputMode="url" autoComplete="off" spellCheck={false} aria-label="Pegar enlace" value={newLink} maxLength={2000} onChange={e => setNewLink(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} placeholder="Pega un enlace de Drive u otro sitio" />
              <Button variant="secondary" size="sm" disabled={!newLink.trim()} loading={busy} onClick={addLink}>Añadir</Button>
            </div>
            <div className="upload">
              <Segmented label="Tipo de archivo" value={fileKind} onChange={setFileKind} options={[{ value: 'instruction', label: 'Instrucciones' }, { value: 'evidence', label: 'Evidencia' }]} />
              <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label="Elegir archivo" accept={FILE_TYPES} multiple onChange={e => upload(e.target.files)} />
              <Button variant="secondary" size="sm" loading={busy} onClick={() => fileInput.current?.click()}><UploadSimple size={15} />Subir documentos</Button>
              <small className="field-hint">PDF, imagen, texto u Office, hasta 10 MB.</small>
            </div>
          </div>}
        </section>
        <section className="drawer-section">
          <h3>Revisiones<span className="count">{reviews.length}</span></h3>
          {reviews.length ? <div className="stack">{reviews.map(r => <ReviewCard key={r.id} review={r} withDate showStudent={false} showActivity={false} />)}</div> : <p className="drawer-empty">Sin revisiones de esta actividad.</p>}
        </section>
      </>}

      {tab === 'deliveries' && (deliveries.length ? <ul className="stack">{deliveries.map(d => <li key={d.id} className="record">
        <div className="record-head"><ClipboardText size={16} aria-hidden="true" /><strong>{formatDate(d.receivedAt, { weekday: 'short', year: 'numeric' })}, {formatTime(d.receivedAt)}</strong><Badge tone={d.completeness === 'complete' ? 'ok' : 'warn'}>{d.completeness === 'complete' ? 'Completa' : d.completeness === 'not_submitted' ? 'No entregó' : `Avance${typeof d.progress === 'number' ? ` · ${d.progress} %` : ''}`}</Badge>{d.hours ? <span className="muted">{d.hours} h</span> : null}</div>
        <p>{d.summary}</p>
        {d.url && safeUrl(d.url) && <ExternalLink url={safeUrl(d.url)!}>Abrir evidencia</ExternalLink>}
        <small className="muted">Registrada {formatDate(d.recordedAt, { year: 'numeric' })}, {formatTime(d.recordedAt)}</small>
      </li>)}</ul> : <Empty icon={<ClipboardText size={20} />} title="Sin entregas registradas" description="Registra lo que presentó el alumno, aunque sea un avance o una demostración en persona." action={editable && active ? <Button size="sm" onClick={deliver}><TrendUp size={14} weight="bold" />Registrar avance</Button> : undefined} />)}

      {tab === 'evaluations' && (evaluations.length ? <ul className="stack">{evaluations.map(e => <li key={e.id} className={`record ${e.current ? '' : 'is-old'}`}>
        <div className="record-head"><strong>{e.evaluatorName}</strong><span className="muted">{formatDate(e.createdAt, { year: 'numeric' })}, {formatTime(e.createdAt)}</span><Badge tone={e.current ? 'ok' : 'neutral'}>{e.current ? 'Vigente' : 'Anterior'}</Badge></div>
        <ul className="evaluation-scores">{e.scores.map(s => <li key={s.skillId}>
          <span className="evaluation-skill"><strong>{w.skills.find(k => k.id === s.skillId)?.name ?? 'Habilidad'}</strong>{s.comment && <small>{s.comment}</small>}</span>
          {s.score === null ? <span className="not-evaluated">Sin evaluar</span> : <span className="evaluation-value"><Meter value={s.score} /><span className="score">{s.score.toFixed(1)}</span><small className="score-word">{scoreLevel(s.score)}</small></span>}
        </li>)}</ul>
        {e.feedback && <p className="prose"><strong>Retroalimentación.</strong> {e.feedback}</p>}
        <Badge tone={e.outcome === 'completed' ? 'ok' : 'warn'}>{e.outcome === 'completed' ? 'Actividad terminada' : 'Se pidieron correcciones'}</Badge>
      </li>)}</ul> : <Empty icon={<Exam size={20} />} title="Sin evaluaciones" description={complete ? 'La entrega está registrada; ya se puede evaluar.' : 'Se evalúa después de registrar una entrega completa.'} />)}

      {tab === 'history' && (history.length ? <ol className="history">{history.map(event => <li key={event.id}><p>{cleanDetail(event.detail)}</p><small>{event.actorName} · {formatDate(event.createdAt, { year: 'numeric' })}, {formatTime(event.createdAt)}</small></li>)}</ol> : <Empty title="Sin cambios registrados" />)}
    </div>
  </Drawer>;
}
