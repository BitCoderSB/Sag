import { useRef, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { ArrowBendUpLeft, ArrowRight, ArrowsClockwise, ChartBarHorizontal, Check, CheckCircle, ClockCounterClockwise, File, FileDoc, FilePdf, FileText, FileXls, FolderOpen, Trash, UploadSimple, GraduationCap, Notepad, Phone, PhoneCall } from '@phosphor-icons/react';
import type { Student } from '../../shared/types';
import { DOC_KIND_LABEL, guessDocKind, nextPhase, phaseInfo, STEP_LABEL, THESIS_PHASES, type ThesisDocKind, type ThesisAction, type ThesisPhase, type ThesisStep } from '../../shared/thesis';
import { useApp } from '../context';
import { api, dayDiff, del, FILE_TYPES, fileSize, formatDate, formatTime, plural, post, relativeDay, safeUrl, toHttpUrl } from '../lib';
import { Button, ErrorMessage, ExternalLink, Field, IconButton, Modal } from './ui';
import { openGantt } from './StudentPlan';

/** Carpeta de Drive del área con las propuestas, estados y documentos de cada tesista. */
import { RESEARCH_DRIVE_URL } from '../../shared/research';
export const RESEARCH_DRIVE = RESEARCH_DRIVE_URL;

/** Lo que toca hacer al responsable según el paso, dicho como acción. */
export function thesisNext(step: ThesisStep): { action: ThesisAction | null; label: string; who: 'you' | 'student' | 'done' } {
  switch (step) {
    case 'kickoff': return { action: 'kickoff', label: 'Registrar llamada inicial', who: 'you' };
    case 'working': return { action: 'submitted', label: 'Registrar entrega', who: 'student' };
    case 'review': return { action: 'reviewed', label: 'Registrar revisión', who: 'you' };
    case 'call': return { action: null, label: 'Registrar llamada', who: 'you' };
    case 'done': return { action: null, label: 'Defendida', who: 'done' };
  }
}
export const daysInPhase = (s: Student) => s.thesis ? Math.max(0, -dayDiff(s.thesis.phaseSince)) : 0;

/** Ciclo de cada fase: el tesista trabaja → revisas → llamada. Indica en qué punto va. */
export function ThesisCycle({ step, compact = false }: { step: ThesisStep; compact?: boolean }) {
  const order: ThesisStep[] = ['working', 'review', 'call'];
  const at = step === 'kickoff' ? -1 : step === 'done' ? 3 : order.indexOf(step);
  const labels = ['Tesista trabaja', 'Revisas', 'Llamada'];
  return <ol className={`th-cycle ${compact ? 'is-compact' : ''}`} aria-label={`Ciclo de la fase: ${STEP_LABEL[step]}`}>
    {labels.map((l, i) => <li key={l} className={i < at ? 'is-done' : i === at ? 'is-now' : ''}><span className="th-cycle-dot" aria-hidden="true">{i < at ? <Check size={10} weight="bold" /> : null}</span>{!compact && l}</li>)}
  </ol>;
}

/** Panel de tesis en el expediente: dónde va, qué sigue, datos y enlaces, recorrido por fases e historial. */
export function ThesisPanel({ student }: { student: Student }) {
  const app = useApp(); const t = student.thesis; const editable = !app.readonly && app.workspace.user.areaId === 'research';
  if (!t) return <div className="th-empty">
    <GraduationCap size={28} aria-hidden="true" />
    <strong>Sin seguimiento de tesis</strong>
    <p>Empieza con la llamada inicial para conocer sus intereses y bosquejar la idea.</p>
    {editable && <Button onClick={() => app.modal({ type: 'thesis', student })}>Iniciar seguimiento de tesis</Button>}
  </div>;
  const info = phaseInfo(t.phase); const next = thesisNext(t.step);
  const idx = THESIS_PHASES.findIndex(p => p.id === t.phase);
  const proposal = safeUrl(t.proposalUrl); const drive = safeUrl(t.driveUrl) ?? RESEARCH_DRIVE;
  const end = t.estimateMonths ? new Date(Date.parse(t.startedAt) + t.estimateMonths * 30.44 * 86_400_000) : null;
  return <div className="th">
    <section className={`th-now is-${t.step}`} aria-label="Dónde va">
      <header>
        <span className="th-phase-n">Fase {info.n} de 10</span>
        <h3>{info.label}</h3>
        <p>{t.step === 'done' ? `Defendió ${t.defendedAt ? relativeDay(t.defendedAt) : ''}.` : t.step === 'working' ? info.work : t.step === 'review' ? info.review : t.step === 'call' ? 'Llamada con el tesista para revisar los cambios y decidir.' : 'Llamada para conocer sus intereses y bosquejar la idea.'}</p>
        <small>{t.step === 'done' ? '' : `${STEP_LABEL[t.step]} · ${plural(daysInPhase(student), 'día', 'días')} en esta fase`}</small>
      </header>
      {t.step !== 'kickoff' && t.step !== 'done' && t.phase !== 'defense' && <ThesisCycle step={t.step} />}
      {editable && t.step !== 'done' && <div className="th-now-actions">
        {t.step === 'call' ? <Button onClick={() => app.modal({ type: 'thesisStep', student, action: 'advance' })}><PhoneCall size={16} />Registrar llamada</Button>
          : t.phase === 'defense' ? <Button onClick={() => app.modal({ type: 'thesisStep', student, action: 'defended' })}><GraduationCap size={16} />Registrar defensa</Button>
          : <Button variant={next.who === 'student' ? 'secondary' : 'primary'} onClick={() => app.modal({ type: 'thesisStep', student, action: next.action! })}>{next.label}<ArrowRight size={15} /></Button>}
        <Button variant="ghost" onClick={() => app.modal({ type: 'thesisStep', student, action: 'moved' })}>Cambiar de fase</Button>
      </div>}
    </section>

    <ol className="th-phases" aria-label="Fases de la tesis">{THESIS_PHASES.map((p, i) => <li key={p.id} className={i < idx || t.step === 'done' ? 'is-done' : i === idx ? 'is-now' : ''} title={`${p.label} · puntos ${p.points}`}>
      <span className="th-phase-mark" aria-hidden="true">{i < idx || t.step === 'done' ? <Check size={11} weight="bold" /> : p.n}</span><span>{p.short}</span>
    </li>)}</ol>

    <dl className="th-facts">
      <div><dt>Tema</dt><dd>{t.topic || <span className="muted">Sin tema</span>}</dd></div>
      <div><dt>Inicio · tiempo estimado</dt><dd>{formatDate(t.startedAt, { year: 'numeric' })}{t.estimateMonths ? ` · ${t.estimateMonths >= 12 && t.estimateMonths % 12 === 0 ? plural(t.estimateMonths / 12, 'año', 'años') : plural(t.estimateMonths, 'mes', 'meses')}` : ''}{end && <small>Entrega estimada {formatDate(end.toISOString(), { year: 'numeric' })}</small>}</dd></div>
      <div><dt>Contacto</dt><dd>{student.email || <span className="muted">Sin correo</span>}{student.phone && <small><Phone size={12} aria-hidden="true" /> {student.phone}</small>}</dd></div>
      <div><dt>Disponible para llamada</dt><dd>{t.callAvailability || <span className="muted">Sin registrar</span>}</dd></div>
    </dl>
    <div className="th-links">
      {proposal ? <ExternalLink url={proposal}><FileText size={15} aria-hidden="true" />Pre-propuesta / propuesta</ExternalLink> : <span className="muted"><FileText size={15} aria-hidden="true" />Sin documento de propuesta</span>}
      <ExternalLink url={drive}><FolderOpen size={15} aria-hidden="true" />{safeUrl(t.driveUrl) ? 'Su carpeta en Drive' : 'Carpeta de tesis en Drive'}</ExternalLink>
      <button type="button" className="ad-inline-link" onClick={() => openGantt({ student: student.id }, { studentId: student.id })}><ChartBarHorizontal size={14} aria-hidden="true" />{t.plan?.length ? 'Cronograma' : 'Plan'}</button>
      {editable && <button type="button" className="ad-inline-link" onClick={() => app.modal({ type: 'thesis', student })}>Editar datos</button>}
    </div>

    <ThesisDocs student={student} editable={editable} />

    <section className="th-history" aria-labelledby="th-history-title">
      <h4 id="th-history-title">Historial de la tesis<span className="count">{t.history.length}</span></h4>
      {t.history.length ? <ol>{[...t.history].reverse().map(e => <li key={e.id} className={`is-${e.action}`}>
        <span className="th-h-icon" aria-hidden="true">{e.action === 'advance' ? <CheckCircle size={15} weight="fill" /> : e.action === 'back' ? <ArrowBendUpLeft size={15} /> : e.action === 'stay' ? <ArrowsClockwise size={15} /> : e.action === 'reviewed' ? <Notepad size={15} /> : e.action === 'defended' ? <GraduationCap size={15} /> : <ClockCounterClockwise size={15} />}</span>
        <span><strong>{ACTION_TEXT[e.action](phaseInfo(e.phase).short, e.to ? phaseInfo(e.to).short : '')}</strong>{e.note && <em>{e.note}</em>}<small>{e.actorName} · {formatDate(e.at, { year: 'numeric' })}, {formatTime(e.at)}</small></span>
      </li>)}</ol> : <p className="drawer-empty">Sin movimientos todavía.</p>}
    </section>
  </div>;
}
const DOC_ORDER: ThesisDocKind[] = ['proposal', 'preproposal', 'delimitation', 'draft', 'schedule', 'other'];
const docIcon = (name: string) => { const ext = name.split('.').pop()?.toLowerCase(); return ext === 'pdf' ? <FilePdf size={18} /> : ext === 'xlsx' || ext === 'csv' ? <FileXls size={18} /> : ext === 'docx' ? <FileDoc size={18} /> : <File size={18} />; };
/** Documentos del expediente de tesis. El tipo se deduce del nombre; un cronograma .xlsx actualiza el plan del Gantt. */
function ThesisDocs({ student, editable }: { student: Student; editable: boolean }) {
  const app = useApp(); const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirm, setConfirm] = useState<string | null>(null);
  const docs = (app.workspace.thesisDocs ?? []).filter(d => d.studentId === student.id).sort((a, b) => DOC_ORDER.indexOf(a.kind) - DOC_ORDER.indexOf(b.kind) || b.createdAt.localeCompare(a.createdAt));
  async function upload(list: FileList | null) {
    const picked = [...(list ?? [])]; if (!picked.length || busy) return;
    setBusy(true); setError(''); const failed: string[] = []; let ok = 0; let plan = false;
    for (const file of picked) {
      if (file.size > 10 * 1024 * 1024) { failed.push(`${file.name} pesa más de 10 MB`); continue; }
      const data = new FormData(); data.append('kind', guessDocKind(file.name)); data.append('file', file);
      try { const r = await api<{ plan: unknown[] | null }>(`/students/${student.id}/thesis/files`, { method: 'POST', body: data }); ok++; plan ||= !!r.plan; }
      catch (e) { failed.push(`${file.name} (${(e as Error).message})`); }
    }
    try { await app.refresh(); } catch { /* se verá al recargar */ }
    if (ok) app.toast(plan ? 'Cronograma cargado: el plan ya está en el Gantt.' : ok === 1 ? 'Documento subido.' : `${ok} documentos subidos.`);
    if (failed.length) setError(`No se subió: ${failed.join('; ')}.`);
    setBusy(false); if (input.current) input.current.value = '';
  }
  async function remove(id: string, name: string) {
    setBusy(true); setError('');
    try { await del(`/thesis-files/${id}`); await app.refresh(); app.toast(`Se quitó ${name}.`); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); setConfirm(null); }
  }
  return <section className="th-docs" aria-labelledby="th-docs-title">
    <h4 id="th-docs-title">Documentos<span className="count">{docs.length}</span>
      {editable && <button type="button" className="ad-inline-link" disabled={busy} onClick={() => input.current?.click()}><UploadSimple size={14} aria-hidden="true" />Subir documentos</button>}
    </h4>
    <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-label="Elegir documentos de tesis" accept={FILE_TYPES} multiple onChange={e => upload(e.target.files)} />
    <ErrorMessage message={error} />
    {docs.length ? <ul className="th-doc-list">{docs.map(d => <li key={d.id} className={`is-${d.kind}`}>
      <span className="th-doc-icon" aria-hidden="true">{docIcon(d.name)}</span>
      <a href={`/api/thesis-files/${d.id}`} download className="th-doc-link"><strong>{d.name}</strong><small>{DOC_KIND_LABEL[d.kind]} · {fileSize(d.size)} · {formatDate(d.createdAt, { year: 'numeric' })}</small></a>
      {editable && (confirm === d.id
        ? <span className="th-doc-confirm"><Button size="sm" variant="danger" loading={busy} onClick={() => remove(d.id, d.name)}>Quitar</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>No</Button></span>
        : <IconButton className="file-remove" label={`Quitar ${d.name}`} disabled={busy} onClick={() => setConfirm(d.id)}><Trash size={15} /></IconButton>)}
    </li>)}</ul> : <p className="drawer-empty">{editable ? 'Sin documentos. Sube su pre-propuesta, propuesta o cronograma (PDF, Word o Excel, hasta 10 MB). El cronograma .xlsx de la plantilla se vuelve su plan en el Gantt.' : 'Sin documentos.'}</p>}
  </section>;
}

