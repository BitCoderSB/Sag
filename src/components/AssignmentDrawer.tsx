import { useRef, useState, type ReactNode } from 'react';
import { ArrowCounterClockwise, ArrowRight, Barricade, Hourglass, Check, TrendUp, CalendarPlus, ClipboardText, DownloadSimple, Exam, File, LinkSimple, PencilSimple, UploadSimple, X, XCircle, WarningCircle, CheckCircle, Clock, Prohibit } from '@phosphor-icons/react';
import { useApp } from '../context';
import { blockedSince, blockEscalated, isWaiting, assignmentProgress, scoreLevel, api, cleanDetail, dateKey, dayLabel, dueText, fileSize, formatDate, formatTime, isLate, isOpen, relativeDay, safeUrl, patch, linkLabel, MAX_FILE, FILE_TYPES, toHttpUrl } from '../lib';
import { AreaTag, Avatar, Badge, Button, Drawer, Empty, ErrorMessage, ExternalLink, IconButton, Menu, Meter, Tabs } from './ui';
import type { Tone } from '../lib';
import ReviewCard from './ReviewCard';

type Tab = 'detail' | 'deliveries' | 'evaluations' | 'history';

export default function AssignmentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { workspace: w, readonly, openStudent, modal, refresh, toast } = useApp();
  const assignment = w.assignments.find(a => a.id === id);
  const [tab, setTab] = useState<Tab>('detail');
  const [fileKind, setFileKind] = useState<'instruction' | 'evidence'>('instruction'); const [newLink, setNewLink] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [linkOpen, setLinkOpen] = useState(false); const lock = useRef(false); const fileInput = useRef<HTMLInputElement>(null);
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
  const late = isLate(assignment, w);
  const tabs: { id: Tab; label: string; count?: number }[] = [{ id: 'detail', label: 'Detalle' }, { id: 'deliveries', label: 'Entregas', count: deliveries.length }, { id: 'evaluations', label: 'Evaluaciones', count: evaluations.length }, { id: 'history', label: 'Historial' }];
  const deliver = () => modal({ type: 'progress', assignment });
  const evaluate = () => modal({ type: 'evaluate', assignment });
  const edit = () => modal({ type: 'assignmentEdit', assignment, mode: 'edit' });
  const block = (mode: 'mark' | 'wait' | 'resolve') => modal({ type: 'block', assignment, mode });

  const progress = assignmentProgress(assignment, w);
  const nextReview = reviews.find(r => r.status === 'scheduled' && Date.parse(r.startsAt) >= Date.now());
  const lastProgress = deliveries.find(d => d.completeness === 'partial');
  const due = assignment.dueAt ? Date.parse(assignment.dueAt) : null;
  const dueSoon = due !== null && active && !complete && !late && due - Date.now() < 2 * 86_400_000;
  const reschedule = () => modal({ type: 'review', studentId: assignment.studentId, assignmentId: id });

  // Situación: un solo bloque dice qué pasa y qué hacer, en este orden de prioridad.
  // El impedimento va antes que el atraso porque lo explica; el atraso se menciona como dato adicional.
  type Situation = { tone: Tone; icon: ReactNode; title: string; text: string; extra?: string; primary?: ReactNode; secondary?: ReactNode };
  let s: Situation;
  if (assignment.status === 'cancelled') s = { tone: 'neutral', icon: <Prohibit size={20} weight="bold" />, title: 'Actividad cancelada', text: 'No acepta entregas ni evaluaciones. Su historial se conserva.' };
  else if (assignment.status === 'completed') s = { tone: 'ok', icon: <CheckCircle size={20} weight="fill" />, title: 'Terminada', text: currentEval ? `La evaluó ${currentEval.evaluatorName} ${relativeDay(currentEval.createdAt)}.` : 'Entrega registrada y evaluada.', secondary: <Button size="sm" variant="secondary" onClick={() => setTab('evaluations')}>Ver evaluación</Button> };
  // En espera: gris, sin alarma, con la fecha en que vuelve. Llegada esa fecha pide decisión (ámbar) y, si se ignora, sube a rojo.
  else if (assignment.blockedReason && isWaiting(assignment)) s = { tone: 'wait', icon: <Hourglass size={20} weight="bold" />, title: `En espera hasta el ${formatDate(`${assignment.blockedReviewAt}T12:00:00-06:00`, { weekday: 'short' })}`, text: assignment.blockedReason, extra: undefined, primary: editable && <Button size="sm" onClick={() => block('resolve')}>Ya se resolvió</Button>, secondary: editable && <Button size="sm" variant="secondary" onClick={() => block('wait')}>Cambiar fecha de revisión</Button> };
  else if (assignment.blockedReason) s = { tone: blockEscalated(assignment) ? 'danger' : 'warn', icon: <Barricade size={20} weight="bold" />, title: blockEscalated(assignment) ? `Impedimento sin revisar ${blockedSince(assignment)}` : 'Revisa el impedimento', text: assignment.blockedReason, extra: late ? `Además, ${dueText(assignment).toLowerCase()} sin entrega registrada.` : undefined, primary: editable && <Button size="sm" onClick={() => block('resolve')}>Resolver</Button>, secondary: editable && <Button size="sm" variant="secondary" onClick={() => block('wait')}>Esperar más</Button> };
  else if (assignment.status === 'pending_review') s = { tone: 'info', icon: <Exam size={20} weight="bold" />, title: 'Lista para evaluar', text: `Registraste la entrega final ${complete ? relativeDay(complete.receivedAt) : ''}.`, primary: editable && <Button size="sm" onClick={evaluate}>Evaluar</Button> };
  else if (late && noDelivery) s = { tone: 'warn', icon: <WarningCircle size={20} weight="fill" />, title: 'No entregó', text: 'Registraste que no entregó a tiempo. Amplía la fecha o cancela la actividad.', primary: editable && <Button size="sm" onClick={edit}>Cambiar fecha</Button> };
  else if (late) s = { tone: 'warn', icon: <WarningCircle size={20} weight="fill" />, title: 'Entrega vencida', text: `${dueText(assignment)} y no has registrado la entrega.`, primary: editable && <Button size="sm" onClick={deliver}>Registrar entrega</Button>, secondary: editable && <Button size="sm" variant="secondary" onClick={edit}>Cambiar fecha</Button> };
  else if (assignment.status === 'changes_requested') s = { tone: 'neutral', icon: <ArrowCounterClockwise size={20} weight="bold" />, title: 'En correcciones', text: `Pediste correcciones${currentEval ? ` ${relativeDay(currentEval.createdAt)}` : ''}. Registra la nueva entrega cuando la presente.`, primary: editable && <Button size="sm" onClick={deliver}>Registrar entrega</Button> };
  else s = { tone: 'neutral', icon: <Clock size={20} weight="bold" />, title: 'En curso', text: `${progress !== null ? `Lleva ${progress} %. ` : 'Sin avances registrados. '}${dueText(assignment)}.`, primary: editable && <Button size="sm" onClick={deliver}>Registrar avance</Button>, secondary: editable && <Button size="sm" variant="secondary" onClick={() => block('mark')}><Barricade size={15} />Marcar impedimento</Button> };

  // Seguimiento: solo progreso (hecho, en curso, pendiente) y su fecha. Los problemas los dice la situación, no los pasos.
  const track: { label: string; sub: string; state: 'done' | 'current' | 'todo' }[] = [
    { label: 'Asignada', sub: formatDate(assignment.createdAt), state: 'done' },
    { label: 'Entrega', sub: complete ? `Registrada ${formatDate(complete.receivedAt)}` : lastProgress ? `Avance ${lastProgress.progress ?? ''}${lastProgress.progress != null ? ' %' : ''}`.trim() : noDelivery ? 'No entregó' : 'Sin registrar', state: complete ? 'done' : assignment.status === 'cancelled' ? 'todo' : 'current' },
    { label: 'Evaluación', sub: assignment.status === 'completed' ? formatDate(currentEval?.createdAt ?? assignment.updatedAt) : assignment.status === 'changes_requested' ? 'Correcciones' : 'Pendiente', state: assignment.status === 'completed' ? 'done' : complete || assignment.status === 'changes_requested' ? 'current' : 'todo' },
  ];
  if (assignment.status === 'changes_requested') {
    const resubmitted = !!(complete && currentEval && complete.receivedAt > currentEval.createdAt);
    track[1] = { label: 'Entrega', sub: resubmitted ? `Registrada ${formatDate(complete!.receivedAt)}` : 'Nueva entrega pendiente', state: resubmitted ? 'done' : 'current' };
    track[2] = { label: 'Evaluación', sub: 'Correcciones pedidas', state: resubmitted ? 'current' : 'todo' };
  }

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
    ...(active && assignment.status !== 'pending_review' ? [assignment.blockedReason ? { label: 'Resolver impedimento', icon: <Barricade size={16} />, onSelect: () => block('resolve') } : { label: 'Marcar impedimento', icon: <Barricade size={16} />, onSelect: () => block('mark') }] : []),
    ...(assignment.status !== 'cancelled' && student?.status === 'active' ? [{ label: 'Programar revisión', icon: <CalendarPlus size={16} />, onSelect: () => modal({ type: 'review', studentId: assignment.studentId, assignmentId: id }) }] : []),
    ...(complete && assignment.status !== 'cancelled' && assignment.status !== 'pending_review' ? [{ label: 'Nueva evaluación', icon: <Exam size={16} />, onSelect: evaluate }] : []),
    ...(active ? ['separator' as const, { label: 'Cancelar actividad', icon: <XCircle size={16} />, danger: true, onSelect: () => modal({ type: 'assignmentEdit', assignment, mode: 'cancel' }) }] : []),
  ] : [];

  return <Drawer label={assignment.title} onClose={onClose}>
    <header className="ad-head">
      <p className="ad-eyebrow"><ClipboardText size={14} aria-hidden="true" />Actividad{assignment.phase ? ` · ${assignment.phase}` : ''}{readonly && <AreaTag id={assignment.areaId} compact />}</p>
      <h2>{assignment.title}</h2>
      <button type="button" className="ad-person" onClick={() => openStudent(assignment.studentId)}><Avatar name={student?.name ?? 'Alumno'} avatar={student?.avatar} size="sm" /><span>{student?.name ?? 'Alumno'}</span><small>Ver expediente</small><ArrowRight size={13} aria-hidden="true" /></button>
      {menuItems.length > 0 && <div className="ad-menu"><Menu label="Más acciones de la actividad" items={menuItems} /></div>}
    </header>

    <section key={`${assignment.status}-${s.title}`} className={`ad-situation tone-${s.tone}`} aria-label="Situación">
      <span className="ad-situation-icon" aria-hidden="true">{s.icon}</span>
      <div className="ad-situation-text">
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        {s.extra && <p className="ad-situation-extra"><WarningCircle size={14} weight="fill" aria-hidden="true" />{s.extra}</p>}
      </div>
      {(s.primary || s.secondary) && <div className="ad-situation-actions">{s.primary}{s.secondary}</div>}
    </section>

    <ol className="ad-track" aria-label="Seguimiento de la actividad">{track.map(t => <li key={t.label} className={`is-${t.state}`}>
      <span className="ad-track-mark" aria-hidden="true">{t.state === 'done' ? <Check size={11} weight="bold" /> : null}</span>
      <span className="ad-track-text"><strong>{t.label}</strong><small>{t.sub}</small></span>
      <span className="sr-only">{t.state === 'done' ? 'hecho' : t.state === 'current' ? 'en curso' : 'pendiente'}</span>
    </li>)}</ol>

    <Tabs value={tab} onChange={setTab} tabs={tabs} label="Secciones de la actividad" idPrefix="assignment-tab" panelId="assignment-panel" />
    <div key={tab} className="drawer-body tab-panel" role="tabpanel" id="assignment-panel" aria-labelledby={`assignment-tab-${tab}`}>
      <ErrorMessage message={error} />
      {tab === 'detail' && <>
        <dl className="ad-facts">
          <div className={late || dueSoon ? 'tone-warn' : ''}><dt>Fecha límite</dt><dd><strong>{assignment.dueAt ? `${formatDate(assignment.dueAt, { weekday: 'short' })}, ${formatTime(assignment.dueAt)}` : 'Sin fecha'}</strong>{assignment.dueAt && active && <small>{complete ? 'Entrega ya registrada' : isWaiting(assignment) ? 'Reloj detenido mientras espera' : dueText(assignment)}</small>}</dd></div>
          <div><dt>Próxima revisión</dt><dd>{nextReview ? <><strong>{dayLabel(nextReview.startsAt)}, {formatTime(nextReview.startsAt)}</strong><small>{nextReview.durationMinutes} min</small></> : <><strong className="muted">Sin programar</strong>{editable && active && <button type="button" className="ad-inline-link" onClick={reschedule}>Programar</button>}</>}</dd></div>
          <div><dt>Avance</dt><dd>{progress !== null ? <><strong>{progress} %</strong><span className={`ad-meter ${progress >= 100 ? 'is-full' : ''}`}><i style={{ width: `${progress}%` }} /></span></> : <strong className="muted">Sin registrar</strong>}</dd></div>
          <div><dt>Asignada</dt><dd><strong>{formatDate(assignment.createdAt, { year: 'numeric' })}</strong>{assignment.startAt && dateKey(assignment.startAt) !== dateKey(assignment.createdAt) && <small>Inicio {formatDate(assignment.startAt)}</small>}</dd></div>
        </dl>
        <section className="ad-section">
          <h3 className="ad-section-head">Qué debe hacer y entregar</h3>
          <p className="prose">{assignment.description || <span className="muted">Sin instrucciones escritas.</span>}</p>
        </section>
        <section className="ad-section">
          <h3 className="ad-section-head">Habilidades a evaluar<span className="count">{assignment.skillIds.length}</span></h3>
          <span className="tag-row">{assignment.skillIds.map(skillId => <span className="chip" key={skillId}>{w.skills.find(s => s.id === skillId)?.name ?? skillId}</span>)}</span>
        </section>
        <section className="ad-section">
          <h3 className="ad-section-head">Material<span className="count">{assignment.links.length + attachments.length}</span>
            {editable && assignment.status !== 'cancelled' && <span className="ad-section-actions">
              <button type="button" className="ad-inline-link" aria-expanded={linkOpen} onClick={() => setLinkOpen(o => !o)}><LinkSimple size={14} aria-hidden="true" />Añadir enlace</button>
              <Menu label="Subir documento" align="end" trigger={<button type="button" className="ad-inline-link" disabled={busy}><UploadSimple size={14} aria-hidden="true" />Subir documento</button>} items={[
                { label: 'Instrucciones (para el alumno)', icon: <File size={16} />, onSelect: () => { setFileKind('instruction'); setTimeout(() => fileInput.current?.click(), 0); } },
                { label: 'Evidencia (lo que presentó)', icon: <File size={16} />, onSelect: () => { setFileKind('evidence'); setTimeout(() => fileInput.current?.click(), 0); } },
              ]} />
            </span>}
          </h3>
          <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label="Elegir archivo" accept={FILE_TYPES} multiple onChange={e => upload(e.target.files)} />
          {linkOpen && <div className="material-link-add">
            <LinkSimple size={16} aria-hidden="true" />
            <input autoFocus type="text" inputMode="url" autoComplete="off" spellCheck={false} aria-label="Pegar enlace" value={newLink} maxLength={2000} onChange={e => setNewLink(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } if (e.key === 'Escape') { e.stopPropagation(); setLinkOpen(false); } }} placeholder="Pega un enlace de Drive u otro sitio" />
            <Button variant="secondary" size="sm" disabled={!newLink.trim()} loading={busy} onClick={addLink}>Añadir</Button>
          </div>}
          {(assignment.links.length > 0 || attachments.length > 0) ? <ul className="files">
            {assignment.links.map((l, i) => { const url = safeUrl(l.url); return url && <li key={`l${i}`}><LinkSimple size={16} aria-hidden="true" /><ExternalLink url={url}>{l.label}</ExternalLink>{editable && assignment.status !== 'cancelled' && <IconButton className="file-remove" label={`Quitar ${l.label}`} disabled={busy} onClick={() => saveLinks(assignment.links.filter((_, n) => n !== i), 'Enlace quitado.')}><X size={14} /></IconButton>}</li>; })}
            {attachments.map(a => <li key={a.id}><File size={16} aria-hidden="true" /><a href={`/api/files/${a.id}`} download className="file-link"><span>{a.name}</span><small>{a.kind === 'instruction' ? 'Instrucciones' : 'Evidencia'} · {fileSize(a.size)}</small><DownloadSimple size={15} aria-hidden="true" /></a></li>)}
          </ul> : !linkOpen && <p className="drawer-empty">Sin material. Añade la carpeta de Drive o sube documentos (PDF, imagen, texto u Office, hasta 10 MB).</p>}
        </section>
        <section className="ad-section">
          <h3 className="ad-section-head">Revisiones<span className="count">{reviews.length}</span>{editable && active && <span className="ad-section-actions"><button type="button" className="ad-inline-link" onClick={reschedule}><CalendarPlus size={14} aria-hidden="true" />Programar</button></span>}</h3>
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
