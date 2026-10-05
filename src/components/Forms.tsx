import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight, Check, File, LinkSimple, PencilSimple, Plus, Trash, UploadSimple, UserPlus, WarningCircle, X } from '@phosphor-icons/react';
import { AREAS, type AreaId, type Assignment, type Meeting, type Review, type Student } from '../../shared/types';
import { useApp, type ModalState } from '../context';
import { assignmentProgress, currentAssignment, isOpen as isOpenAssignment, scoped, dateKey, weekLoad, plural, toInputDate, dayDiff, dayLabel, firstName, formatDate, formatTime, fromInput, futureInput, normalize, patch, post, relativeDay, reviewTitle, safeUrl, scoreLevel, skillStats, toInputDateTime, api, linkLabel, fileSize, MAX_FILE, FILE_TYPES, toHttpUrl } from '../lib';
import { ANIMALS, pickAnimal, type AnimalId } from '../../shared/avatars';
import { AreaTag, Avatar, Badge, animalName, Button, CheckDraw, ErrorMessage, Field, IconButton, Modal, Notice, Radar, RollingNumber, Segmented, Select } from './ui';
import { reducedMotion } from '../motion';
import AgreementList, { pendingTitle, previousWithPending } from './Agreements';
import Certificate from './Certificate';

/** Identificadores de lo que devolvió el servidor, para iluminarlos en las listas. */
function freshIds(result: unknown) {
  if (!result || typeof result !== 'object') return [];
  const ids: string[] = [];
  for (const key of ['student', 'assignment', 'review', 'delivery', 'evaluation', 'note', 'meeting']) {
    const value = (result as Record<string, { id?: string; studentId?: string; assignmentId?: string } | undefined>)[key];
    for (const id of [value?.id, value?.studentId, value?.assignmentId]) if (id) ids.push(id);
  }
  return ids;
}
function useSave(onClose: () => void) {
  const { refresh, toast, markFresh } = useApp();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState<string | null>(null); const lock = useRef(false);
  /** `message` puede depender del resultado (por ejemplo, si el archivo opcional no se subió). `doneLabel` es lo que dice el botón al confirmar. */
  async function save<T>(action: () => Promise<T>, message: string | ((result: T) => [string, 'success' | 'error']), doneLabel = 'Guardado', after?: (result: T) => void) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await action();
      const [text, kind] = typeof message === 'string' ? [message, 'success' as const] : message(result);
      try { await refresh(); markFresh(freshIds(result)); }
      catch { toast('Los cambios se guardaron, pero no pudimos actualizar la vista. Recarga la página para verlos.', 'error'); onClose(); return; }
      // La confirmación aparece primero en el botón que se pulsó; después se cierra el diálogo y queda el aviso.
      if (kind === 'success') { setBusy(false); setDone(doneLabel); await new Promise(resolve => setTimeout(resolve, reducedMotion() ? 120 : 720)); }
      toast(text, kind); onClose(); after?.(result);
    }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  return { busy, error, setError, save, done };
}
function Footer({ busy, done = null, onClose, children, cancelLabel = 'Cancelar', danger = false, disabled = false }: { busy: boolean; done?: string | null; onClose: () => void; children: ReactNode; cancelLabel?: string; danger?: boolean; disabled?: boolean }) {
  return <div className="dialog-foot">
    <Button variant="secondary" disabled={busy || !!done} onClick={onClose}>{cancelLabel}</Button>
    <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy} disabled={disabled || !!done} className={done ? 'is-done' : ''} aria-live="polite">
      {done ? <span className="button-done"><CheckDraw />{done}</span> : children}
    </Button>
  </div>;
}
function Locked({ label, children }: { label: string; children: ReactNode }) {
  return <div className="locked"><span className="locked-label">{label}</span><div className="locked-value">{children}</div></div>;
}
const LockedStudent = ({ student }: { student?: Student }) => <Locked label="Alumno"><Avatar name={student?.name ?? 'Alumno'} avatar={student?.avatar} size="sm" /><strong>{student?.name}</strong><small>{student?.registration}</small></Locked>;

/* ---------- Crear habilidad dentro de otro formulario ---------- */

/** El estado vive en el formulario de fuera para que pueda avisar si se intenta guardar con una habilidad a medio crear. */
function useNewSkill(onCreated: (skillId: string) => void) {
  const { refresh } = useApp();
  const [name, setName] = useState(''); const [criterion, setCriterion] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dirty = !!(name.trim() || criterion.trim());
  function reset() { setName(''); setCriterion(''); setError(''); }
  async function create() {
    if (busy) return;
    if (name.trim().length < 2 || criterion.trim().length < 3) { setError('Escribe el nombre de la habilidad y qué debe demostrar el alumno.'); return; }
    setBusy(true); setError('');
    try {
      const { skill } = await post<{ skill: { id: string } }>('/skills', { name: name.trim(), description: criterion.trim() });
      // La habilidad ya existe aunque la vista no se actualice; el siguiente guardado vuelve a cargar los datos.
      try { await refresh(); } catch { /* sin efecto para el usuario */ }
      reset(); onCreated(skill.id);
    }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return { name, setName, criterion, setCriterion, busy, error, setError, dirty, reset, create };
}
const UNFINISHED_SKILL = 'Pulsa «Crear y añadir» para guardar la habilidad nueva, o cancélala.';

/** Sin <form> anidado: Enter crea la habilidad en lugar de enviar el formulario de fuera. */
function NewSkill({ draft, onCancel, cancelLabel = 'Cancelar' }: { draft: ReturnType<typeof useNewSkill>; onCancel: () => void; cancelLabel?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (draft.error) box.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); }, [draft.error]);
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); draft.create(); } };
  return <div className="add-skill-new" ref={box}>
    {draft.error && <p className="add-skill-error" role="alert"><WarningCircle size={15} weight="fill" aria-hidden="true" />{draft.error}</p>}
    <Field label="Nombre de la habilidad"><input autoFocus maxLength={100} value={draft.name} onChange={e => draft.setName(e.target.value)} onKeyDown={onEnter} placeholder="Ej. Trabajo en equipo" /></Field>
    <Field label="Qué debe demostrar"><input maxLength={500} value={draft.criterion} onChange={e => draft.setCriterion(e.target.value)} onKeyDown={onEnter} placeholder="Ej. Coordina tareas y comunica avances" /></Field>
    <span className="add-skill-actions"><Button size="sm" loading={draft.busy} onClick={draft.create}>Crear y añadir</Button><Button variant="ghost" size="sm" disabled={draft.busy} onClick={() => { draft.reset(); onCancel(); }}>{cancelLabel}</Button></span>
    <small className="field-hint">Queda en el catálogo de tu área para las próximas actividades.</small>
  </div>;
}

export default function Forms({ state, onClose }: { state: NonNullable<ModalState>; onClose: () => void }) {
  const { readonly } = useApp();
  // La constancia solo lee datos: también la puede generar el jefe.
  if (state.type === 'certificate') return <Certificate studentId={state.studentId} onClose={onClose} />;
  // Las reuniones son lo único que agenda el jefe.
  if (state.type === 'meeting') return readonly ? <MeetingForm meeting={state.meeting} date={state.date} areaIds={state.areaIds} cancel={state.cancel} onClose={onClose} /> : null;
  if (readonly) return null;
  switch (state.type) {
    case 'student': return <StudentForm student={state.student} onClose={onClose} />;
    case 'assignment': return <AssignmentForm studentId={state.studentId} onClose={onClose} />;
    case 'assignmentEdit': return <AssignmentEditForm assignment={state.assignment} mode={state.mode} onClose={onClose} />;
    case 'review': return <ReviewForm studentId={state.studentId} assignmentId={state.assignmentId} date={state.date} onClose={onClose} />;
    case 'reviewUpdate': return <ReviewUpdateForm review={state.review} mode={state.mode} onClose={onClose} />;
    case 'delivery': return <ProgressForm assignment={state.assignment} onClose={onClose} />;
    case 'progress': return <ProgressForm assignment={state.assignment} studentId={state.studentId} onClose={onClose} />;
    case 'evaluate': return <EvaluationForm assignment={state.assignment} onClose={onClose} />;
  }
}

/* ---------- Alumno ---------- */