const ACTION_TEXT: Record<ThesisAction, (from: string, to: string) => string> = {
  kickoff: () => 'Llamada inicial', submitted: f => `Entregó · ${f}`, reviewed: f => `Revisaste · ${f}`,
  advance: (f, t) => `Aprobada ${f} → ${t}`, stay: f => `Correcciones en ${f}`, back: (f, t) => `Regresa de ${f} a ${t}`, defended: () => 'Defendió su tesis', moved: (f, t) => t ? `Movida de ${f} a ${t}` : `Registrada en ${f}`,
};

/* ---------- Diálogos ---------- */

/** Datos generales de la tesis; al crearla, en qué fase y paso empieza (útil si ya venía avanzada). */
export function ThesisForm({ student, onClose, save, busy, error, done, Footer }: { student: Student; onClose: () => void } & SaveKit) {
  const t = student.thesis;
  const [topic, setTopic] = useState(t?.topic ?? ''); const [months, setMonths] = useState(t?.estimateMonths ? String(t.estimateMonths) : '6');
  const [proposalUrl, setProposalUrl] = useState(t?.proposalUrl ?? ''); const [driveUrl, setDriveUrl] = useState(t?.driveUrl ?? '');
  const [callAvailability, setCallAvailability] = useState(t?.callAvailability ?? '');
  const [phase, setPhase] = useState<ThesisPhase>('preproposal'); const [step, setStep] = useState<ThesisStep>('kickoff');
  const [linkError, setLinkError] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const p = proposalUrl.trim() ? toHttpUrl(proposalUrl) : ''; const d = driveUrl.trim() ? toHttpUrl(driveUrl) : '';
    if (p === null || d === null) { setLinkError('Revisa los enlaces: pégalos completos.'); return; }
    save(() => api(`/students/${student.id}/thesis`, { method: 'PUT', body: JSON.stringify({ topic: topic.trim(), estimateMonths: months ? Number(months) : null, proposalUrl: p, driveUrl: d, callAvailability: callAvailability.trim(), ...(t ? {} : { phase, step }) }) }), t ? 'Datos de tesis guardados.' : `Seguimiento de tesis iniciado en ${phaseInfo(phase).label}.`, t ? 'Guardado' : 'Iniciado');
  }
  return <Modal title={t ? 'Datos de la tesis' : 'Iniciar seguimiento de tesis'} description={student.name} onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        <ErrorMessage message={error || linkError} />
        <Field label="Tema general o título tentativo"><input autoFocus maxLength={300} value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ej. Inteligencia artificial para clasificación de señales" /></Field>
        <div className="form-grid">
          <Field label="Tiempo estimado de entrega" hint={<span className="quick-dates">{[6, 12, 18].map(m => <button type="button" key={m} aria-pressed={months === String(m)} onClick={() => setMonths(String(m))}>{m === 6 ? '6 meses' : m === 12 ? '1 año' : '1 año 6 meses'}</button>)}</span>}><input type="number" min={1} max={60} value={months} onChange={e => setMonths(e.target.value)} aria-label="Meses" /></Field>
          <Field label="Disponibilidad para llamadas" hint="Opcional."><input maxLength={200} value={callAvailability} onChange={e => setCallAvailability(e.target.value)} placeholder="Ej. martes 3:30 p. m." /></Field>
        </div>
        <Field label="Enlace de la pre-propuesta o propuesta" hint="Documento de Google Docs. Solo lo abren quienes tengan acceso."><input inputMode="url" maxLength={2000} value={proposalUrl} onChange={e => setProposalUrl(e.target.value)} placeholder="Ej. docs.google.com/document/…" /></Field>
        <Field label="Carpeta del tesista en Drive" hint="Opcional. Sin ella se usa la carpeta general de tesis del área."><input inputMode="url" maxLength={2000} value={driveUrl} onChange={e => setDriveUrl(e.target.value)} placeholder="Ej. drive.google.com/drive/folders/…" /></Field>
        {!t && <div className="form-grid">
          <Field label="Empieza en la fase"><select value={phase} onChange={e => setPhase(e.target.value as ThesisPhase)}>{THESIS_PHASES.map(p => <option key={p.id} value={p.id}>{p.n}. {p.label}</option>)}</select></Field>
          <Field label="Paso actual"><select value={step} onChange={e => setStep(e.target.value as ThesisStep)}>{phase === 'preproposal' && <option value="kickoff">Llamada inicial pendiente</option>}<option value="working">Tesista trabajando</option><option value="review">Entregó; te toca revisar</option><option value="call">Llamada pendiente</option></select></Field>
        </div>}
      </div>
      <Footer busy={busy} done={done} onClose={onClose}>{t ? 'Guardar' : 'Iniciar seguimiento'}</Footer>
    </form>
  </Modal>;
}

