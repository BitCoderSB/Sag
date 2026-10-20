/**
 * Servidor MCP de SAG para Claude Code (transporte HTTP «streamable», sin estado, respuestas JSON).
 *   claude mcp add --transport http sag https://<sitio>/mcp --header "Authorization: Bearer sag_…"
 * Cada herramienta llama a la misma API que usa la página, con la llave de la persona: mismos permisos,
 * mismas validaciones y el mismo historial. El jefe consulta todo y agenda reuniones; los responsables, su área.
 */
import type { Express, Request, Response } from 'express';
import type { Assignment, Review, Skill, Student, User, Workspace } from '../shared/types.js';
import { phaseInfo, THESIS_PHASES } from '../shared/thesis.js';
import type { Store } from './db.js';

type Json = Record<string, unknown>;
interface Tool { name: string; description: string; inputSchema: Json; run: (args: Json, ctx: Ctx) => Promise<unknown> }
interface Ctx { raw: (path: string) => Promise<{ data: Buffer; type: string; disposition: string }>; user: User; call: <T = Json>(method: string, path: string, body?: unknown) => Promise<T>; upload: (path: string, fields: Record<string, string>, name: string, data: Buffer) => Promise<Json> }

const PROTOCOL = '2025-06-18';
/** El jefe consulta (y agenda reuniones); los responsables no agendan reuniones. */
const READ_ONLY = new Set(['resumen_laboratorio', 'listar_alumnos', 'ver_alumno', 'listar_actividades', 'listar_habilidades', 'buscar_horario_libre', 'listar_revisiones', 'detectar_choques', 'listar_banco', 'listar_reuniones', 'listar_documentos', 'descargar_documento', 'exportar_csv', 'historial', 'exportar_datos', 'ranking_habilidades', 'carga_y_plazos', 'listar_endpoints', 'llamar_api']);
const BOSS = new Set(['agendar_reunion', 'editar_reunion']);
const s = (description: string, extra: Json = {}) => ({ type: 'string', description, ...extra });
const n = (description: string, extra: Json = {}) => ({ type: 'number', description, ...extra });
const obj = (properties: Json, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const norm = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const fail = (message: string): never => { throw new Error(message); };

/** «2026-10-21 10:00», «2026-10-21T10:00» o ISO; sin zona se toma la hora del centro de México. */
function when(value: unknown, field: string): string {
  const t = String(value ?? '').trim();
  if (!t) fail(`Falta ${field}.`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T23:59:00-06:00`).toISOString();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/.exec(t);
  const d = m ? new Date(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00-06:00`) : new Date(t);
  if (Number.isNaN(d.getTime())) fail(`${field}: fecha no válida («${t}»). Usa AAAA-MM-DD HH:MM.`);
  return d.toISOString();
}
const local = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) : null;

function findStudent(w: Workspace, ref: unknown): Student {
  const q = String(ref ?? '').trim(); if (!q) fail('Indica el alumno (nombre, matrícula o id).');
  const exact = w.students.find(x => x.id === q || (x.registration && x.registration.toUpperCase() === q.toUpperCase()));
  if (exact) return exact;
  const hits = w.students.filter(x => norm(x.name).includes(norm(q)) || norm(q).split(' ').every(p => norm(x.name).includes(p)));
  if (hits.length === 1) return hits[0];
  if (!hits.length) fail(`No encontré al alumno «${q}». Usa listar_alumnos para ver los nombres.`);
  return fail(`«${q}» coincide con varios alumnos: ${hits.slice(0, 8).map(x => `${x.name} (${x.registration || x.id})`).join(', ')}. Sé más específico.`);
}
function findAssignment(w: Workspace, ref: unknown, student?: Student): Assignment {
  const q = String(ref ?? '').trim(); if (!q) fail('Indica la actividad (título o id).');
  const pool = w.assignments.filter(a => !student || a.studentId === student.id);
  const exact = pool.find(a => a.id === q); if (exact) return exact;
  const hits = pool.filter(a => norm(a.title).includes(norm(q)));
  const open = hits.filter(a => !['completed', 'cancelled'].includes(a.status));
  if (hits.length === 1) return hits[0];
  if (open.length === 1) return open[0];
  if (!hits.length) fail(`No encontré la actividad «${q}»${student ? ` de ${student.name}` : ''}.`);
  return fail(`«${q}» coincide con varias actividades: ${hits.slice(0, 8).map(a => `${a.title} · ${w.students.find(x => x.id === a.studentId)?.name} (${a.id})`).join('; ')}. Indica también el alumno o usa el id.`);
}
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(iso));
const reviewLine = (w: Workspace, r: Review) => ({ id: r.id, alumno: w.students.find(x => x.id === r.studentId)?.name, actividad: w.assignments.find(t => t.id === r.assignmentId)?.title ?? 'seguimiento general', cuando: local(r.startsAt), duracion_min: r.durationMinutes, tipo: r.type, estado: r.status, temas: r.notes || undefined, resultado: r.outcome || undefined, acuerdos: r.agreements?.map(g => `${g.done ? '✓' : '·'} ${g.text}`) });
/** Una revisión por id, o por alumno (y fecha actual si tiene varias programadas). */
function findReview(w: Workspace, a: Json): Review {
  if (a.revision) return w.reviews.find(x => x.id === a.revision) ?? fail('No encontré esa revisión; usa listar_revisiones.');
  const x = findStudent(w, a.alumno); let list = w.reviews.filter(r => r.studentId === x.id && r.status === 'scheduled');
  if (a.fecha_actual) { const t = String(a.fecha_actual); list = list.filter(r => t.length === 10 ? dayOf(r.startsAt) === t : Math.abs(Date.parse(r.startsAt) - Date.parse(when(t, 'fecha_actual'))) < 60_000); }
  if (list.length === 1) return list[0];
  if (!list.length) fail(`${x.name} no tiene revisiones programadas${a.fecha_actual ? ' en esa fecha' : ''}.`);
  return fail(`${x.name} tiene varias revisiones programadas: ${list.map(r => `${local(r.startsAt)} (${r.id})`).join('; ')}. Indica fecha_actual o el id.`);
}
/** Mapa de la API para llamar_api. */
const API_DOCS = [
  'GET /workspace — todo lo que puedes ver (alumnos, actividades, entregas, evaluaciones, revisiones, notas, habilidades, reuniones, banco, documentos, historial)',
  'GET /export — CSV',
  'POST /students {name, registration?, email?, phone?, career?, semester?, modalities?[], technologies?[], startDate?, endDate?, hoursRequired?, subjects?}',
  'PATCH /students/:id {…mismos campos, status: active|paused|completed, version}',
  'POST /students/:id/join {} · POST /students/:id/pause {kind: temporary|health|exams|no_contact, reason?, returnAt?, assignments: keep|cancel, cancelReviews?} · POST /students/:id/resume {}',
  'PUT /students/:id/thesis {topic, estimateMonths, proposalUrl, driveUrl, callAvailability, phase?, step?} · POST /students/:id/thesis/actions {action, note, to?, version}',
  'POST /students/:id/thesis/files (multipart: file, kind) · GET|DELETE /thesis-files/:id',
  'POST /assignments {studentId, title, description, dueAt?, reviewAt, skillIds[], startAt?, phase?, priority?: normal|high, links?[{label,url}]}',
  'PATCH /assignments/:id {version, title?, description?, dueAt?, startAt?, phase?, links?, status?: in_progress|pending_review|changes_requested|completed|cancelled, changeReason?, blockedReason?, blockNote?, blockedReviewAt?}',
  'POST /assignments/:id/deliveries {version, receivedAt, summary, url?, completeness: partial|complete|not_submitted, hours?, progress?}',
  'POST /assignments/:id/evaluations {version, scores[{skillId, score 0-10|null, comment?}], feedback?, outcome: completed|changes_requested, nextReviewAt?, reviewId?}',
  'POST /assignments/:id/files (multipart: file, kind: instruction|evidence) · GET /files/:id',
  'POST /reviews {studentId, assignmentId?, startsAt, durationMinutes?, type: follow_up|delivery|evaluation, notes?}',
  'PATCH /reviews/:id {version, status?: scheduled|completed|cancelled|missed, outcome?, startsAt?, changeReason?, hours?, agreements?[{id?, text, done}]}',
  'POST /reviews/:id/agreements/:agreementId {done}',
  'POST /notes {studentId, text}',
  'POST /skills {name, description}',
  'POST /drafts {title, description?, skillIds?, links?, phase?} · PATCH /drafts/:id {…, version} · DELETE /drafts/:id',
  'POST /meetings {title, startsAt, durationMinutes?, areaIds[], place?, notes?} (jefe) · PATCH /meetings/:id {version, …, status?: cancelled}',
  'Fechas ISO 8601 (con zona; el laboratorio usa -06:00). Las ediciones piden la version actual del registro (está en /workspace).',
];
const statusLabel: Record<string, string> = { in_progress: 'en curso', pending_review: 'por evaluar', changes_requested: 'con correcciones', completed: 'terminada', cancelled: 'cancelada' };
const assignmentLine = (w: Workspace, a: Assignment) => ({
  id: a.id, titulo: a.title, alumno: w.students.find(x => x.id === a.studentId)?.name, estado: statusLabel[a.status] ?? a.status,
  impedimento: a.blockedReason || undefined, fecha_limite: local(a.dueAt), fase: a.phase || undefined,
  avance: [...w.deliveries.filter(d => d.assignmentId === a.id)].sort((x, y) => y.receivedAt.localeCompare(x.receivedAt))[0]?.progress ?? undefined,
});
function busyOf(w: Workspace) {
  return [...w.reviews.filter(r => r.status === 'scheduled').map(r => ({ start: Date.parse(r.startsAt), end: Date.parse(r.startsAt) + r.durationMinutes * 60000 })),
    ...w.meetings.filter(m => m.status === 'scheduled').map(m => ({ start: Date.parse(m.startsAt), end: Date.parse(m.startsAt) + m.durationMinutes * 60000 }))];
}
/** Primeros horarios libres (8:00–20:00, cada 30 min) desde `from`. */
function freeSlots(w: Workspace, minutes: number, from = Date.now(), count = 5) {
  const busy = busyOf(w); const out: string[] = [];
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(from));
  for (let d = 0; d < 21 && out.length < count; d++) {
    const day = new Date(`${key}T12:00:00-06:00`); day.setUTCDate(day.getUTCDate() + d);
    const k = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(day);
    for (let m = 8 * 60; m + minutes <= 20 * 60 && out.length < count; m += 30) {
      const t = Date.parse(`${k}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00-06:00`);
      if (t < from || busy.some(b => b.start < t + minutes * 60000 && b.end > t)) continue;
      out.push(new Date(t).toISOString());
    }
  }
  return out;
}
async function skillIds(ctx: Ctx, w: Workspace, names: unknown): Promise<string[]> {
  const list = Array.isArray(names) ? names.map(String).filter(Boolean) : [];
  if (!list.length) fail('Indica al menos una habilidad a evaluar (por nombre). Usa listar_habilidades para verlas.');
  const ids: string[] = [];
  for (const name of list) {
    const found = w.skills.find(k => norm(k.name) === norm(name)) ?? w.skills.find(k => norm(k.name).includes(norm(name)));
    if (found) { ids.push(found.id); continue; }
    const created = await ctx.call<{ skill: Skill }>('POST', '/skills', { name, description: 'Creada desde Claude Code.' });
    ids.push(created.skill.id);
  }
  return ids;
}