const MODALITIES = ['Prácticas', 'Servicio social', 'Tesis', 'Investigación'];
function StudentForm({ student, onClose }: { student?: Student; onClose: () => void }) {
  const { workspace, openStudent } = useApp(); const areaId = workspace.user.areaId!;
  const [name, setName] = useState(student?.name ?? ''); const [registration, setRegistration] = useState(student?.registration ?? '');
  const [email, setEmail] = useState(student?.email ?? ''); const [career, setCareer] = useState(student?.career ?? ''); const [semester, setSemester] = useState(student?.semester ?? '');
  const [modalities, setModalities] = useState(student?.modalities ?? ['Prácticas']); const [technologies, setTechnologies] = useState(student?.technologies.join(', ') ?? '');
  const [status, setStatus] = useState(student?.status ?? 'active'); const [selected, setSelected] = useState<Student | null>(null);
  // Al registrar, el avatar ya viene elegido (el animal menos repetido); se puede cambiar antes de guardar.
  const [startDate, setStartDate] = useState(student ? student.startDate ?? '' : dateKey()); const [endDate, setEndDate] = useState(student?.endDate ?? ''); const [hoursRequired, setHoursRequired] = useState(student?.hoursRequired ? String(student.hoursRequired) : '');
  const [avatar, setAvatar] = useState<AnimalId>(() => student?.avatar ?? pickAnimal(workspace.students.map(s => s.avatar)));
  const { busy, error, setError, save, done } = useSave(onClose);
  const query = normalize(name.trim());
  const matches = !student && !done && query.length >= 2 ? workspace.students.filter(s => normalize(`${s.name} ${s.registration}`).includes(query) || (!!registration.trim() && normalize(s.registration) === normalize(registration.trim()))).slice(0, 4) : [];
  const duplicate = !student && workspace.students.find(s => s.registration.toLowerCase() === registration.trim().toLowerCase());
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (selected) { if (selected.areaIds.includes(areaId)) { onClose(); openStudent(selected.id); return; } await save(() => post(`/students/${selected.id}/join`, {}), `${firstName(selected.name)} ahora también está en tu área.`); return; }
    if (duplicate) { setSelected(duplicate); setError('Esa matrícula ya tiene expediente. Puedes incorporarlo a tu área.'); return; }
    if (!modalities.length) { setError('Elige al menos una modalidad.'); return; }
    if (startDate && endDate && endDate < startDate) { setError('La fecha de término debe ser posterior al inicio.'); return; }
    const body = { name: name.trim(), registration: registration.trim(), email: email.trim(), career: career.trim(), semester: semester.trim(), modalities, technologies: [...new Set(technologies.split(',').map(s => s.trim()).filter(Boolean))], avatar, startDate: startDate || null, endDate: endDate || null, hoursRequired: hoursRequired ? Number(hoursRequired) : null, status };
    await save(() => student ? patch(`/students/${student.id}`, { ...body, version: student.version }) : post('/students', (({ status: _, ...fields }) => fields)(body)), student ? 'Expediente actualizado.' : `${firstName(body.name)} quedó registrado en tu área.`, student ? 'Guardado' : 'Registrado');
  }
  const submitLabel = selected ? selected.areaIds.includes(areaId) ? 'Abrir expediente' : 'Incorporar a mi área' : student ? 'Guardar cambios' : <><UserPlus size={16} />Registrar alumno</>;
  return <Modal title={student ? 'Editar expediente' : 'Agregar alumno'} description={student ? 'Estos datos son compartidos con las otras áreas del alumno.' : undefined} onClose={() => !busy && onClose()} wide>
    <form onSubmit={submit}>
      <div className="dialog-body">
        <ErrorMessage message={error} />
        {selected ? <div className="selected-student">
          <Avatar name={selected.name} avatar={selected.avatar} size="lg" />
          <div><strong>{selected.name}</strong><span>{selected.registration}</span><span className="tag-row">{selected.areaIds.map(id => <AreaTag key={id} id={id} />)}</span></div>
          <button className="icon-button" type="button" aria-label="Elegir otro alumno" onClick={() => { setSelected(null); setError(''); }}><X size={16} /></button>
          <p>{selected.areaIds.includes(areaId) ? 'Ya está en tu área.' : 'Se incorporará a tu área. Sus actividades en otras áreas no cambian.'}</p>
        </div> : <>
          <Field label="Nombre completo" required hint={!student ? 'Si ya existe en otra área, aparecerá abajo para incorporarlo sin duplicarlo.' : undefined}>
            <input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
          </Field>
          {matches.length > 0 && <div className="matches">
            <span className="matches-title">Ya tienen expediente</span>
            {matches.map(s => <button type="button" className="student-match" key={s.id} onClick={() => { setSelected(s); setError(''); }}>
              <Avatar name={s.name} avatar={s.avatar} size="sm" /><span><strong>{s.name}</strong><small>{s.registration}</small></span>
              <span className="tag-row">{s.areaIds.map(id => <AreaTag key={id} id={id} compact />)}</span>
              {s.areaIds.includes(areaId) ? <Badge>En tu área</Badge> : <ArrowRight size={15} />}
            </button>)}
          </div>}
          <div className="form-grid">
            <Field label="Matrícula" required><input required maxLength={40} value={registration} onChange={e => setRegistration(e.target.value)} placeholder="A018273" autoComplete="off" /></Field>
            <Field label="Correo electrónico"><input type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></Field>
            <Field label="Carrera"><input maxLength={160} value={career} onChange={e => setCareer(e.target.value)} /></Field>
            <Field label="Semestre"><input maxLength={40} value={semester} onChange={e => setSemester(e.target.value)} /></Field>
          </div>
          <fieldset className="choices"><legend>Avatar</legend>
            <div className="avatar-picks">{ANIMALS.map(id => <label className="avatar-pick" key={id} title={animalName(id)}><input type="radio" name="avatar" value={id} checked={avatar === id} onChange={() => setAvatar(id)} /><Avatar name={animalName(id)} avatar={id} size="lg" /><span className="sr-only">{animalName(id)}</span></label>)}</div>
          </fieldset>
          <fieldset className="choices"><legend>Modalidad <span className="required" aria-hidden="true">*</span></legend>
            <div className="chips">{MODALITIES.map(m => <label className="chip-check" key={m}><input type="checkbox" checked={modalities.includes(m)} onChange={() => setModalities(old => old.includes(m) ? old.filter(v => v !== m) : [...old, m])} /><Check size={12} weight="bold" aria-hidden="true" />{m}</label>)}</div>
          </fieldset>
          <div className="form-grid form-grid-3">
            <Field label="Inicio"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></Field>
            <Field label="Término esperado" hint="Para ver si su plan cabe en su periodo."><input type="date" min={startDate || undefined} value={endDate} onChange={e => setEndDate(e.target.value)} /></Field>
            <Field label="Horas requeridas" hint="Servicio social o prácticas. Opcional."><input type="number" inputMode="numeric" min={1} max={5000} step={1} value={hoursRequired} onChange={e => setHoursRequired(e.target.value)} placeholder="Ej. 480" /></Field>
          </div>
          <Field label="Tecnologías" hint="Separadas por comas. Son experiencia declarada, no calificaciones."><input maxLength={500} value={technologies} onChange={e => setTechnologies(e.target.value)} placeholder="Python, React, Figma" /></Field>
          {student && <Field label="Estado" hint={student.areaIds.length > 1 ? 'Está en varias áreas: el estado es compartido y no puede cambiarse desde una sola.' : undefined}>
            <select disabled={student.areaIds.length > 1} value={status} onChange={e => setStatus(e.target.value as Student['status'])}><option value="active">Activo</option><option value="paused">En pausa</option><option value="completed">Terminó su participación</option></select>
          </Field>}
        </>}
      </div>
      <Footer busy={busy} done={done} onClose={onClose}>{submitLabel}</Footer>
    </form>
  </Modal>;
}

/* ---------- Actividad ---------- */