export interface SaveKit { save: <T>(action: () => Promise<T>, message: string, doneLabel?: string) => void; busy: boolean; error: string; done: string | null; Footer: (p: { busy: boolean; done?: string | null; onClose: () => void; children: ReactNode; danger?: boolean; summary?: ReactNode; cancelLabel?: string }) => ReactElement }

/** Un paso del flujo. En la llamada se decide: aprobar y pasar a la siguiente, corregir en la misma o regresar. */
export function ThesisStepForm({ student, action: initial, to: target, onClose, save, busy, error, done, Footer }: { student: Student; action: ThesisAction; to?: ThesisPhase; onClose: () => void } & SaveKit) {
  const t = student.thesis!; const info = phaseInfo(t.phase); const next = nextPhase(t.phase);
  const decision = t.step === 'call' && ['advance', 'stay', 'back'].includes(initial);
  const [action, setAction] = useState<ThesisAction>(initial); const [note, setNote] = useState(''); const [to, setTo] = useState<ThesisPhase>(target ?? t.phase);
  const [localError, setLocalError] = useState('');
  const needsNote = action === 'stay' || action === 'back' || action === 'moved';
  function submit(e: FormEvent) {
    e.preventDefault();
    if (needsNote && note.trim().length < 3) { setLocalError(action === 'moved' ? 'Anota por qué cambia de fase.' : 'Anota qué debe corregir: lo verás en la siguiente revisión.'); return; }
    if (action === 'moved' && to === t.phase) { setLocalError('Elige una fase distinta.'); return; }
    const target = action === 'advance' ? next : action === 'back' ? info.backTo : action === 'moved' ? to : null;
    const msg = { kickoff: 'Llamada inicial registrada. Ya trabaja en su pre-propuesta.', submitted: 'Entrega registrada. Te toca revisar.', reviewed: 'Revisión registrada. Sigue la llamada.', advance: `Aprobada. Pasa a ${target ? phaseInfo(target).label : ''}.`, stay: `Sigue en ${info.label} con correcciones.`, back: `Regresa a ${target ? phaseInfo(target).label : ''}.`, defended: '¡Tesis defendida!', moved: `Ahora está en ${target ? phaseInfo(target).label : ''}.` }[action];
    save(() => post(`/students/${student.id}/thesis/actions`, { action, note: note.trim(), version: student.version, ...(action === 'moved' ? { to } : {}) }), msg, action === 'advance' ? 'Aprobada' : 'Registrado');
  }
  const titles: Record<ThesisAction, string> = { kickoff: 'Llamada inicial', submitted: 'Registrar entrega', reviewed: 'Registrar revisión', advance: 'Registrar llamada', stay: 'Registrar llamada', back: 'Registrar llamada', defended: 'Registrar defensa', moved: 'Cambiar de fase' };
  const options = [
    ...(next ? [{ value: 'advance' as const, label: `Aprobar y pasar a ${phaseInfo(next).short}`, hint: 'No hay inconsistencias.' }] : []),
    { value: 'stay' as const, label: `Corregir en ${info.short}`, hint: 'Hay inconsistencias de esta fase: vuelve a trabajarla.' },
    ...(info.backTo ? [{ value: 'back' as const, label: `Regresar a ${phaseInfo(info.backTo).short}`, hint: 'Las inconsistencias vienen del diseño o las simulaciones.' }] : []),
  ];
  return <Modal title={titles[action]} description={`${student.name} · Fase ${info.n}: ${info.label}`} onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        <ErrorMessage message={error || localError} />
        {decision && <fieldset className="choices"><legend>¿Qué se decidió en la llamada?</legend>
          <div className="progress-kinds th-decision" role="radiogroup" aria-label="Resultado de la llamada">{options.map(o => <label key={o.value} className={`progress-kind ${o.value === 'back' ? 'kind-not_submitted' : ''}`}>
            <input type="radio" name="thesis-decision" checked={action === o.value} onChange={() => setAction(o.value)} />
            <span className="progress-kind-mark" aria-hidden="true" />
            <span><strong>{o.label}</strong><small>{o.hint}</small></span>
          </label>)}</div>
        </fieldset>}
        {action === 'kickoff' && <p className="dialog-text">Llamada con el tesista para conocer sus intereses y bosquejar la idea. Después empieza a investigar temas para su pre-propuesta.</p>}
        {action === 'submitted' && <p className="dialog-text">El tesista entregó su avance de <strong>{info.label.toLowerCase()}</strong>. Queda en tu lista para revisarlo.</p>}
        {action === 'reviewed' && <p className="dialog-text">Revisaste y propusiste cambios o consideraciones. Sigue la llamada para comentarlos y decidir si avanza.</p>}
        {action === 'defended' && <p className="dialog-text">Se registra la defensa y la tesis queda concluida.</p>}
        {action === 'moved' && <Field label="Nueva fase" required><select value={to} onChange={e => setTo(e.target.value as ThesisPhase)}>{THESIS_PHASES.map(p => <option key={p.id} value={p.id}>{p.n}. {p.label}</option>)}</select></Field>}
        <Field label={action === 'stay' || action === 'back' ? 'Qué debe corregir' : action === 'moved' ? 'Motivo' : action === 'reviewed' ? 'Cambios o consideraciones propuestos' : 'Nota'} required={needsNote} hint={needsNote ? 'Queda en el historial de la tesis.' : 'Opcional. Queda en el historial.'}>
          <textarea rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} autoFocus={!decision} placeholder={action === 'stay' ? 'Ej. Justificar la elección del sensor y rehacer la tabla comparativa' : ''} />
        </Field>
      </div>
      <Footer busy={busy} done={done} onClose={onClose} summary={action === 'advance' && next ? <>Pasa a <strong>{phaseInfo(next).label}</strong></> : action === 'back' && info.backTo ? <>Regresa a <strong>{phaseInfo(info.backTo).label}</strong></> : action === 'stay' ? <>Sigue en <strong>{info.label}</strong></> : undefined}>
        {action === 'advance' ? 'Aprobar fase' : action === 'stay' ? 'Pedir correcciones' : action === 'back' ? 'Regresar de fase' : action === 'moved' ? 'Cambiar de fase' : action === 'defended' ? 'Registrar defensa' : 'Registrar'}
      </Footer>
    </form>
  </Modal>;
}