const TOOLS: Tool[] = [
  { name: 'resumen_laboratorio', description: 'Panorama actual: alumnos por situación, actividades abiertas, por evaluar, atrasadas, con impedimento, revisiones de hoy y próximas, y tesis. Úsalo para resúmenes y reportes.',
    inputSchema: obj({}), run: async (_a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const now = Date.now();
      const open = w.assignments.filter(a => !['completed', 'cancelled'].includes(a.status));
      const late = open.filter(a => a.dueAt && Date.parse(a.dueAt) < now && a.status === 'in_progress');
      const upcoming = w.reviews.filter(r => r.status === 'scheduled' && Date.parse(r.startsAt) >= now - 3600_000).sort((x, y) => x.startsAt.localeCompare(y.startsAt)).slice(0, 15);
      return {
        usuario: `${ctx.user.name} (${ctx.user.role === 'director' ? 'jefe, solo consulta' : `responsable de ${ctx.user.areaId}`})`,
        alumnos: { total: w.students.length, activos: w.students.filter(x => x.status === 'active').length, en_pausa: w.students.filter(x => x.status === 'paused').length, terminaron: w.students.filter(x => x.status === 'completed').length,
          sin_actividad: w.students.filter(x => x.status === 'active' && !open.some(a => a.studentId === x.id) && !x.thesis).map(x => x.name) },
        actividades: { abiertas: open.length, por_evaluar: open.filter(a => a.status === 'pending_review').map(a => assignmentLine(w, a)), atrasadas: late.map(a => assignmentLine(w, a)), con_impedimento: open.filter(a => a.blockedReason).map(a => assignmentLine(w, a)) },
        proximas_revisiones: upcoming.map(r => ({ id: r.id, cuando: local(r.startsAt), alumno: w.students.find(x => x.id === r.studentId)?.name, actividad: w.assignments.find(a => a.id === r.assignmentId)?.title ?? 'seguimiento general' })),
        tesis: w.students.filter(x => x.thesis).map(x => ({ alumno: x.name, fase: phaseInfo(x.thesis!.phase).label, paso: x.thesis!.step })),
        reuniones: w.meetings.filter(m => m.status === 'scheduled' && Date.parse(m.startsAt) >= now).map(m => ({ titulo: m.title, cuando: local(m.startsAt) })),
      };
    } },
  { name: 'listar_alumnos', description: 'Lista alumnos con filtros. Devuelve nombre, matrícula, contacto, modalidades, áreas, estado, actividad actual y tesis.',
    inputSchema: obj({ buscar: s('Texto en nombre, matrícula, carrera o tecnología.'), estado: s('active, paused, completed o all (por omisión active).', { enum: ['active', 'paused', 'completed', 'all'] }), area: s('software, hardware o research (solo el jefe ve todas).'), modalidad: s('Ej. Servicio social, Tesis, Colaborador.') }),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const q = norm(String(a.buscar ?? '')); const estado = String(a.estado ?? 'active');
      return w.students.filter(x => (estado === 'all' || x.status === estado) && (!a.area || x.areaIds.includes(a.area as never)) && (!a.modalidad || x.modalities.some(m => norm(m).includes(norm(String(a.modalidad)))))
        && (!q || norm(`${x.name} ${x.registration} ${x.career} ${x.technologies.join(' ')}`).includes(q)))
        .map(x => { const cur = w.assignments.filter(t => t.studentId === x.id && !['completed', 'cancelled'].includes(t.status));
          return { id: x.id, nombre: x.name, matricula: x.registration || null, correo: x.email || null, telefono: x.phone || null, carrera: x.career || null, semestre: x.semester || null, modalidades: x.modalities, areas: x.areaIds, estado: x.status, tecnologias: x.technologies, nivel: x.level || undefined, carpeta: x.folderUrl || undefined,
            actividades_abiertas: cur.map(t => t.title), tesis: x.thesis ? `${phaseInfo(x.thesis.phase).label} · ${x.thesis.step}` : undefined }; });
    } },
  { name: 'ver_alumno', description: 'Expediente completo de un alumno: datos, actividades (con entregas y evaluaciones), revisiones, notas, tesis e historial reciente.',
    inputSchema: obj({ alumno: s('Nombre (o parte), matrícula o id.') }, ['alumno']), run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const x = findStudent(w, a.alumno);
      return { ...x, avatar: undefined, inicio: x.startDate, termino: x.endDate,
        actividades: w.assignments.filter(t => t.studentId === x.id).map(t => ({ ...assignmentLine(w, t), descripcion: t.description, habilidades: t.skillIds.map(id => w.skills.find(k => k.id === id)?.name),
          entregas: w.deliveries.filter(d => d.assignmentId === t.id).map(d => ({ cuando: local(d.receivedAt), tipo: d.completeness, avance: d.progress, resumen: d.summary, enlace: d.url || undefined })),
          evaluaciones: w.evaluations.filter(e => e.assignmentId === t.id).map(e => ({ cuando: local(e.createdAt), resultado: e.outcome, vigente: e.current, retro: e.feedback, puntajes: e.scores.map(sc => ({ habilidad: w.skills.find(k => k.id === sc.skillId)?.name, puntaje: sc.score, comentario: sc.comment || undefined })) })),
          documentos: w.attachments.filter(f => f.assignmentId === t.id).map(f => f.name) })),
        revisiones: w.reviews.filter(r => r.studentId === x.id).map(r => ({ id: r.id, cuando: local(r.startsAt), estado: r.status, tipo: r.type, temas: r.notes || undefined, resultado: r.outcome || undefined, acuerdos: r.agreements?.map(g => `${g.done ? '✓' : '·'} ${g.text}`) })),
        notas: w.notes.filter(t => t.studentId === x.id).map(t => ({ cuando: local(t.createdAt), autor: t.authorName, texto: t.text })),
        documentos_tesis: (w.thesisDocs ?? []).filter(d => d.studentId === x.id).map(d => `${d.name} (${d.kind})`),
        historial: w.audit.filter(e => e.entityId === x.id || w.assignments.some(t => t.id === e.entityId && t.studentId === x.id)).slice(0, 25).map(e => `${local(e.createdAt)} · ${e.actorName}: ${e.detail}`) };
    } },
  { name: 'listar_actividades', description: 'Actividades con filtros (alumno, estado). Útil para resúmenes de las actividades de alguien.',
    inputSchema: obj({ alumno: s('Opcional: nombre, matrícula o id.'), estado: s('abiertas, terminadas, todas, por_evaluar, atrasadas o con_impedimento (por omisión abiertas).') }),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const x = a.alumno ? findStudent(w, a.alumno) : undefined; const e = String(a.estado ?? 'abiertas'); const now = Date.now();
      return w.assignments.filter(t => (!x || t.studentId === x.id) && (e === 'todas' || (e === 'terminadas' ? t.status === 'completed' : e === 'por_evaluar' ? t.status === 'pending_review' : e === 'atrasadas' ? t.status === 'in_progress' && !!t.dueAt && Date.parse(t.dueAt) < now : e === 'con_impedimento' ? !!t.blockedReason && !['completed', 'cancelled'].includes(t.status) : !['completed', 'cancelled'].includes(t.status))))
        .map(t => ({ ...assignmentLine(w, t), descripcion: t.description.slice(0, 400) }));
    } },
  { name: 'listar_habilidades', description: 'Habilidades que se pueden evaluar en tu área.', inputSchema: obj({}),
    run: async (_a, ctx) => (await ctx.call<Workspace>('GET', '/workspace')).skills.filter(k => !k.areaId || !ctx.user.areaId || k.areaId === ctx.user.areaId).map(k => ({ nombre: k.name, descripcion: k.description })) },
  { name: 'registrar_alumno', description: 'Da de alta un alumno en tu área. Solo el nombre es obligatorio; si ya existe (misma matrícula) te lo indica.',
    inputSchema: obj({ nombre: s('Nombre completo.'), matricula: s('Opcional.'), correo: s('Opcional.'), telefono: s('Opcional.'), carrera: s('Opcional.'), semestre: s('Opcional.'), modalidades: { type: 'array', items: { type: 'string' }, description: 'Prácticas, Servicio social, Materias, Tesis, Investigación o Colaborador.' }, tecnologias: { type: 'array', items: { type: 'string' } }, horas_requeridas: n('Solo prácticas o servicio social.'), inicio: s('AAAA-MM-DD'), termino: s('AAAA-MM-DD'), nivel: s('Nivel 1, Nivel 2 o Nivel 3 (opcional).'), carpeta: s('URL de su carpeta de Drive (opcional).'), materias: n('Número de materias (opcional).') }, ['nombre']),
    run: async (a, ctx) => {
      const body = { name: String(a.nombre), registration: String(a.matricula ?? ''), email: String(a.correo ?? ''), phone: String(a.telefono ?? ''), career: String(a.carrera ?? ''), semester: String(a.semestre ?? ''), modalities: (a.modalidades as string[]) ?? [], technologies: (a.tecnologias as string[]) ?? [], hoursRequired: a.horas_requeridas ? Number(a.horas_requeridas) : null, startDate: a.inicio ?? null, endDate: a.termino ?? null, level: a.nivel ?? null, folderUrl: String(a.carpeta ?? ''), subjects: a.materias ? Number(a.materias) : null };
      const r = await ctx.call<{ student: Student }>('POST', '/students', body); return { registrado: r.student.name, id: r.student.id };
    } },
  { name: 'editar_alumno', description: 'Cambia datos de un alumno (solo los campos que indiques).',
    inputSchema: obj({ alumno: s('Nombre, matrícula o id.'), nombre: s(''), matricula: s(''), correo: s(''), telefono: s(''), carrera: s(''), semestre: s(''), modalidades: { type: 'array', items: { type: 'string' } }, tecnologias: { type: 'array', items: { type: 'string' } }, horas_requeridas: n(''), inicio: s('AAAA-MM-DD'), termino: s('AAAA-MM-DD'), estado: s('active, paused o completed', { enum: ['active', 'paused', 'completed'] }), nivel: s('Nivel 1, 2 o 3.'), carpeta: s('URL de Drive.'), materias: n('') }, ['alumno']),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const x = findStudent(w, a.alumno); const full = (await ctx.call<Workspace>('GET', '/workspace')).students.find(y => y.id === x.id)!;
      const body = { name: a.nombre ?? full.name, registration: a.matricula ?? full.registration, email: a.correo ?? full.email, phone: a.telefono ?? full.phone ?? '', career: a.carrera ?? full.career, semester: a.semestre ?? full.semester, modalities: a.modalidades ?? full.modalities, technologies: a.tecnologias ?? full.technologies, avatar: full.avatar, startDate: a.inicio ?? full.startDate ?? null, endDate: a.termino ?? full.endDate ?? null, hoursRequired: a.horas_requeridas ?? full.hoursRequired ?? null, subjects: a.materias ?? full.subjects ?? null, level: a.nivel ?? full.level ?? null, folderUrl: a.carpeta ?? full.folderUrl ?? '', status: a.estado ?? full.status, version: full.version };
      await ctx.call('PATCH', `/students/${x.id}`, body); return { actualizado: x.name };
    } },
  { name: 'asignar_actividad', description: 'Asigna una actividad a un alumno con su primera revisión (si no la das, se usa el primer horario libre en 3 días). Las habilidades se indican por nombre; las que no existan se crean.',
    inputSchema: obj({ alumno: s('Nombre, matrícula o id.'), titulo: s('Nombre de la actividad.'), descripcion: s('Qué debe hacer y entregar.'), habilidades: { type: 'array', items: { type: 'string' }, description: 'Habilidades a evaluar (nombres).' }, fecha_limite: s('AAAA-MM-DD o AAAA-MM-DD HH:MM (opcional).'), primera_revision: s('AAAA-MM-DD HH:MM (opcional).'), inicio: s('AAAA-MM-DD (opcional).'), fase: s('Solo Investigación (opcional).'), enlaces: { type: 'array', items: { type: 'string' }, description: 'URLs de material (Drive, etc.).' } }, ['alumno', 'titulo', 'habilidades']),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const x = findStudent(w, a.alumno);
      const review = a.primera_revision ? when(a.primera_revision, 'primera_revision') : freeSlots(w, 30, Date.now() + 3 * 86_400_000, 1)[0] ?? when(new Date(Date.now() + 3 * 86_400_000).toISOString(), 'revisión');
      const body = { studentId: x.id, title: String(a.titulo), description: String(a.descripcion ?? ''), dueAt: a.fecha_limite ? when(a.fecha_limite, 'fecha_limite') : null, reviewAt: review, skillIds: await skillIds(ctx, w, a.habilidades), startAt: a.inicio ? when(`${a.inicio} 09:00`, 'inicio') : null, phase: String(a.fase ?? ''), links: ((a.enlaces as string[]) ?? []).map(url => ({ label: url.replace(/^https?:\/\//, '').slice(0, 60), url })) };
      const r = await ctx.call<{ assignment: Assignment }>('POST', '/assignments', body);
      return { asignada: r.assignment.title, id: r.assignment.id, alumno: x.name, fecha_limite: local(r.assignment.dueAt), primera_revision: local(review) };
    } },
  { name: 'editar_actividad', description: 'Cambia título, descripción, fecha límite, fase o enlaces de una actividad; o la cancela (estado=cancelled con motivo).',
    inputSchema: obj({ actividad: s('Título o id.'), alumno: s('Opcional, para desambiguar.'), titulo: s(''), descripcion: s(''), fecha_limite: s('AAAA-MM-DD HH:MM o vacío para quitarla.'), fase: s(''), enlaces: { type: 'array', items: { type: 'string' } }, cancelar: { type: 'boolean' }, motivo: s('Motivo del cambio (obligatorio al cancelar o cambiar la fecha).') }, ['actividad']),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const t = findAssignment(w, a.actividad, a.alumno ? findStudent(w, a.alumno) : undefined);
      const body: Json = { version: t.version };
      if (a.titulo) body.title = a.titulo; if (a.descripcion !== undefined) body.description = a.descripcion; if (a.fase !== undefined) body.phase = a.fase;
      if (a.fecha_limite !== undefined) body.dueAt = a.fecha_limite ? when(a.fecha_limite, 'fecha_limite') : null;
      if (a.enlaces) body.links = (a.enlaces as string[]).map(url => ({ label: url.replace(/^https?:\/\//, '').slice(0, 60), url }));
      if (a.cancelar) body.status = 'cancelled'; if (a.motivo) body.changeReason = a.motivo;
      await ctx.call('PATCH', `/assignments/${t.id}`, body); return { actualizada: t.title };
    } },
  { name: 'registrar_avance', description: 'Registra un avance, la entrega final o que no entregó en una actividad.',
    inputSchema: obj({ actividad: s('Título o id.'), alumno: s('Opcional, para desambiguar.'), tipo: s('avance, entrega_final o no_entrego.', { enum: ['avance', 'entrega_final', 'no_entrego'] }), resumen: s('Qué presentó o qué pasó.'), avance: n('Porcentaje 0–100 (solo avance).'), horas: n('Horas trabajadas (opcional).'), enlace: s('URL de la evidencia (opcional).'), cuando: s('AAAA-MM-DD HH:MM (por omisión, ahora).') }, ['actividad', 'tipo', 'resumen']),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const t = findAssignment(w, a.actividad, a.alumno ? findStudent(w, a.alumno) : undefined);
      const completeness = a.tipo === 'entrega_final' ? 'complete' : a.tipo === 'no_entrego' ? 'not_submitted' : 'partial';
      await ctx.call('POST', `/assignments/${t.id}/deliveries`, { version: t.version, receivedAt: a.cuando ? when(a.cuando, 'cuando') : new Date().toISOString(), summary: String(a.resumen), url: String(a.enlace ?? ''), completeness, hours: a.horas ?? null, progress: completeness === 'partial' && a.avance !== undefined ? Number(a.avance) : null });
      return { registrado: `${a.tipo} en «${t.title}»`, siguiente: completeness === 'complete' ? 'Ya se puede evaluar con evaluar_actividad.' : undefined };
    } },
  { name: 'evaluar_actividad', description: 'Evalúa una actividad entregada: puntaje 0–10 por habilidad, retroalimentación y si queda terminada o con correcciones.',
    inputSchema: obj({ actividad: s('Título o id.'), alumno: s('Opcional.'), puntajes: { type: 'array', items: obj({ habilidad: s('Nombre de la habilidad.'), puntaje: n('0 a 10.'), comentario: s('') }, ['habilidad', 'puntaje']) }, retroalimentacion: s(''), resultado: s('terminada o correcciones', { enum: ['terminada', 'correcciones'] }), proxima_revision: s('Con correcciones: AAAA-MM-DD HH:MM (opcional).') }, ['actividad', 'puntajes', 'resultado']),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const t = findAssignment(w, a.actividad, a.alumno ? findStudent(w, a.alumno) : undefined);
      const scores = (a.puntajes as Json[]).map(p => { const k = w.skills.find(x => t.skillIds.includes(x.id) && norm(x.name).includes(norm(String(p.habilidad)))) ?? fail(`«${p.habilidad}» no es una habilidad de esta actividad: ${t.skillIds.map(id => w.skills.find(x => x.id === id)?.name).join(', ')}.`); return { skillId: k.id, score: Number(p.puntaje), comment: String(p.comentario ?? '') }; });
      for (const id of t.skillIds) if (!scores.some(x => x.skillId === id)) scores.push({ skillId: id, score: null as unknown as number, comment: '' });
      await ctx.call('POST', `/assignments/${t.id}/evaluations`, { version: t.version, scores, feedback: String(a.retroalimentacion ?? ''), outcome: a.resultado === 'correcciones' ? 'changes_requested' : 'completed', ...(a.proxima_revision ? { nextReviewAt: when(a.proxima_revision, 'proxima_revision') } : {}) });
      return { evaluada: t.title, resultado: a.resultado };
    } },
  { name: 'buscar_horario_libre', description: 'Primeros horarios libres de tu agenda (8:00–20:00, cada 30 min), sin chocar con revisiones ni reuniones.',
    inputSchema: obj({ duracion_min: n('Por omisión 30.'), desde: s('AAAA-MM-DD o AAAA-MM-DD HH:MM (por omisión, ahora).'), cuantos: n('Por omisión 5.') }),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); return freeSlots(w, Number(a.duracion_min ?? 30), a.desde ? Math.max(Date.now(), Date.parse(when(String(a.desde).length === 10 ? `${a.desde} 08:00` : a.desde, 'desde'))) : Date.now(), Number(a.cuantos ?? 5)).map(local); } },
  { name: 'programar_revision', description: 'Programa una revisión NUEVA con un alumno (para cambiar una existente usa mover_revision). Sin fecha, toma el primer horario libre. Avisa si choca con otra cita.',
    inputSchema: obj({ alumno: s('Nombre, matrícula o id.'), actividad: s('Opcional: título o id; sin ella es seguimiento general.'), cuando: s('AAAA-MM-DD HH:MM (opcional).'), duracion_min: n('15 a 120, por omisión 30.'), tipo: s('seguimiento, entrega o evaluacion.', { enum: ['seguimiento', 'entrega', 'evaluacion'] }), temas: s('Opcional.') }, ['alumno']),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const x = findStudent(w, a.alumno); const minutes = Number(a.duracion_min ?? 30);
      const t = a.actividad ? findAssignment(w, a.actividad, x) : undefined;
      const start = a.cuando ? when(a.cuando, 'cuando') : freeSlots(w, minutes)[0] ?? fail('No hay horarios libres en 3 semanas.');
      const clash = busyOf(w).some(b => b.start < Date.parse(start) + minutes * 60000 && b.end > Date.parse(start));
      const r = await ctx.call<{ review: Review }>('POST', '/reviews', { studentId: x.id, assignmentId: t?.id ?? null, startsAt: start, durationMinutes: minutes, type: a.tipo === 'entrega' ? 'delivery' : a.tipo === 'evaluacion' ? 'evaluation' : 'follow_up', notes: String(a.temas ?? '') });
      return { programada: local(start), id: r.review?.id, alumno: x.name, aviso: clash ? `Choca con otra cita. Horarios libres: ${freeSlots(w, minutes, Date.parse(start)).slice(0, 3).map(local).join(', ')}` : undefined };
    } },
  { name: 'registrar_revision', description: 'Registra el resultado de una revisión (si se realizó, qué se vio y acuerdos) o que no se realizó. Para cambiar la fecha usa mover_revision; para cancelar, cancelar_revision. Acepta id o alumno + fecha_actual.',
    inputSchema: obj({ revision: s('Id (opcional si das alumno).'), alumno: s('Opcional.'), fecha_actual: s('AAAA-MM-DD o AAAA-MM-DD HH:MM.'), accion: s('realizada, no_se_realizo, cancelar o reprogramar.', { enum: ['realizada', 'no_se_realizo', 'cancelar', 'reprogramar'] }), texto: s('Qué se vio, o el motivo.'), acuerdos: { type: 'array', items: { type: 'string' } }, nueva_fecha: s('Para reprogramar: AAAA-MM-DD HH:MM.'), horas: n('Horas (opcional).') }, ['accion', 'texto']),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const r = findReview(w, a);
      const body: Json = { version: r.version };
      if (a.accion === 'realizada') Object.assign(body, { status: 'completed', outcome: a.texto, agreements: ((a.acuerdos as string[]) ?? []).map(text => ({ text, done: false })), ...(a.horas ? { hours: Number(a.horas) } : {}) });
      else if (a.accion === 'no_se_realizo') Object.assign(body, { status: 'missed', outcome: a.texto });
      else if (a.accion === 'cancelar') Object.assign(body, { status: 'cancelled', changeReason: a.texto });
      else Object.assign(body, { startsAt: when(a.nueva_fecha, 'nueva_fecha'), changeReason: a.texto });
      await ctx.call('PATCH', `/reviews/${r.id}`, body); return { listo: `${a.accion} · ${local(r.startsAt)}` };
    } },
  { name: 'marcar_impedimento', description: 'Marca o resuelve un impedimento en una actividad (algo externo que la detiene).',
    inputSchema: obj({ actividad: s('Título o id.'), alumno: s('Opcional.'), motivo: s('Qué lo detiene. Vacío para resolverlo.'), revisar_el: s('AAAA-MM-DD: hasta cuándo esperar (opcional).'), nota: s('Siguiente paso o cómo se resolvió.') }, ['actividad']),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const t = findAssignment(w, a.actividad, a.alumno ? findStudent(w, a.alumno) : undefined);
      await ctx.call('PATCH', `/assignments/${t.id}`, { version: t.version, blockedReason: String(a.motivo ?? ''), blockedReviewAt: a.motivo ? (a.revisar_el ?? null) : null, ...(a.nota ? { blockNote: a.nota } : {}) });
      return { listo: a.motivo ? `Impedimento anotado en «${t.title}».` : `Impedimento resuelto en «${t.title}».` };
    } },
  { name: 'agregar_nota', description: 'Agrega una nota privada al expediente de un alumno.', inputSchema: obj({ alumno: s('Nombre, matrícula o id.'), texto: s('La nota.') }, ['alumno', 'texto']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const x = findStudent(w, a.alumno); await ctx.call('POST', '/notes', { studentId: x.id, text: String(a.texto) }); return { nota_agregada: x.name }; } },
  { name: 'subir_documento', description: 'Sube un documento (PDF, imagen, Office, texto; hasta 10 MB) a una actividad (instrucciones o evidencia) o al expediente de tesis de un alumno. Lee el archivo local y manda su contenido en base64.',
    inputSchema: obj({ nombre_archivo: s('Nombre con extensión, ej. propuesta.pdf.'), contenido_base64: s('Contenido del archivo en base64.'), actividad: s('Título o id de la actividad (para documentos de actividad).'), alumno: s('Alumno (para desambiguar, o para documentos de tesis).'), tipo: s('Actividad: instruccion o evidencia. Tesis: preproposal, proposal, delimitation, schedule, draft u other.') }, ['nombre_archivo', 'contenido_base64']),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const data = Buffer.from(String(a.contenido_base64), 'base64');
      if (!data.length) fail('El contenido está vacío.'); if (data.length > 10 * 1024 * 1024) fail('El archivo pasa de 10 MB.');
      if (a.actividad) { const t = findAssignment(w, a.actividad, a.alumno ? findStudent(w, a.alumno) : undefined);
        await ctx.upload(`/assignments/${t.id}/files`, { kind: a.tipo === 'instruccion' ? 'instruction' : 'evidence' }, String(a.nombre_archivo), data); return { subido: a.nombre_archivo, a: t.title }; }
      const x = findStudent(w, a.alumno); const kind = ['preproposal', 'proposal', 'delimitation', 'schedule', 'draft', 'other'].includes(String(a.tipo)) ? String(a.tipo) : /cronograma/i.test(String(a.nombre_archivo)) ? 'schedule' : 'other';
      await ctx.upload(`/students/${x.id}/thesis/files`, { kind }, String(a.nombre_archivo), data); return { subido: a.nombre_archivo, a: `tesis de ${x.name}` };
    } },
  { name: 'tesis_paso', description: 'Avanza el flujo de tesis (Investigación): kickoff, submitted, reviewed, advance, stay, back, defended o moved (con fase destino).',
    inputSchema: obj({ alumno: s('Nombre, matrícula o id.'), accion: s('kickoff, submitted, reviewed, advance, stay, back, defended o moved.', { enum: ['kickoff', 'submitted', 'reviewed', 'advance', 'stay', 'back', 'defended', 'moved'] }), nota: s('Obligatoria en stay, back y moved.'), fase: s(`Para moved: ${THESIS_PHASES.map(p => p.id).join(', ')}.`) }, ['alumno', 'accion']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const x = findStudent(w, a.alumno);
      await ctx.call('POST', `/students/${x.id}/thesis/actions`, { action: a.accion, note: String(a.nota ?? ''), version: x.version, ...(a.fase ? { to: a.fase } : {}) }); return { listo: `${a.accion} · ${x.name}` }; } },
  { name: 'agendar_reunion', description: 'Solo el jefe: agenda una reunión con uno o varios responsables (software, hardware, research).',
    inputSchema: obj({ titulo: s(''), cuando: s('AAAA-MM-DD HH:MM'), duracion_min: n('Por omisión 60.'), con: { type: 'array', items: { type: 'string', enum: ['software', 'hardware', 'research'] } }, lugar: s(''), temas: s('') }, ['titulo', 'cuando', 'con']),
    run: async (a, ctx) => { await ctx.call('POST', '/meetings', { title: String(a.titulo), startsAt: when(a.cuando, 'cuando'), durationMinutes: Number(a.duracion_min ?? 60), areaIds: a.con, place: String(a.lugar ?? ''), notes: String(a.temas ?? '') }); return { agendada: `${a.titulo} · ${local(when(a.cuando, 'cuando'))}` }; } },
  { name: 'listar_revisiones', description: 'Revisiones (citas) con su id, alumno, actividad, fecha, duración y estado. Filtra por alumno, día o rango. Úsalo antes de mover, cancelar o registrar una revisión.',
    inputSchema: obj({ alumno: s('Opcional.'), dia: s('AAAA-MM-DD (opcional).'), desde: s('AAAA-MM-DD (opcional).'), hasta: s('AAAA-MM-DD (opcional).'), estado: s('scheduled (por omisión), completed, cancelled, missed o all.') }),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const x = a.alumno ? findStudent(w, a.alumno) : undefined; const st = String(a.estado ?? 'scheduled');
      const from = a.dia ? String(a.dia) : a.desde ? String(a.desde) : null; const to = a.dia ? String(a.dia) : a.hasta ? String(a.hasta) : null;
      return w.reviews.filter(r => (!x || r.studentId === x.id) && (st === 'all' || r.status === st) && (!from || dayOf(r.startsAt) >= from) && (!to || dayOf(r.startsAt) <= to))
        .sort((p, q) => p.startsAt.localeCompare(q.startsAt)).map(r => reviewLine(w, r));
    } },
  { name: 'detectar_choques', description: 'Citas que se enciman (revisiones y reuniones) en un día o en los próximos 14 días, con horarios libres sugeridos.',
    inputSchema: obj({ dia: s('AAAA-MM-DD (opcional).') }),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const now = Date.now();
      const items = [...w.reviews.filter(r => r.status === 'scheduled').map(r => ({ id: r.id, que: `Revisión con ${w.students.find(x => x.id === r.studentId)?.name}`, start: Date.parse(r.startsAt), end: Date.parse(r.startsAt) + r.durationMinutes * 60000 })),
        ...w.meetings.filter(m => m.status === 'scheduled').map(m => ({ id: m.id, que: `Reunión: ${m.title}`, start: Date.parse(m.startsAt), end: Date.parse(m.startsAt) + m.durationMinutes * 60000 }))]
        .filter(i => a.dia ? dayOf(new Date(i.start).toISOString()) === a.dia : i.end >= now && i.start <= now + 14 * 86_400_000).sort((p, q) => p.start - q.start);
      const out: Json[] = [];
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length && items[j].start < items[i].end; j++) out.push({ cita_1: `${items[i].que} · ${local(new Date(items[i].start).toISOString())} (${items[i].id})`, cita_2: `${items[j].que} · ${local(new Date(items[j].start).toISOString())} (${items[j].id})`, horarios_libres: freeSlots(w, Math.round((items[j].end - items[j].start) / 60000), items[j].start, 3).map(local) });
      return out.length ? out : 'Sin choques.';
    } },
  { name: 'mover_revision', description: 'Cambia la fecha y hora de una revisión que ya existe (no crea otra). Identifícala por id, o por alumno (y su fecha actual si tiene varias).',
    inputSchema: obj({ revision: s('Id (opcional si das alumno).'), alumno: s('Opcional.'), fecha_actual: s('AAAA-MM-DD o AAAA-MM-DD HH:MM, para elegir entre varias.'), nueva_fecha: s('AAAA-MM-DD HH:MM, o «primer_libre».'), motivo: s('Motivo del cambio.') }, ['nueva_fecha']),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const r = findReview(w, a);
      const to = a.nueva_fecha === 'primer_libre' ? freeSlots(w, r.durationMinutes)[0] ?? fail('No hay horarios libres.') : when(a.nueva_fecha, 'nueva_fecha');
      await ctx.call('PATCH', `/reviews/${r.id}`, { version: r.version, startsAt: to, changeReason: String(a.motivo ?? 'Ajuste de agenda') });
      return { movida: `${w.students.find(x => x.id === r.studentId)?.name}: ${local(r.startsAt)} → ${local(to)}` };
    } },
  { name: 'mover_revisiones', description: 'Reorganiza varias revisiones de una vez (por ejemplo, para quitar choques). Cada cambio: id de la revisión y nueva fecha.',
    inputSchema: obj({ cambios: { type: 'array', items: obj({ revision: s('Id.'), nueva_fecha: s('AAAA-MM-DD HH:MM') }, ['revision', 'nueva_fecha']) }, motivo: s('Motivo (opcional).') }, ['cambios']),
    run: async (a, ctx) => {
      const out: string[] = [];
      for (const c of a.cambios as Json[]) {
        const w = await ctx.call<Workspace>('GET', '/workspace'); const r = w.reviews.find(x => x.id === c.revision);
        if (!r) { out.push(`✗ ${String(c.revision)}: no encontrada`); continue; }
        try { const to = when(c.nueva_fecha, 'nueva_fecha'); await ctx.call('PATCH', `/reviews/${r.id}`, { version: r.version, startsAt: to, changeReason: String(a.motivo ?? 'Ajuste de agenda') }); out.push(`✓ ${w.students.find(x => x.id === r.studentId)?.name}: ${local(r.startsAt)} → ${local(to)}`); }
        catch (e) { out.push(`✗ ${String(c.revision)}: ${(e as Error).message}`); }
      }
      return out;
    } },
  { name: 'cancelar_revision', description: 'Cancela una revisión (queda en el historial con el motivo). Identifícala por id o por alumno y fecha.',
    inputSchema: obj({ revision: s('Id (opcional si das alumno).'), alumno: s('Opcional.'), fecha_actual: s('AAAA-MM-DD o AAAA-MM-DD HH:MM.'), motivo: s('Motivo.') }, ['motivo']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const r = findReview(w, a);
      await ctx.call('PATCH', `/reviews/${r.id}`, { version: r.version, status: 'cancelled', changeReason: String(a.motivo) }); return { cancelada: `${w.students.find(x => x.id === r.studentId)?.name} · ${local(r.startsAt)}` }; } },
  { name: 'marcar_acuerdo', description: 'Marca como cumplido (o reabre) un acuerdo de una revisión. listar_revisiones muestra los acuerdos.',
    inputSchema: obj({ revision: s('Id de la revisión.'), acuerdo: s('Texto (o parte) del acuerdo.'), cumplido: { type: 'boolean', description: 'Por omisión true.' } }, ['revision', 'acuerdo']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const r = w.reviews.find(x => x.id === a.revision) ?? fail('Revisión no encontrada.');
      const g = r.agreements?.find(x => norm(x.text).includes(norm(String(a.acuerdo)))) ?? fail(`No encontré ese acuerdo. Acuerdos: ${(r.agreements ?? []).map(x => x.text).join(' | ') || 'ninguno'}.`);
      await ctx.call('POST', `/reviews/${r.id}/agreements/${g.id}`, { done: a.cumplido !== false }); return { listo: `${a.cumplido === false ? 'Reabierto' : 'Cumplido'}: ${g.text}` }; } },
  { name: 'pausar_alumno', description: 'Pausa la participación de un alumno en tu área (baja temporal, salud, exámenes o sin contacto).',
    inputSchema: obj({ alumno: s('Nombre, matrícula o id.'), tipo: s('temporary, health, exams o no_contact.', { enum: ['temporary', 'health', 'exams', 'no_contact'] }), motivo: s('Opcional.'), regresa: s('AAAA-MM-DD (opcional).'), cancelar_actividades: { type: 'boolean', description: 'Por omisión false (se conservan).' } }, ['alumno', 'tipo']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const x = findStudent(w, a.alumno);
      await ctx.call('POST', `/students/${x.id}/pause`, { kind: a.tipo, reason: String(a.motivo ?? ''), returnAt: a.regresa ?? null, assignments: a.cancelar_actividades ? 'cancel' : 'keep', cancelReviews: true }); return { pausado: x.name }; } },
  { name: 'retomar_alumno', description: 'Retoma la participación de un alumno en pausa.', inputSchema: obj({ alumno: s('Nombre, matrícula o id.') }, ['alumno']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const x = findStudent(w, a.alumno); await ctx.call('POST', `/students/${x.id}/resume`, {}); return { retomado: x.name }; } },
  { name: 'incorporar_alumno', description: 'Agrega a tu área un alumno que ya existe en otra área (sin duplicarlo).', inputSchema: obj({ alumno: s('Nombre, matrícula o id.') }, ['alumno']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const x = findStudent(w, a.alumno); await ctx.call('POST', `/students/${x.id}/join`, {}); return { incorporado: x.name }; } },
  { name: 'listar_banco', description: 'Banco de actividades preparadas de tu área (sin alumno todavía).', inputSchema: obj({}),
    run: async (_a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); return (w.drafts ?? []).map(d => ({ id: d.id, titulo: d.title, descripcion: d.description, habilidades: d.skillIds.map(id => w.skills.find(k => k.id === id)?.name), fase: d.phase || undefined, enlaces: d.links.map(l => l.url) })); } },
  { name: 'guardar_en_banco', description: 'Crea o edita una actividad del banco (para asignarla después a uno o varios alumnos).',
    inputSchema: obj({ id: s('Id para editar (opcional).'), titulo: s('Título.'), descripcion: s('Opcional.'), habilidades: { type: 'array', items: { type: 'string' } }, fase: s('Opcional.'), enlaces: { type: 'array', items: { type: 'string' } } }, ['titulo']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace');
      const body = { title: String(a.titulo), description: String(a.descripcion ?? ''), skillIds: a.habilidades ? await skillIds(ctx, w, a.habilidades) : [], phase: String(a.fase ?? ''), links: ((a.enlaces as string[]) ?? []).map(url => ({ label: url.replace(/^https?:\/\//, '').slice(0, 60), url })) };
      if (a.id) { const d = (w.drafts ?? []).find(x => x.id === a.id) ?? fail('No está en el banco.'); await ctx.call('PATCH', `/drafts/${d.id}`, { ...body, version: d.version }); return { editada: body.title }; }
      await ctx.call('POST', '/drafts', body); return { guardada: body.title }; } },
  { name: 'borrar_de_banco', description: 'Quita una actividad del banco (no afecta las ya asignadas).', inputSchema: obj({ actividad: s('Título o id.') }, ['actividad']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const d = (w.drafts ?? []).find(x => x.id === a.actividad || norm(x.title).includes(norm(String(a.actividad)))) ?? fail('No está en el banco.');
      await ctx.call('DELETE', `/drafts/${d.id}`, {}); return { quitada: d.title }; } },
  { name: 'asignar_desde_banco', description: 'Asigna una actividad del banco a uno o varios alumnos; cada uno recibe su primera revisión en el primer horario libre, salvo que la indiques.',
    inputSchema: obj({ actividad: s('Título o id en el banco.'), alumnos: { type: 'array', items: { type: 'string' } }, fecha_limite: s('AAAA-MM-DD (opcional).'), primera_revision: s('AAAA-MM-DD HH:MM (opcional).') }, ['actividad', 'alumnos']),
    run: async (a, ctx) => { const out: string[] = [];
      for (const ref of a.alumnos as string[]) {
        const w = await ctx.call<Workspace>('GET', '/workspace'); const d = (w.drafts ?? []).find(x => x.id === a.actividad || norm(x.title).includes(norm(String(a.actividad)))) ?? fail('No está en el banco.');
        try { const x = findStudent(w, ref); const review = a.primera_revision ? when(a.primera_revision, 'primera_revision') : freeSlots(w, 30, Date.now() + 2 * 86_400_000, 1)[0];
          await ctx.call('POST', '/assignments', { studentId: x.id, title: d.title, description: d.description, dueAt: a.fecha_limite ? when(a.fecha_limite, 'fecha_limite') : null, reviewAt: review, skillIds: d.skillIds.length ? d.skillIds : await skillIds(ctx, w, ['General']), phase: d.phase, links: d.links }); out.push(`✓ ${x.name} · revisión ${local(review)}`); }
        catch (e) { out.push(`✗ ${ref}: ${(e as Error).message}`); }
      }
      return out; } },
  { name: 'crear_habilidad', description: 'Agrega una habilidad a tu área.', inputSchema: obj({ nombre: s('Nombre.'), descripcion: s('Qué debe demostrar el alumno.') }, ['nombre', 'descripcion']),
    run: async (a, ctx) => { await ctx.call('POST', '/skills', { name: String(a.nombre), description: String(a.descripcion) }); return { creada: a.nombre }; } },
  { name: 'listar_reuniones', description: 'Reuniones del jefe con los responsables.', inputSchema: obj({}),
    run: async (_a, ctx) => (await ctx.call<Workspace>('GET', '/workspace')).meetings.map(m => ({ id: m.id, titulo: m.title, cuando: local(m.startsAt), duracion_min: m.durationMinutes, con: m.areaIds, lugar: m.place || undefined, estado: m.status })) },
  { name: 'editar_reunion', description: 'Solo el jefe: cambia o cancela una reunión.', inputSchema: obj({ reunion: s('Id o título.'), titulo: s('Opcional.'), cuando: s('AAAA-MM-DD HH:MM'), duracion_min: n('Opcional.'), con: { type: 'array', items: { type: 'string', enum: ['software', 'hardware', 'research'] } }, lugar: s('Opcional.'), temas: s('Opcional.'), cancelar: { type: 'boolean' } }, ['reunion']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const m = w.meetings.find(x => x.id === a.reunion || norm(x.title).includes(norm(String(a.reunion)))) ?? fail('Reunión no encontrada.');
      const body: Json = { version: m.version }; if (a.titulo) body.title = a.titulo; if (a.cuando) body.startsAt = when(a.cuando, 'cuando'); if (a.duracion_min) body.durationMinutes = Number(a.duracion_min); if (a.con) body.areaIds = a.con; if (a.lugar !== undefined) body.place = a.lugar; if (a.temas !== undefined) body.notes = a.temas; if (a.cancelar) body.status = 'cancelled';
      await ctx.call('PATCH', `/meetings/${m.id}`, body); return { listo: a.cancelar ? `Cancelada: ${m.title}` : `Actualizada: ${m.title}` }; } },
  { name: 'datos_tesis', description: 'Investigación: inicia o edita los datos de la tesis (tema, meses estimados, enlaces, disponibilidad para llamadas).',
    inputSchema: obj({ alumno: s('Nombre, matrícula o id.'), tema: s('Opcional.'), meses: n('Opcional.'), enlace_propuesta: s('URL'), carpeta_drive: s('URL'), disponibilidad: s('Ej. martes 3:30 p. m.'), fase_inicial: s('Solo al iniciar.'), paso_inicial: s('kickoff, working, review o call (solo al iniciar).') }, ['alumno']),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const x = findStudent(w, a.alumno); const t = x.thesis;
      await ctx.call('PUT', `/students/${x.id}/thesis`, { topic: String(a.tema ?? t?.topic ?? ''), estimateMonths: a.meses !== undefined ? Number(a.meses) : t?.estimateMonths ?? null, proposalUrl: String(a.enlace_propuesta ?? t?.proposalUrl ?? ''), driveUrl: String(a.carpeta_drive ?? t?.driveUrl ?? ''), callAvailability: String(a.disponibilidad ?? t?.callAvailability ?? ''), ...(!t ? { phase: a.fase_inicial ?? 'preproposal', step: a.paso_inicial ?? 'kickoff' } : {}) });
      return { listo: `Tesis de ${x.name} ${t ? 'actualizada' : 'iniciada'}` }; } },
  { name: 'listar_documentos', description: 'Documentos subidos (de actividades y de tesis), con su id para descargarlos.', inputSchema: obj({ alumno: s('Opcional.') }),
    run: async (a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace'); const x = a.alumno ? findStudent(w, a.alumno) : undefined;
      return [...w.attachments.filter(f => !x || w.assignments.some(t => t.id === f.assignmentId && t.studentId === x.id)).map(f => ({ id: f.id, nombre: f.name, de: `actividad «${w.assignments.find(t => t.id === f.assignmentId)?.title}»`, tipo: f.kind, kb: Math.round(f.size / 1024) })),
        ...(w.thesisDocs ?? []).filter(d => !x || d.studentId === x.id).map(d => ({ id: d.id, nombre: d.name, de: `tesis de ${w.students.find(y => y.id === d.studentId)?.name}`, tipo: d.kind, kb: Math.round(d.size / 1024) }))]; } },
  { name: 'descargar_documento', description: 'Devuelve un documento en base64 para guardarlo o leerlo. Usa el id de listar_documentos.', inputSchema: obj({ id: s('Id del documento.') }, ['id']),
    run: async (a, ctx) => { const id = String(a.id); const r = await ctx.raw(id.startsWith('tdoc') ? `/thesis-files/${id}` : `/files/${id}`);
      return { nombre: decodeURIComponent(/filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(r.disposition)?.[1] ?? id), tipo: r.type, base64: r.data.toString('base64') }; } },
  { name: 'borrar_documento_tesis', description: 'Investigación: quita un documento del expediente de tesis.', inputSchema: obj({ id: s('Id del documento (tdoc_…).') }, ['id']),
    run: async (a, ctx) => { await ctx.call('DELETE', `/thesis-files/${String(a.id)}`, {}); return { borrado: a.id }; } },
  { name: 'exportar_csv', description: 'El reporte CSV de la página (alumnos, estado y promedio por habilidad), como texto.', inputSchema: obj({}),
    run: async (_a, ctx) => (await ctx.raw('/export')).data.toString('utf8') },
  { name: 'ranking_habilidades', description: 'Promedios por habilidad: de un alumno, o el ranking del laboratorio en una habilidad (para Talento, reportes o gráficas).',
    inputSchema: obj({ alumno: s('Opcional: sus promedios por habilidad.'), habilidad: s('Opcional: ranking de alumnos en esa habilidad.') }),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const evs = w.evaluations.filter(e => e.current);
      const avg = (vals: number[]) => vals.length ? Math.round(vals.reduce((p, q) => p + q, 0) / vals.length * 10) / 10 : null;
      if (a.alumno) { const x = findStudent(w, a.alumno);
        return w.skills.map(k => ({ habilidad: k.name, promedio: avg(evs.filter(e => e.studentId === x.id).flatMap(e => e.scores.filter(sc => sc.skillId === k.id && sc.score !== null).map(sc => sc.score!))) })).filter(r => r.promedio !== null).sort((p, q) => q.promedio! - p.promedio!); }
      const k = a.habilidad ? w.skills.find(y => norm(y.name).includes(norm(String(a.habilidad)))) ?? fail('Habilidad no encontrada.') : undefined;
      if (k) return w.students.map(x => ({ alumno: x.name, promedio: avg(evs.filter(e => e.studentId === x.id).flatMap(e => e.scores.filter(sc => sc.skillId === k.id && sc.score !== null).map(sc => sc.score!))) })).filter(r => r.promedio !== null).sort((p, q) => q.promedio! - p.promedio!);
      return w.skills.map(y => ({ habilidad: y.name, promedio: avg(evs.flatMap(e => e.scores.filter(sc => sc.skillId === y.id && sc.score !== null).map(sc => sc.score!))), evaluaciones: evs.filter(e => e.scores.some(sc => sc.skillId === y.id && sc.score !== null)).length }));
    } },
  { name: 'carga_y_plazos', description: 'Carga de trabajo: entregas por vencer en los próximos días, alumnos sobrecargados (más de 3 abiertas), quién termina su periodo pronto y avance de horas.',
    inputSchema: obj({ dias: n('Ventana en días (por omisión 14).') }),
    run: async (a, ctx) => {
      const w = await ctx.call<Workspace>('GET', '/workspace'); const now = Date.now(); const span = Number(a.dias ?? 14) * 86_400_000;
      const open = w.assignments.filter(t => !['completed', 'cancelled'].includes(t.status));
      const hours = (id: string) => [...w.deliveries.filter(d => w.assignments.some(t => t.id === d.assignmentId && t.studentId === id)).map(d => d.hours ?? 0), ...w.reviews.filter(r => r.studentId === id).map(r => r.hours ?? 0)].reduce((p, q) => p + q, 0);
      return {
        por_vencer: open.filter(t => t.dueAt && Date.parse(t.dueAt) >= now && Date.parse(t.dueAt) <= now + span).sort((p, q) => p.dueAt!.localeCompare(q.dueAt!)).map(t => assignmentLine(w, t)),
        sobrecargados: w.students.map(x => ({ alumno: x.name, abiertas: open.filter(t => t.studentId === x.id).length })).filter(r => r.abiertas > 3),
        terminan_pronto: w.students.filter(x => x.endDate && Date.parse(`${x.endDate}T12:00:00-06:00`) >= now && Date.parse(`${x.endDate}T12:00:00-06:00`) <= now + span).map(x => ({ alumno: x.name, termina: x.endDate })),
        horas: w.students.filter(x => x.hoursRequired).map(x => ({ alumno: x.name, llevadas: hours(x.id), requeridas: x.hoursRequired })),
      };
    } },
  { name: 'listar_endpoints', description: 'Lista TODAS las rutas de la API de SAG con su cuerpo esperado. Úsala con llamar_api para hacer cualquier cosa que no tenga herramienta propia.', inputSchema: obj({}),
    run: async () => API_DOCS },
  { name: 'llamar_api', description: 'Llama directamente a cualquier ruta de la API de SAG (con tus permisos): GET, POST, PATCH, PUT o DELETE. Sirve para cualquier operación nueva que no tenga herramienta. Consulta listar_endpoints primero. Las rutas empiezan sin /api, ej. /workspace.',
    inputSchema: obj({ metodo: s('GET, POST, PATCH, PUT o DELETE.', { enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }), ruta: s('Ej. /reviews/review_123'), cuerpo: { type: 'object', description: 'JSON del cuerpo (POST, PATCH, PUT, DELETE).' } }, ['metodo', 'ruta']),
    run: async (a, ctx) => { const ruta = String(a.ruta).replace(/^\/?api/, ''); if (!ruta.startsWith('/')) fail('La ruta debe empezar con /.');
      return ctx.call(String(a.metodo), ruta, a.metodo === 'GET' ? undefined : (a.cuerpo ?? {})); } },
  { name: 'historial', description: 'Últimos movimientos registrados (quién hizo qué y cuándo).', inputSchema: obj({ limite: n('Por omisión 30, máximo 200.') }),
    run: async (a, ctx) => (await ctx.call<Workspace>('GET', '/workspace')).audit.slice(0, Math.min(200, Number(a.limite ?? 30))).map(e => `${local(e.createdAt)} · ${e.actorName}: ${e.detail}`) },
  { name: 'exportar_datos', description: 'Todos los datos que puedes ver (alumnos, actividades, entregas, evaluaciones, revisiones, habilidades) en JSON compacto, para análisis, tablas o diagramas (Mermaid, gráficas).',
    inputSchema: obj({}), run: async (_a, ctx) => { const w = await ctx.call<Workspace>('GET', '/workspace');
      return { alumnos: w.students.map(x => ({ id: x.id, nombre: x.name, areas: x.areaIds, estado: x.status, modalidades: x.modalities, tesis: x.thesis ? x.thesis.phase : undefined, inicio: x.startDate, termino: x.endDate })),
        actividades: w.assignments.map(t => ({ id: t.id, alumno: t.studentId, area: t.areaId, titulo: t.title, estado: t.status, creada: t.createdAt, limite: t.dueAt, fase: t.phase || undefined, impedimento: !!t.blockedReason })),
        entregas: w.deliveries.map(d => ({ actividad: d.assignmentId, cuando: d.receivedAt, tipo: d.completeness, avance: d.progress, horas: d.hours })),
        evaluaciones: w.evaluations.filter(e => e.current).map(e => ({ actividad: e.assignmentId, alumno: e.studentId, cuando: e.createdAt, resultado: e.outcome, puntajes: Object.fromEntries(e.scores.map(sc => [w.skills.find(k => k.id === sc.skillId)?.name ?? sc.skillId, sc.score])) })),
        revisiones: w.reviews.map(r => ({ alumno: r.studentId, actividad: r.assignmentId, cuando: r.startsAt, estado: r.status, tipo: r.type })) }; } },
];

export function mountMcp(app: Express, options: { store: Store; demo: boolean; authenticate: (req: Request) => User | null }) {
  app.get('/mcp', (_req, res) => { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Usa POST (MCP streamable HTTP).' }); });
  app.delete('/mcp', (_req, res) => { res.status(405).end(); });
  app.post('/mcp', async (req: Request, res: Response) => {
    const user = options.authenticate(req);
    if (!user) { res.setHeader('WWW-Authenticate', 'Bearer'); res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Falta la llave de SAG (Authorization: Bearer sag_…). Créala en Configuración → Claude Code.' } }); return; }
    const base = `http://127.0.0.1:${req.socket.localPort}/api`; const auth = req.get('authorization')!;
    const ctx: Ctx = { user,
      call: async (method, path, body) => {
        const r = await fetch(base + path, { method, headers: { authorization: auth, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
        const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
        if (!r.ok) fail((data as Json).error as string ?? `Error ${r.status}`);
        return data as never;
      },
      raw: async (path) => {
        const r = await fetch(base + path, { headers: { authorization: auth } });
        if (!r.ok) fail(((await r.json().catch(() => ({}))) as Json).error as string ?? `Error ${r.status}`);
        return { data: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') ?? '', disposition: r.headers.get('content-disposition') ?? '' };
      },
      upload: async (path, fields, name, data) => {
        const form = new FormData(); for (const [k, v] of Object.entries(fields)) form.set(k, v); form.set('file', new Blob([new Uint8Array(data)]), name);
        const r = await fetch(base + path, { method: 'POST', headers: { authorization: auth }, body: form }); const out = await r.json().catch(() => ({}));
        if (!r.ok) fail((out as Json).error as string ?? `Error ${r.status}`); return out as Json;
      } };
    const handle = async (msg: Json) => {
      const { id, method, params } = msg as { id?: string | number; method: string; params?: Json };
      if (id === undefined) return null; // notificaciones (notifications/initialized, etc.)
      const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result });
      try {
        if (method === 'initialize') return ok({ protocolVersion: (params?.protocolVersion as string) ?? PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'sag', title: 'SAG · Seguimiento de alumnos', version: '1.0.0' },
          instructions: `Eres el asistente de ${user.name} en SAG (laboratorio). ${user.role === 'director' ? 'Es el jefe: consulta todas las áreas y solo agenda reuniones.' : `Es responsable del área ${user.areaId}.`} Fechas en hora del centro de México (AAAA-MM-DD HH:MM). Para documentos locales, lee el archivo y usa subir_documento con su base64. Para diagramas, usa exportar_datos o resumen_laboratorio y genera Mermaid o gráficas. Si no hay herramienta para algo, usa listar_endpoints y llamar_api. Antes de mover o cancelar citas usa listar_revisiones; nunca dupliques una revisión para moverla.${options.demo ? ' (Sitio de prueba con datos ficticios.)' : ''}` });
        if (method === 'ping') return ok({});
        if (method === 'tools/list') return ok({ tools: TOOLS.filter(t => user.role === 'director' ? READ_ONLY.has(t.name) || BOSS.has(t.name) : !BOSS.has(t.name))
          .map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
        if (method === 'tools/call') {
          const tool = TOOLS.find(t => t.name === params?.name);
          if (!tool) return { jsonrpc: '2.0', id, error: { code: -32602, message: `Herramienta desconocida: ${String(params?.name)}` } };
          try { const result = await tool.run((params?.arguments as Json) ?? {}, ctx); return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] }); }
          catch (e) { return ok({ content: [{ type: 'text', text: (e as Error).message }], isError: true }); }
        }
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Método no soportado: ${method}` } };
      } catch (e) { return { jsonrpc: '2.0', id, error: { code: -32603, message: (e as Error).message } }; }
    };
    const body = req.body as Json | Json[];
    if (Array.isArray(body)) { const out = (await Promise.all(body.map(handle))).filter(Boolean); if (!out.length) { res.status(202).end(); return; } res.json(out); return; }
    const out = await handle(body ?? {});
    if (!out) { res.status(202).end(); return; }
    res.json(out);
  });
}