function AssignmentForm({ studentId: initialStudentId, onClose }: { studentId?: string; onClose: () => void }) {
  const { workspace } = useApp(); const { busy, error, setError, save, done } = useSave(onClose);
  const [studentId, setStudentId] = useState(initialStudentId ?? ''); const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState(futureInput(7, '23:59')); const [firstReviewAt, setFirstReviewAt] = useState(futureInput(3)); const [skillIds, setSkillIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState(dateKey()); const [phase, setPhase] = useState('');
  const [linkDraft, setLinkDraft] = useState(''); const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [files, setFiles] = useState<globalThis.File[]>([]); const fileInput = useRef<HTMLInputElement>(null);
  // Una habilidad creada aquí aparece al final, ya marcada, y recibe el foco.
  const [newSkill, setNewSkill] = useState(false); const [fresh, setFresh] = useState(''); const chips = useRef<HTMLDivElement>(null); const addChip = useRef<HTMLButtonElement>(null);
  const skillDraft = useNewSkill(id => { setSkillIds(old => old.includes(id) ? old : [...old, id]); setNewSkill(false); setFresh(id); setError(''); });
  useEffect(() => { if (fresh) chips.current?.querySelector<HTMLInputElement>(`input[data-skill="${fresh}"]`)?.focus(); }, [fresh]);
  const students = workspace.students.filter(s => s.areaIds.includes(workspace.user.areaId!) && s.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const skills = workspace.skills.filter(s => !s.areaId || s.areaId === workspace.user.areaId);
  const locked = initialStudentId ? workspace.students.find(s => s.id === initialStudentId) : undefined;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (newSkill && skillDraft.dirty) { skillDraft.setError(UNFINISHED_SKILL); return; }
    if (!skillIds.length) { setError('Elige al menos una habilidad a evaluar.'); return; }
    // Un enlace pegado sin pulsar "Añadir" también se incluye: no se pierde lo que el usuario escribió.
    const pending = linkDraft.trim() ? toHttpUrl(linkDraft) : null;
    if (linkDraft.trim() && !pending) { setError('El enlace que escribiste no es válido. Pégalo completo o bórralo.'); return; }
    const allLinks = pending && !links.some(l => l.url === pending) ? [...links, { label: linkLabel(pending), url: pending }] : links;
    const who = firstName(workspace.students.find(s => s.id === studentId)?.name);
    const review = fromInput(firstReviewAt);
    if (startAt && dueAt && `${startAt}T00:00` > dueAt) { setError('El inicio debe ser anterior a la fecha límite.'); return; }
    const done = `Actividad asignada a ${who}. Primera revisión ${review ? relativeDay(review) : ''}.`;
    // Primero se crea la actividad; los documentos se suben después, uno por uno. Si alguno falla, la actividad no se pierde.
    save(async () => {
      const created = await post<{ assignment: Assignment }>('/assignments', { studentId, title: title.trim(), description: description.trim(), dueAt: fromInput(dueAt), reviewAt: review, startAt: startAt ? fromInput(`${startAt}T09:00`) : null, phase: phase.trim(), skillIds, links: allLinks });
      const failed: string[] = [];
      for (const file of files) {
        try { const data = new FormData(); data.append('kind', 'instruction'); data.append('file', file); await api(`/assignments/${created.assignment.id}/files`, { method: 'POST', body: data }); }
        catch { failed.push(file.name); }
      }
      return { failed, ...created };
    }, ({ failed }) => failed.length ? [`Actividad asignada, pero no se ${failed.length === 1 ? 'subió' : 'subieron'}: ${failed.join(', ')}. Súbelos desde el detalle de la actividad.`, 'error'] : [done, 'success'], 'Asignada');
  }
  function addLink() {
    const url = toHttpUrl(linkDraft);
    if (!url) { setError('El enlace no es válido. Pégalo completo, por ejemplo el de la carpeta de Drive.'); return; }
    if (links.length >= 20) { setError('Puedes añadir hasta 20 enlaces.'); return; }
    setError(''); if (!links.some(l => l.url === url)) setLinks(old => [...old, { label: linkLabel(url), url }]); setLinkDraft('');
  }
  function pickFiles(list: FileList | null) {
    const picked = [...(list ?? [])];
    const tooBig = picked.filter(f => f.size > MAX_FILE);
    setError(tooBig.length ? `${tooBig.map(f => f.name).join(', ')} pesa${tooBig.length === 1 ? '' : 'n'} más de 10 MB.` : '');
    setFiles(old => [...old, ...picked.filter(f => f.size <= MAX_FILE && !old.some(o => o.name === f.name && o.size === f.size))].slice(0, 10));
  }
  const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const quickDue = [{ label: '1 semana', days: 7 }, { label: '2 semanas', days: 14 }, { label: '1 mes', days: 30 }];
  return <Modal wide title="Asignar actividad" onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        <ErrorMessage message={error} />
        {locked ? <LockedStudent student={locked} /> : students.length ? <Field label="Alumno" required><select required value={studentId} onChange={e => setStudentId(e.target.value)} autoFocus><option value="">Elige un alumno</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          : <Notice tone="warn" icon={<WarningCircle size={18} weight="fill" />}><p>No tienes alumnos activos. Agrega uno antes de asignar actividades.</p></Notice>}
        <Field label="Nombre de la actividad" required><input autoFocus={!!locked} required minLength={3} maxLength={180} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Implementar autenticación de usuarios" /></Field>
        <Field label="Qué debe hacer y entregar" required><textarea required rows={3} maxLength={6000} value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <fieldset className="choices"><legend>Habilidades a evaluar <span className="required" aria-hidden="true">*</span></legend>
          <div className="chips" ref={chips}>
            {skills.map(s => <label className={`chip-check ${s.id === fresh ? 'is-new' : ''}`} key={s.id} title={s.description}><input type="checkbox" data-skill={s.id} checked={skillIds.includes(s.id)} onChange={() => setSkillIds(old => old.includes(s.id) ? old.filter(id => id !== s.id) : [...old, s.id])} /><Check size={12} weight="bold" aria-hidden="true" />{s.name}</label>)}
            <button ref={addChip} type="button" className="chip-add" aria-expanded={newSkill} onClick={() => { if (newSkill) skillDraft.reset(); setNewSkill(!newSkill); }}><Plus size={13} weight="bold" aria-hidden="true" />Nueva habilidad</button>
          </div>
          {newSkill && <NewSkill draft={skillDraft} onCancel={() => { setNewSkill(false); addChip.current?.focus(); }} />}
        </fieldset>
        <div className="form-grid">
          <Field label="Inicio" hint="Cuándo empieza a trabajarla. Ubica la actividad en su plan."><input type="date" value={startAt} onChange={e => setStartAt(e.target.value)} /></Field>
          <PhaseField value={phase} onChange={setPhase} studentId={studentId} />
          <Field label="Fecha límite" hint={<span className="quick-dates">{quickDue.map(q => { const value = futureInput(q.days, '23:59'); return <button type="button" key={q.days} aria-pressed={dueAt === value} onClick={() => setDueAt(value)}>{q.label}</button>; })}<button type="button" aria-pressed={!dueAt} onClick={() => setDueAt('')}>Sin fecha</button></span>}>
            <input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} />
          </Field>
          <Field label="Primera revisión" required hint="Tu cita de seguimiento con el alumno."><input type="datetime-local" required value={firstReviewAt} onChange={e => setFirstReviewAt(e.target.value)} /></Field>
        </div>
        <LoadNotice studentId={studentId} dueAt={dueAt} />
        <fieldset className="material">
          <legend>Material <span className="muted">(opcional)</span></legend>
          <div className="material-inputs">
            <div className="material-link-add">
              <LinkSimple size={16} aria-hidden="true" />
              <input type="text" inputMode="url" autoComplete="off" spellCheck={false} aria-label="Enlace del material" value={linkDraft} maxLength={2000} onChange={e => setLinkDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} placeholder="Pega un enlace de Drive u otro sitio" />
              <Button variant="secondary" size="sm" disabled={!linkDraft.trim()} onClick={addLink}>Añadir</Button>
            </div>
            <input ref={fileInput} type="file" multiple className="sr-only" tabIndex={-1} aria-label="Elegir documentos" accept={FILE_TYPES} onChange={e => { pickFiles(e.target.files); e.target.value = ''; }} />
            <Button variant="secondary" onClick={() => fileInput.current?.click()}><UploadSimple size={16} />Subir documentos</Button>
          </div>
          {links.length + files.length > 0 ? <ul className="material-list">
            {links.map(l => <li key={l.url}>
              <span className="material-icon" aria-hidden="true"><LinkSimple size={16} weight="bold" /></span>
              <span className="material-text"><span className="material-title">{l.label}</span><small>{shortUrl(l.url)}</small></span>
              <button type="button" className="icon-button" aria-label={`Quitar ${l.label}`} onClick={() => setLinks(old => old.filter(x => x.url !== l.url))}><X size={14} /></button>
            </li>)}
            {files.map((f, i) => <li key={`${f.name}-${f.size}-${i}`}>
              <span className="material-icon" aria-hidden="true"><File size={16} weight="bold" /></span>
              <span className="material-text"><span className="material-title">{f.name}</span><small>{fileSize(f.size)}</small></span>
              <button type="button" className="icon-button" aria-label={`Quitar ${f.name}`} onClick={() => setFiles(old => old.filter((_, n) => n !== i))}><X size={14} /></button>
            </li>)}
          </ul> : <small className="field-hint">Puedes añadir varios enlaces y documentos (PDF, imagen, texto u Office, hasta 10 MB cada uno).</small>}
        </fieldset>
      </div>
      <Footer busy={busy} done={done} onClose={onClose} disabled={!locked && !students.length}>Asignar actividad</Footer>
    </form>
  </Modal>;
}

const PHASES = ['Protocolo', 'Marco teórico', 'Desarrollo', 'Experimentos', 'Redacción', 'Defensa'];
/** Fase opcional con sugerencias: las de tesis y las que el alumno ya usa. */
function PhaseField({ value, onChange, studentId }: { value: string; onChange: (v: string) => void; studentId: string }) {
  const { workspace } = useApp();
  const used = [...new Set(workspace.assignments.filter(a => a.studentId === studentId && a.phase).map(a => a.phase!))];
  const options = [...new Set([...used, ...PHASES])];
  return <Field label="Fase" hint="Opcional. Agrupa las actividades en su plan, por ejemplo en una tesis.">
    <input list="phase-options" maxLength={80} value={value} onChange={e => onChange(e.target.value)} placeholder="Ej. Marco teórico" autoComplete="off" />
    <datalist id="phase-options">{options.map(p => <option key={p} value={p} />)}</datalist>
  </Field>;
}
/** Aviso, no bloqueo: cuántas entregas tiene ya esa semana y cuánto trabajo abierto lleva en total. */
function LoadNotice({ studentId, dueAt }: { studentId: string; dueAt: string }) {
  const { workspace } = useApp();
  const student = workspace.students.find(s => s.id === studentId);
  const due = fromInput(dueAt);
  if (!student || !due) return null;
  const week = weekLoad(scoped(workspace), studentId, due); const open = student.openAssignmentCount ?? 0;
  if (week.length < 2 && open < 3) return null;
  return <Notice tone="warn" icon={<WarningCircle size={18} weight="fill" />}><p>
    {week.length >= 1 && <>Esa semana ya tiene {plural(week.length, 'entrega', 'entregas')} ({week.map(a => a.title).join(', ')}). </>}
    {open >= 3 && <>Lleva {plural(open, 'actividad abierta', 'actividades abiertas')} en total{student.areaIds.length > 1 ? ', contando otras áreas' : ''}.</>}
  </p></Notice>;
}

function AssignmentEditForm({ assignment, mode, onClose }: { assignment: Assignment; mode: 'edit' | 'cancel'; onClose: () => void }) {
  const { busy, error, save, done } = useSave(onClose);
  const [title, setTitle] = useState(assignment.title); const [description, setDescription] = useState(assignment.description);
  const [dueAt, setDueAt] = useState(assignment.dueAt ? toInputDateTime(assignment.dueAt) : ''); const [blockedReason, setBlockedReason] = useState(assignment.blockedReason); const [reason, setReason] = useState('');
  const [startAt, setStartAt] = useState(assignment.startAt ? toInputDate(assignment.startAt) : ''); const [phase, setPhase] = useState(assignment.phase ?? '');
  const dateChanged = fromInput(dueAt) !== assignment.dueAt;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'cancel') { save(() => patch(`/assignments/${assignment.id}`, { version: assignment.version, status: 'cancelled', changeReason: reason.trim() }), 'Actividad cancelada. Su historial se conserva.'); return; }
    save(() => patch(`/assignments/${assignment.id}`, { version: assignment.version, title: title.trim(), description: description.trim(), blockedReason: blockedReason.trim(), dueAt: fromInput(dueAt), startAt: startAt ? fromInput(`${startAt}T09:00`) : null, phase: phase.trim(), changeReason: reason.trim() || undefined }), 'Actividad actualizada.');
  }
  if (mode === 'cancel') return <Modal title="Cancelar actividad" description={assignment.title} onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        <ErrorMessage message={error} />
        <p className="dialog-text">Se conservan sus entregas y evaluaciones. Las revisiones pendientes de esta actividad se cancelarán.</p>
        <Field label="Motivo" required><textarea autoFocus required rows={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      </div>
      <Footer busy={busy} done={done} onClose={onClose} cancelLabel="Volver" danger>Cancelar actividad</Footer>
    </form>
  </Modal>;
  return <Modal wide title="Editar actividad" onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        <ErrorMessage message={error} />
        <Field label="Nombre de la actividad" required><input required minLength={3} maxLength={180} value={title} onChange={e => setTitle(e.target.value)} /></Field>
        <Field label="Qué debe hacer y entregar"><textarea rows={3} maxLength={6000} value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <div className="form-grid">
          <Field label="Inicio"><input type="date" value={startAt} onChange={e => setStartAt(e.target.value)} /></Field>
          <PhaseField value={phase} onChange={setPhase} studentId={assignment.studentId} />
        </div>
        <Field label="Fecha límite"><input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></Field>
        {dateChanged && <Field label="Motivo del cambio de fecha" required hint="Queda en el historial de la actividad."><input required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} autoFocus /></Field>}
        <Field label="Impedimento" hint="Qué le impide avanzar al alumno y cuál es el siguiente paso. Bórralo cuando se resuelva."><textarea rows={2} maxLength={2000} value={blockedReason} onChange={e => setBlockedReason(e.target.value)} placeholder="Ej. Falta recibir el sensor para empezar las pruebas." /></Field>
      </div>
      <Footer busy={busy} done={done} onClose={onClose}>Guardar cambios</Footer>
    </form>
  </Modal>;
}

/* ---------- Revisiones ---------- */

function ReviewForm({ studentId: initialStudentId, assignmentId: initialAssignmentId, date, onClose }: { studentId?: string; assignmentId?: string; date?: string; onClose: () => void }) {
  const { workspace } = useApp(); const { busy, error, save, done } = useSave(onClose);
  const lockedAssignment = initialAssignmentId ? workspace.assignments.find(a => a.id === initialAssignmentId) : undefined;
  const lockedStudentId = initialStudentId ?? lockedAssignment?.studentId;
  // Desde un alumno se propone su actividad abierta más urgente; se puede cambiar.
  const [studentId, setStudentId] = useState(lockedStudentId ?? ''); const [assignmentId, setAssignmentId] = useState(initialAssignmentId ?? (lockedStudentId ? currentAssignment(scoped(workspace), lockedStudentId)?.id ?? '' : ''));
  const [startsAt, setStartsAt] = useState(date ? `${date.slice(0, 10)}T10:00` : futureInput()); const [duration, setDuration] = useState('30'); const [type, setType] = useState<'follow_up' | 'delivery' | 'evaluation'>('follow_up'); const [notes, setNotes] = useState('');
  const students = workspace.students.filter(s => s.areaIds.includes(workspace.user.areaId!) && s.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const assignments = workspace.assignments.filter(a => a.studentId === studentId && a.areaId === workspace.user.areaId && !['cancelled', 'completed'].includes(a.status));
  const student = workspace.students.find(s => s.id === studentId);
  // Solo se ven las revisiones propias: el aviso cubre los choques de tu agenda, no los de otras áreas.
  const start = startsAt ? Date.parse(fromInput(startsAt) ?? '') : NaN; const end = start + Number(duration) * 60000;
  const clash = Number.isNaN(start) ? undefined : workspace.reviews.find(r => r.status === 'scheduled' && r.areaId === workspace.user.areaId && Date.parse(r.startsAt) < end && Date.parse(r.startsAt) + r.durationMinutes * 60000 > start);
  function submit(e: FormEvent) {
    e.preventDefault();
    const when = fromInput(startsAt);
    save(() => post('/reviews', { studentId, assignmentId: assignmentId || null, startsAt: when, durationMinutes: Number(duration), type, notes: notes.trim() }), `Revisión con ${firstName(student?.name)} programada ${when ? `${relativeDay(when)} a las ${formatTime(when)}` : ''}.`, 'Programada');
  }
  return <Modal title="Programar revisión" onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        <ErrorMessage message={error} />
        {lockedStudentId ? <LockedStudent student={workspace.students.find(s => s.id === lockedStudentId)} />
          : <Field label="Alumno" required><select required autoFocus value={studentId} onChange={e => { setStudentId(e.target.value); setAssignmentId(''); }}><option value="">Elige un alumno</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {lockedAssignment ? <Locked label="Actividad"><strong>{lockedAssignment.title}</strong></Locked>
          : studentId && <Field label="Actividad"><select value={assignmentId} onChange={e => setAssignmentId(e.target.value)}><option value="">Ninguna, seguimiento general</option>{assignments.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></Field>}
        <div className="form-grid form-grid-date">
          <Field label="Fecha y hora" required><input type="datetime-local" required value={startsAt} onChange={e => setStartsAt(e.target.value)} autoFocus={!!lockedStudentId} /></Field>
          <div className="field"><span className="field-label">Duración (min)</span><Segmented label="Duración en minutos" value={duration} onChange={setDuration} className="segmented-block" options={['15', '30', '45', '60'].map(v => ({ value: v, label: v }))} /></div>
        </div>
        {clash && <Notice tone="warn" icon={<WarningCircle size={18} weight="fill" />}><p>Choca con tu revisión de las {formatTime(clash.startsAt)} con {workspace.students.find(s => s.id === clash.studentId)?.name ?? 'otro alumno'}. Puedes guardarla de todos modos.</p></Notice>}
        <div className="field"><span className="field-label">Tipo</span><Segmented label="Tipo de revisión" value={type} onChange={setType} options={[{ value: 'follow_up', label: 'Seguimiento' }, { value: 'delivery', label: 'Entrega' }, { value: 'evaluation', label: 'Evaluación' }]} /></div>
        <Field label="Temas a revisar"><textarea rows={2} maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" /></Field>
      </div>
      <Footer busy={busy} done={done} onClose={onClose}>Programar revisión</Footer>
    </form>
  </Modal>;
}

function ReviewUpdateForm({ review, mode: initialMode, onClose }: { review: Review; mode: 'record' | 'reschedule' | 'cancel'; onClose: () => void }) {
  const { workspace } = useApp(); const { busy, error, save, done } = useSave(onClose);
  const [outcomeKind, setOutcomeKind] = useState<'completed' | 'missed'>('completed');
  const [text, setText] = useState(''); const [startsAt, setStartsAt] = useState(toInputDateTime(review.startsAt));
  const student = workspace.students.find(s => s.id === review.studentId);
  const [hours, setHours] = useState(''); const [agreements, setAgreements] = useState<string[]>([]); const [draft, setDraft] = useState('');
  const carried = previousWithPending(workspace, review);
  const addAgreement = () => { const t = draft.trim(); if (t && !agreements.includes(t) && agreements.length < 30) setAgreements(old => [...old, t]); setDraft(''); };
  const context = `${student?.name ?? 'Alumno'} · ${reviewTitle(review, workspace)} · ${dayLabel(review.startsAt)}, ${formatTime(review.startsAt)}`;
  function submit(e: FormEvent) {
    e.preventDefault();
    const base = { version: review.version };
    if (initialMode === 'reschedule') { const when = fromInput(startsAt); save(() => patch(`/reviews/${review.id}`, { ...base, startsAt: when, changeReason: text.trim() }), `Revisión movida a ${when ? `${relativeDay(when)}, ${formatTime(when)}` : 'la nueva fecha'}.`); return; }
    if (initialMode === 'cancel') { save(() => patch(`/reviews/${review.id}`, { ...base, status: 'cancelled', outcome: text.trim(), changeReason: text.trim() }), 'Revisión cancelada.'); return; }
    const pending = draft.trim() && !agreements.includes(draft.trim()) ? [...agreements, draft.trim()] : agreements;
    const extra = outcomeKind === 'completed' ? { hours: hours ? Number(hours) : null, agreements: pending.map(t => ({ text: t, done: false })) } : {};
    save(() => patch(`/reviews/${review.id}`, { ...base, status: outcomeKind, outcome: text.trim(), changeReason: outcomeKind === 'completed' ? undefined : text.trim(), ...extra }), outcomeKind === 'completed' ? 'Revisión registrada.' : 'Se registró que la revisión no se realizó.', 'Registrada');
  }
  const titles = { record: 'Registrar revisión', reschedule: 'Reprogramar revisión', cancel: 'Cancelar revisión' };
  return <Modal title={titles[initialMode]} description={context} onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        <ErrorMessage message={error} />
        {initialMode === 'record' && <div className="field"><span className="field-label">¿Se realizó?</span><Segmented label="¿Se realizó la revisión?" value={outcomeKind} onChange={setOutcomeKind} options={[{ value: 'completed', label: 'Sí, se realizó' }, { value: 'missed', label: 'No se realizó' }]} /></div>}
        {initialMode === 'reschedule' && <Field label="Nueva fecha y hora" required><input type="datetime-local" required value={startsAt} onChange={e => setStartsAt(e.target.value)} autoFocus /></Field>}
        {initialMode === 'record' && carried && <AgreementList review={carried} title={pendingTitle(carried)} editable />}
        <Field label={initialMode === 'record' && outcomeKind === 'completed' ? 'Resultado' : 'Motivo'} required><textarea required rows={3} maxLength={4000} value={text} onChange={e => setText(e.target.value)} autoFocus={initialMode !== 'reschedule'} /></Field>
        {initialMode === 'record' && outcomeKind === 'completed' && <>
          <fieldset className="choices"><legend>Acuerdos <span className="muted">(se revisan en la siguiente cita)</span></legend>
            {agreements.length > 0 && <ul className="agreement-drafts">{agreements.map(a => <li key={a}><span>{a}</span><button type="button" className="icon-button" aria-label={`Quitar acuerdo: ${a}`} onClick={() => setAgreements(old => old.filter(x => x !== a))}><X size={14} /></button></li>)}</ul>}
            <div className="agreement-add"><input aria-label="Nuevo acuerdo" maxLength={500} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAgreement(); } }} placeholder="Ej. Agregar pruebas al registro de usuarios" /><Button variant="secondary" size="sm" disabled={!draft.trim()} onClick={addAgreement}><Plus size={14} weight="bold" />Añadir</Button></div>
          </fieldset>
          {student?.hoursRequired ? <Field label="Horas trabajadas" hint={`Se suman a sus ${student.hoursRequired} h requeridas.`}><input type="number" inputMode="decimal" min={0} max={500} step={0.5} value={hours} onChange={e => setHours(e.target.value)} placeholder="Ej. 12" /></Field> : null}
        </>}
      </div>
      <Footer busy={busy} done={done} onClose={onClose} cancelLabel="Volver" danger={initialMode === 'cancel'}>{initialMode === 'reschedule' ? 'Reprogramar' : initialMode === 'cancel' ? 'Cancelar revisión' : 'Guardar'}</Footer>
    </form>
  </Modal>;
}

/* ---------- Reuniones del jefe ---------- */

function MeetingForm({ meeting, date, areaIds: initialAreas, cancel = false, onClose }: { meeting?: Meeting; date?: string; areaIds?: AreaId[]; cancel?: boolean; onClose: () => void }) {
  const { workspace } = useApp(); const { busy, error, setError, save, done } = useSave(onClose);
  const [title, setTitle] = useState(meeting?.title ?? ''); const [startsAt, setStartsAt] = useState(meeting ? toInputDateTime(meeting.startsAt) : date ? `${date.slice(0, 10)}T12:00` : futureInput(1, '12:00'));
  const [duration, setDuration] = useState(String(meeting?.durationMinutes ?? 60)); const [areas, setAreas] = useState<AreaId[]>(meeting?.areaIds ?? initialAreas ?? AREAS.map(a => a.id));
  const [place, setPlace] = useState(meeting?.place ?? ''); const [notes, setNotes] = useState(meeting?.notes ?? '');
  const start = Date.parse(fromInput(startsAt) ?? ''); const end = start + Number(duration) * 60000;
  // Choque con otra reunión del jefe en ese horario: aviso, no bloqueo.
  const clash = Number.isNaN(start) ? undefined : workspace.meetings.find(m => m.id !== meeting?.id && m.status === 'scheduled' && Date.parse(m.startsAt) < end && Date.parse(m.startsAt) + m.durationMinutes * 60000 > start);
  const who = (ids: AreaId[]) => ids.map(id => AREAS.find(a => a.id === id)!.name).join(', ');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (cancel && meeting) { save(() => patch(`/meetings/${meeting.id}`, { version: meeting.version, status: 'cancelled' }), `Reunión cancelada. Se avisó a ${who(meeting.areaIds)}.`, 'Cancelada'); return; }
    if (!areas.length) { setError('Elige al menos un responsable.'); return; }
    const when = fromInput(startsAt);
    const body = { title: title.trim(), startsAt: when, durationMinutes: Number(duration), areaIds: areas, place: place.trim(), notes: notes.trim() };
    save(() => meeting ? patch(`/meetings/${meeting.id}`, { ...body, version: meeting.version }) : post('/meetings', body),
      `Reunión ${meeting ? 'actualizada' : 'agendada'} ${when ? `${relativeDay(when)} a las ${formatTime(when)}` : ''}. La verán ${who(areas)}.`, meeting ? 'Guardada' : 'Agendada');
  }
  if (cancel && meeting) return <Modal title="Cancelar reunión" description={`${meeting.title} · ${dayLabel(meeting.startsAt)}, ${formatTime(meeting.startsAt)}`} onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <div className="dialog-body"><ErrorMessage message={error} /><p className="dialog-text">Desaparecerá de la agenda de {who(meeting.areaIds)}. Queda en el historial.</p></div>
      <Footer busy={busy} done={done} onClose={onClose} cancelLabel="Volver" danger>Cancelar reunión</Footer>
    </form>
  </Modal>;
  return <Modal title={meeting ? 'Editar reunión' : 'Agendar reunión'} description="Aparecerá en el calendario y en el día de los responsables que elijas." onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        <ErrorMessage message={error} />
        <Field label="Asunto" required><input autoFocus required minLength={3} maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Revisión mensual de avances" /></Field>
        <fieldset className="choices"><legend>Con <span className="required" aria-hidden="true">*</span></legend>
          <div className="chips">{AREAS.map(a => <label className="chip-check" key={a.id}><input type="checkbox" checked={areas.includes(a.id)} onChange={() => setAreas(old => old.includes(a.id) ? old.filter(x => x !== a.id) : [...old, a.id])} /><Check size={12} weight="bold" aria-hidden="true" />Responsable de {a.name}</label>)}</div>
        </fieldset>
        <div className="form-grid form-grid-date">
          <Field label="Fecha y hora" required><input type="datetime-local" required value={startsAt} onChange={e => setStartsAt(e.target.value)} /></Field>
          <div className="field"><span className="field-label">Duración (min)</span><Segmented label="Duración en minutos" value={duration} onChange={setDuration} className="segmented-block" options={['30', '45', '60', '90'].map(v => ({ value: v, label: v }))} /></div>
        </div>
        {clash && <Notice tone="warn" icon={<WarningCircle size={18} weight="fill" />}><p>Choca con «{clash.title}» a las {formatTime(clash.startsAt)}. Puedes guardarla de todos modos.</p></Notice>}
        <Field label="Lugar o enlace" hint="Sala, oficina o enlace de videollamada. Opcional."><input maxLength={300} value={place} onChange={e => setPlace(e.target.value)} placeholder="Ej. Sala de juntas o meet.google.com/…" /></Field>
        <Field label="Temas"><textarea rows={3} maxLength={4000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" /></Field>
      </div>
      <Footer busy={busy} done={done} onClose={onClose}>{meeting ? 'Guardar cambios' : 'Agendar reunión'}</Footer>
    </form>
  </Modal>;
}

/* ---------- Entrega y evaluación ---------- */

type ProgressKind = 'partial' | 'complete' | 'not_submitted';
const PROGRESS_KINDS: { value: ProgressKind; label: string; hint: string }[] = [
  { value: 'partial', label: 'Avance', hint: 'Va en camino. La actividad sigue en curso.' },
  { value: 'complete', label: 'Entrega final', hint: 'Terminó. Queda lista para evaluar.' },
  { value: 'not_submitted', label: 'No entregó', hint: 'Venció la fecha sin entrega.' },
];
const QUICK_PROGRESS: Record<ProgressKind, string[]> = {
  partial: ['Mostró avance en la revisión', 'Compartió su repositorio o carpeta', 'Resolvió los pendientes acordados', 'Tiene dudas por resolver'],
  complete: ['Presentó una demostración funcional', 'Entregó el documento final', 'Subió la evidencia a Drive'],
  not_submitted: ['No se presentó', 'Pidió más tiempo', 'Se acordó una nueva fecha'],
};

/**
 * Un solo formulario para registrar lo que presentó el alumno: un avance (con porcentaje estimado), la entrega final
 * o que no entregó. Se abre desde el alumno, la actividad, Hoy o «Nuevo»; si no se sabe la actividad, se elige aquí.
 */
function ProgressForm({ assignment: given, studentId: givenStudent, onClose }: { assignment?: Assignment; studentId?: string; onClose: () => void }) {
  const app = useApp(); const { workspace } = app; const { busy, error, setError, save, done } = useSave(onClose);
  const own = scoped(workspace);
  const students = own.students.filter(s => s.status === 'active' && own.assignments.some(a => a.studentId === s.id && isOpenAssignment(a))).sort((a, b) => a.name.localeCompare(b.name));
  const [studentId, setStudentId] = useState(given?.studentId ?? givenStudent ?? '');
  const open = own.assignments.filter(a => a.studentId === studentId && isOpenAssignment(a));
  const [assignmentId, setAssignmentId] = useState(given?.id ?? (studentId ? currentAssignment(own, studentId)?.id ?? '' : ''));
  const assignment = given ?? own.assignments.find(a => a.id === assignmentId);
  const student = workspace.students.find(s => s.id === (assignment?.studentId ?? studentId));
  const late = !!assignment?.dueAt && new Date(assignment.dueAt) < new Date() && !workspace.deliveries.some(d => d.assignmentId === assignment.id && d.completeness === 'complete');
  const previous = assignment ? assignmentProgress(assignment, workspace) : null;
  const [kind, setKind] = useState<ProgressKind>(given?.status === 'changes_requested' ? 'complete' : 'partial');
  const [progress, setProgress] = useState<number | null>(previous !== null && previous < 100 ? Math.min(90, previous + 25) : 50);
  const [summary, setSummary] = useState(''); const [url, setUrl] = useState(''); const [hours, setHours] = useState('');
  const [receivedAt, setReceivedAt] = useState(toInputDateTime(new Date().toISOString())); const [editDate, setEditDate] = useState(false);
  const [evaluateNow, setEvaluateNow] = useState(true);
  const none = kind === 'not_submitted';
  const kinds = PROGRESS_KINDS.filter(k => k.value !== 'not_submitted' || late);
  function pickStudent(id: string) { setStudentId(id); setAssignmentId(currentAssignment(own, id)?.id ?? ''); }
  function addPhrase(text: string) { setSummary(old => old.includes(text) ? old.replace(text, '').replace(/\s*\.\s*\./g, '.').replace(/^\.\s*|\s{2,}/g, ' ').trim() : `${old.trim()}${old.trim() && !/[.!?]$/.test(old.trim()) ? '.' : ''} ${text}.`.trim()); }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!assignment) { setError('Elige el alumno y la actividad.'); return; }
    if (summary.trim().length < 3) { setError(none ? 'Escribe el motivo y lo que acordaron.' : 'Escribe qué presentó el alumno.'); return; }
    if (!none && url.trim() && !toHttpUrl(url)) { setError('El enlace no es válido. Pégalo completo.'); return; }
    const who = firstName(student?.name);
    const body = { version: assignment.version, receivedAt: fromInput(receivedAt), summary: summary.trim(), url: none ? '' : url.trim() ? toHttpUrl(url) : '', completeness: kind, hours: !none && hours ? Number(hours) : null, progress: kind === 'partial' ? progress : kind === 'complete' ? 100 : null };
    const chain = kind === 'complete' && evaluateNow;
    save(() => post<{ assignment: Assignment }>(`/assignments/${assignment.id}/deliveries`, body),
      kind === 'complete' ? (chain ? `Entrega de ${who} registrada. Ahora evalúala.` : `Entrega de ${who} registrada. Ya puedes evaluarla.`) : kind === 'partial' ? `Avance de ${who} registrado${progress !== null ? ` (${progress} %)` : ''}.` : `Se registró que ${who} no entregó.`,
      kind === 'partial' ? 'Avance registrado' : 'Registrada',
      chain ? result => app.modal({ type: 'evaluate', assignment: result.assignment }) : undefined);
  }
  const submitLabel = none ? 'Confirmar que no entregó' : kind === 'complete' ? (evaluateNow ? 'Registrar y evaluar' : 'Registrar entrega final') : 'Registrar avance';
  return <Modal title={kind === 'complete' ? 'Registrar entrega' : 'Registrar avance'} description={assignment ? `${student?.name ?? ''} · ${assignment.title}` : 'Elige el alumno y la actividad.'} onClose={() => !busy && onClose()}>
    <form onSubmit={submit}>
      <div className="dialog-body">
        <ErrorMessage message={error} />
        {!given && (givenStudent ? <LockedStudent student={student} /> : <Field label="Alumno" required><select required autoFocus value={studentId} onChange={e => pickStudent(e.target.value)}><option value="">Elige un alumno</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>)}
        {!given && studentId && (open.length > 1 ? <Field label="Actividad" required><select required value={assignmentId} onChange={e => setAssignmentId(e.target.value)}>{open.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></Field>
          : open.length === 1 ? <Locked label="Actividad"><strong>{open[0].title}</strong></Locked>
          : <Notice tone="warn" icon={<WarningCircle size={18} weight="fill" />}><p>No tiene actividades abiertas en tu área. Asígnale una primero.</p></Notice>)}
        {assignment && <>
          <fieldset className="choices"><legend>¿Qué presentó?</legend>
            <div className="progress-kinds" role="radiogroup" aria-label="Tipo de registro">{kinds.map(k => <label key={k.value} className={`progress-kind kind-${k.value}`}>
              <input type="radio" name="progress-kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} />
              <span className="progress-kind-mark" aria-hidden="true" />
              <span><strong>{k.label}</strong><small>{k.value === 'not_submitted' ? `La fecha venció ${relativeDay(assignment.dueAt!)}. Las habilidades quedan sin evaluar.` : k.hint}</small></span>
            </label>)}</div>
          </fieldset>
          {kind === 'partial' && <div className="field"><span className="field-label">Avance estimado {previous !== null && previous < 100 && <span className="muted">· el anterior fue {previous} %</span>}</span>
            <div className="progress-pick" role="radiogroup" aria-label="Avance estimado">
              {[25, 50, 75, 90].map(v => <button type="button" role="radio" key={v} aria-checked={progress === v} onClick={() => setProgress(v)}>{v} %</button>)}
              <button type="button" role="radio" aria-checked={progress === null} onClick={() => setProgress(null)}>Sin estimar</button>
            </div>
            <span className="progress-preview" aria-hidden="true"><span style={{ width: `${progress ?? 0}%` }} /></span>
          </div>}
          <div className="field">
            <label className="field-label" htmlFor="progress-summary">{none ? 'Motivo y acuerdo con el alumno' : kind === 'complete' ? 'Qué presentó el alumno' : 'Qué avanzó'} <span className="required" aria-hidden="true">*</span></label>
            <div className="quick-notes">{QUICK_PROGRESS[kind].map(t => <button type="button" key={t} aria-pressed={summary.includes(t)} onClick={() => addPhrase(t)}>{summary.includes(t) && <Check size={12} weight="bold" aria-hidden="true" />}{t}</button>)}</div>
            <textarea id="progress-summary" required minLength={3} rows={3} maxLength={5000} value={summary} onChange={e => setSummary(e.target.value)} />
          </div>
          {!none && <div className="form-grid">
            <Field label="Enlace a la evidencia"><input type="text" inputMode="url" autoComplete="off" spellCheck={false} value={url} maxLength={2000} onChange={e => setUrl(e.target.value)} placeholder="Drive, repositorio u otro sitio (opcional)" /></Field>
            {student?.hoursRequired ? <Field label="Horas trabajadas" hint="Opcional. Se suman a sus horas."><input type="number" inputMode="decimal" min={0} max={500} step={0.5} value={hours} onChange={e => setHours(e.target.value)} /></Field> : null}
          </div>}
          {editDate ? <Field label={none ? 'Fecha de confirmación' : 'Fecha y hora en que lo presentó'} required><input type="datetime-local" required value={receivedAt} onChange={e => setReceivedAt(e.target.value)} autoFocus /></Field>
            : <p className="progress-when">Se registra con fecha de {dayLabel(fromInput(receivedAt) ?? new Date().toISOString()).toLowerCase()}, {formatTime(fromInput(receivedAt) ?? new Date().toISOString())}. <button type="button" className="text-link" onClick={() => setEditDate(true)}>Cambiar fecha</button></p>}
          {kind === 'complete' && <label className="switch"><input type="checkbox" checked={evaluateNow} onChange={e => setEvaluateNow(e.target.checked)} /><span>Evaluar ahora, al guardar</span></label>}
        </>}
      </div>
      <Footer busy={busy} done={done} onClose={onClose} danger={none} disabled={!assignment}>{submitLabel}</Footer>
    </form>
  </Modal>;
}

/* ---------- Evaluación: una barra por habilidad y un resumen en vivo ---------- */

const levelTone = (n: number) => n < 3 ? 'danger' : n < 6 ? 'warn' : n < 9 ? 'info' : 'ok';
const levelKey = (n: number) => n < 3 ? 'low' : n < 6 ? 'mid' : n < 9 ? 'good' : 'top';
const ZONES = [{ key: 'low', label: 'Inicial', from: 0, to: 2 }, { key: 'mid', label: 'En desarrollo', from: 3, to: 5 }, { key: 'good', label: 'Competente', from: 6, to: 8 }, { key: 'top', label: 'Avanzado', from: 9, to: 10 }] as const;
/** Frases frecuentes según el nivel: un toque en lugar de escribir. */
const QUICK_NOTES: Record<'low' | 'mid' | 'good' | 'top', string[]> = {
  low: ['No logró el objetivo', 'Necesita acompañamiento', 'Debe repasar lo básico'],
  mid: ['Avanzó con apoyo', 'Necesita más práctica', 'Lo resolvió en parte'],
  good: ['Cumple lo esperado', 'Trabajó con autonomía', 'Buena solución'],
  top: ['Superó lo esperado', 'Propuso mejoras', 'Puede apoyar a otros'],
};
const QUICK_FEEDBACK = ['Buen trabajo, sigue así.', 'Cuida la documentación.', 'Acordamos los siguientes pasos.', 'Pide ayuda si te atoras.'];

/**
 * Barra de calificación de 0 a 10: se toca o se arrastra en cualquier punto y se llena con el color del nivel.
 * Sin nota significa que no se observó (nunca cero). Teclado: flechas, Re Pág/Av Pág, Inicio, Fin, dígitos y Supr.
 */
function RatingBar({ value, onChange, label }: { value: number | null; onChange: (value: number | null) => void; label: string }) {
  const bar = useRef<HTMLDivElement>(null); const [dragging, setDragging] = useState(false);
  const fromPointer = (clientX: number) => { const rect = bar.current!.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 10); };
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const v = value ?? -1; let next: number | null | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(10, v + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, v - 1);
    else if (e.key === 'PageUp') next = Math.min(10, v + 2);
    else if (e.key === 'PageDown') next = Math.max(0, v - 2);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 10;
    else if (e.key === 'Delete' || e.key === 'Backspace') next = null;
    else if (/^[0-9]$/.test(e.key)) next = Number(e.key);
    if (next === undefined) return;
    e.preventDefault(); onChange(next);
  }
  const tone = value === null ? 'empty' : levelTone(value);
  return <div className={`rating tone-${tone} ${dragging ? 'is-dragging' : ''}`}>
    <div className="rating-hit" role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={10} aria-valuenow={value ?? undefined} aria-valuetext={value === null ? 'Sin evaluar' : `${value}, ${scoreLevel(value)}`}
      onKeyDown={onKey}
      onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); onChange(fromPointer(e.clientX)); }}
      onPointerMove={e => { if (dragging) { const next = fromPointer(e.clientX); if (next !== value) onChange(next); } }}
      onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
      <div className="rating-bar" ref={bar}>
        <span className="rating-fill" style={{ clipPath: `inset(0 ${value === null ? 100 : 100 - value * 10}% 0 0 round 999px)` }} />
        {Array.from({ length: 11 }, (_, n) => <i key={n} className={`rating-tick ${value !== null && n <= value ? 'is-on' : ''}`} style={{ left: `${n * 10}%` }} />)}
        <span className="rating-thumb-track" style={{ transform: `translateX(${(value ?? 0) * 10}%)` }}><span className="rating-thumb">{value ?? ''}</span></span>
      </div>
    </div>
    <div className="rating-zones" aria-hidden="true">{ZONES.map(z => <span key={z.key} className={value !== null && value >= z.from && value <= z.to ? 'is-active' : ''} style={{ flexGrow: z.to - z.from + 1 }}>{z.label}</span>)}</div>
  </div>;
}

interface ScoreRow { skillId: string; score: number | null; notes: string[]; text: string; writing: boolean; added: boolean }
function EvaluationForm({ assignment, onClose }: { assignment: Assignment; onClose: () => void }) {
  const { workspace } = useApp(); const { busy, error, setError, save, done } = useSave(onClose);
  const [rows, setRows] = useState<ScoreRow[]>(assignment.skillIds.map(skillId => ({ skillId, score: null, notes: [], text: '', writing: false, added: false })));
  const [feedback, setFeedback] = useState(''); const [outcome, setOutcome] = useState<'completed' | 'changes_requested'>('completed'); const [nextReviewAt, setNextReviewAt] = useState('');
  const [adding, setAdding] = useState<'pick' | 'new' | null>(null); const [pick, setPick] = useState('');
  const skillDraft = useNewSkill(addSkill);
  const complete = workspace.deliveries.some(d => d.assignmentId === assignment.id && d.completeness === 'complete');
  const student = workspace.students.find(s => s.id === assignment.studentId);
  const endOfToday = Date.parse(`${dateKey()}T23:59:59-06:00`);
  const linkedReview = workspace.reviews.filter(r => r.assignmentId === assignment.id && r.status === 'scheduled' && Date.parse(r.startsAt) <= endOfToday).sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
  const [closeReview, setCloseReview] = useState(!!linkedReview);
  const available = workspace.skills.filter(k => (!k.areaId || k.areaId === assignment.areaId) && !rows.some(r => r.skillId === k.id)).sort((a, b) => a.name.localeCompare(b.name));
  const scored = rows.filter(r => r.score !== null);
  const average = scored.length ? scored.reduce((n, r) => n + r.score!, 0) / scored.length : null;
  const history = skillStats(workspace.evaluations, assignment.studentId);
  const previous = rows.map(r => history.find(h => h.skillId === r.skillId)?.average ?? null);
  const skillName = (id: string) => workspace.skills.find(k => k.id === id)?.name ?? 'Habilidad';
  const update = (i: number, change: Partial<ScoreRow>) => setRows(old => old.map((r, n) => n === i ? { ...r, ...change } : r));
  function addSkill(skillId: string) { setRows(old => [...old, { skillId, score: null, notes: [], text: '', writing: false, added: true }]); setAdding(null); setPick(''); }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (adding === 'new' && skillDraft.dirty) { skillDraft.setError(UNFINISHED_SKILL); return; }
    if (!complete) { setError('Primero registra una entrega completa.'); return; }
    if (!scored.length) { setError('Califica al menos una habilidad. Deja sin nota las que no observaste.'); return; }
    save(() => post(`/assignments/${assignment.id}/evaluations`, { version: assignment.version, scores: rows.map(r => ({ skillId: r.skillId, score: r.score, comment: [...r.notes, r.text.trim()].filter(Boolean).join('. ') })), feedback: feedback.trim(), outcome, nextReviewAt: outcome === 'changes_requested' && nextReviewAt ? fromInput(nextReviewAt) : undefined, reviewId: closeReview && linkedReview ? linkedReview.id : undefined }),
      outcome === 'completed' ? 'Evaluación guardada. Actividad terminada.' : 'Evaluación guardada. Se pidieron correcciones.', 'Guardada');
  }
  // Enter dentro de los campos auxiliares no debe enviar la evaluación completa.
  const onEnter = (e: KeyboardEvent<HTMLInputElement>, action?: () => void) => { if (e.key === 'Enter') { e.preventDefault(); action?.(); } };
  return <Modal wide title="Evaluar actividad" description={`${assignment.title} · ${student?.name ?? ''}`} onClose={() => !busy && onClose()}>
    <form onSubmit={submit} className="evaluation-form">
      <div className="dialog-body">
        <ErrorMessage message={error} />
        {!complete && <Notice tone="warn" icon={<WarningCircle size={18} weight="fill" />}><p>Esta actividad todavía no tiene una entrega completa registrada.</p></Notice>}
        <div className="eval-layout">
          <div className="eval-skills">
            <p className="eval-hint">Toca o arrastra cada barra. Sin nota significa que no lo observaste.</p>
            <ul className="rate-list">{rows.map((r, i) => {
              const skill = workspace.skills.find(k => k.id === r.skillId); const name = skill?.name ?? 'Habilidad';
              return <li key={r.skillId} className={`rate-row ${r.score === null ? 'is-empty' : ''}`}>
                <div className="rate-head">
                  <span className="rate-name"><strong>{name}</strong>{r.added && <Badge tone="info">Añadida</Badge>}</span>
                  {r.score === null ? <span className="rate-empty">Sin evaluar</span> : <span className={`rate-value tone-${levelTone(r.score)}`} aria-hidden="true"><strong key={r.score}>{r.score}</strong>{scoreLevel(r.score)}</span>}
                  {r.score !== null && <IconButton label={`Quitar nota de ${name}`} className="rate-clear" onClick={() => update(i, { score: null, notes: [] })}><X size={13} /></IconButton>}
                  {r.added && <IconButton label={`Quitar ${name}`} onClick={() => setRows(old => old.filter((_, n) => n !== i))}><Trash size={14} /></IconButton>}
                </div>
                {skill?.description && <small className="rate-desc">{skill.description}</small>}
                <RatingBar label={`Calificación de ${name}`} value={r.score} onChange={score => update(i, { score, notes: score === null || r.score === null || levelKey(score) !== levelKey(r.score) ? [] : r.notes })} />
                {r.score !== null && <div className="quick-notes" role="group" aria-label={`Observaciones rápidas sobre ${name}`}>
                  {QUICK_NOTES[levelKey(r.score)].map(note => <button type="button" key={note} aria-pressed={r.notes.includes(note)} onClick={() => update(i, { notes: r.notes.includes(note) ? r.notes.filter(x => x !== note) : [...r.notes, note] })}>{r.notes.includes(note) && <Check size={12} weight="bold" aria-hidden="true" />}{note}</button>)}
                  <button type="button" className="quick-write" aria-expanded={r.writing} onClick={() => update(i, { writing: !r.writing })}><PencilSimple size={12} aria-hidden="true" />Escribir</button>
                </div>}
                {r.writing && <input className="score-comment" autoFocus aria-label={`Observación sobre ${name}`} maxLength={1200} value={r.text} onChange={e => update(i, { text: e.target.value })} onKeyDown={e => onEnter(e)} placeholder="Escribe una observación" />}
              </li>;
            })}</ul>
            <div className="add-skill">
              {adding === null && <Button variant="ghost" size="sm" onClick={() => setAdding('pick')}><Plus size={14} weight="bold" />Añadir habilidad observada</Button>}
              {adding === 'pick' && <div className="add-skill-row">
                {available.length > 0 && <><Select label="Habilidad a añadir" value={pick} onChange={setPick}><option value="">Elige una habilidad</option>{available.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</Select>
                  <Button size="sm" disabled={!pick} onClick={() => addSkill(pick)}>Añadir</Button></>}
                <button type="button" className="text-link" onClick={() => setAdding('new')}>{available.length ? '¿No está? Créala' : 'Crear una habilidad nueva'}</button>
                <IconButton label="Cancelar" onClick={() => setAdding(null)}><X size={15} /></IconButton>
              </div>}
              {adding === 'new' && <NewSkill draft={skillDraft} cancelLabel="Volver" onCancel={() => setAdding(available.length ? 'pick' : null)} />}
            </div>
          </div>
          <aside className="eval-side" aria-label="Resumen de la evaluación">
            <div className="eval-summary">
              <div className="eval-average">
                {average === null ? <span className="eval-average-empty">Sin notas aún</span> : <span className={`eval-average-number tone-${levelTone(average)}`}><RollingNumber value={Math.round(average * 10) / 10} />{/* el número rueda al cambiar */}</span>}
                <span className="eval-average-text"><strong>{average === null ? 'Promedio' : scoreLevel(average)}</strong><small>{scored.length} de {rows.length} calificadas</small></span>
              </div>
              <span className="score-progress" aria-hidden="true">{rows.map(r => <i key={r.skillId} className={r.score === null ? '' : `tone-${levelTone(r.score)}`} />)}</span>
              {rows.length >= 3 && <figure className="radar-figure eval-radar">
                <Radar live size={200} showValues={false} axes={rows.map(r => skillName(r.skillId))} label={`Vista previa de la evaluación: ${rows.map(r => `${skillName(r.skillId)} ${r.score ?? 'sin evaluar'}`).join(', ')}`}
                  series={[...(previous.every(v => v !== null) ? [{ name: 'Su promedio anterior', kind: 'reference' as const, values: previous }] : []), { name: 'Esta evaluación', kind: 'main' as const, values: rows.map(r => r.score) }]} />
                <figcaption className="radar-legend"><span><i className="legend-line legend-main" />Esta evaluación</span>{previous.every(v => v !== null) && <span><i className="legend-line legend-reference" />Su promedio anterior</span>}</figcaption>
              </figure>}
            </div>
            <div className="field"><span className="field-label">Resultado</span><Segmented label="Resultado de la evaluación" className="segmented-block" value={outcome} onChange={setOutcome} options={[{ value: 'completed', label: 'Terminada' }, { value: 'changes_requested', label: 'Pedir correcciones' }]} /></div>
            {outcome === 'changes_requested' && <Field label="Próxima revisión" hint="Opcional. Crea una cita para revisar las correcciones."><input type="datetime-local" value={nextReviewAt} onChange={e => setNextReviewAt(e.target.value)} /></Field>}
            <div className="field">
              <label className="field-label" htmlFor="evaluation-feedback">Retroalimentación <span className="muted">(opcional)</span></label>
              <div className="quick-notes">{QUICK_FEEDBACK.map(t => <button type="button" key={t} aria-pressed={feedback.includes(t)} onClick={() => setFeedback(f => f.includes(t) ? f.replace(t, '').replace(/\s{2,}/g, ' ').trim() : `${f.trim()} ${t}`.trim())}>{feedback.includes(t) && <Check size={12} weight="bold" aria-hidden="true" />}{t}</button>)}</div>
              <textarea id="evaluation-feedback" rows={3} maxLength={5000} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Qué logró, qué puede mejorar y qué sigue" />
            </div>
            {linkedReview && <label className="switch"><input type="checkbox" checked={closeReview} onChange={e => setCloseReview(e.target.checked)} /><span>Marcar como realizada la revisión de {dayDiff(linkedReview.startsAt) === 0 ? 'hoy' : formatDate(linkedReview.startsAt, { weekday: 'long' })} a las {formatTime(linkedReview.startsAt)}</span></label>}
          </aside>
        </div>
      </div>
      <Footer busy={busy} done={done} onClose={onClose}>Guardar evaluación</Footer>
    </form>
  </Modal>;
}
