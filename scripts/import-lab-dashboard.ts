/**
 * Importa la hoja «lab_dashboard» (Hardware): directorio de estudiantes y registro de tareas.
 *   node --experimental-sqlite --import tsx scripts/import-lab-dashboard.ts <archivo.xlsx> <base> [área=hardware] [--apply]
 * Sin --apply solo muestra qué haría. No duplica: un alumno que ya existe (por nombre casi igual) se incorpora al área
 * y solo se completan sus datos vacíos; una tarea ya importada (mismo alumno, código y fecha) se salta.
 * Directorio → alumno (teléfono, modalidad, materias, nivel, carpeta de Drive), nota con la bitácora y pausa si está inactivo.
 * Registro → actividad (código, semana, horas estimadas, carpeta), con su entrega si ya se entregó.
 * La hoja tiene datos personales: no la subas al repositorio.
 */
import { readFileSync } from 'node:fs';
import { pickAnimal } from '../shared/avatars.js';
import type { AreaId, Assignment, Delivery, Skill, Student, StudentNote } from '../shared/types.js';
import { readWorkbook } from '../server/xlsx.js';
import { openStore, id, now } from '../server/db.js';

const args = process.argv.slice(2); const apply = args.includes('--apply');
const [file, dbPath, areaArg] = args.filter(a => a !== '--apply');
const area = (areaArg ?? 'hardware') as AreaId;
if (!file || !dbPath || !['software', 'hardware', 'research'].includes(area)) { console.error('Uso: import-lab-dashboard.ts <archivo.xlsx> <base> [área] [--apply]'); process.exit(1); }

const sheets = readWorkbook(readFileSync(file));
const sheet = (prefix: string) => sheets.find(s => s.name.toLowerCase().includes(prefix)) ?? (console.error(`Falta la hoja «${prefix}».`), process.exit(1));
const clean = (s = '') => s.replace(/\s+/g, ' ').trim();
const norm = (s: string) => clean(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const serial = (v?: string) => v && /^\d+(\.\d+)?$/.test(v) && Number(v) > 40000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(Number(v)) * 86_400_000).toISOString().slice(0, 10) : null;
const at = (day: string, time: string) => new Date(`${day}T${time}:00-06:00`).toISOString();
const phone = (v = '') => { const t = clean(v); if (/^\d(\.\d+)?E\d+$/i.test(t)) { const digits = String(Math.round(Number(t))); return digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3'); } return t; };
const headerRow = (rows: Map<number, string[]>, first: string) => [...rows].find(([, r]) => norm(r[0] ?? '').startsWith(first))?.[0] ?? 0;
const cellRef = (colIndex: number, row: number) => `${String.fromCharCode(65 + colIndex)}${row}`;

const store = openStore(dbPath);
const owner = store.users().find(u => u.areaId === area);
const actorName = owner?.name ?? 'SAG';
const log = { added: [] as string[], joined: [] as string[], paused: [] as string[], notes: 0, tasks: 0, skipped: 0, delivered: 0, skills: [] as string[] };

const run = () => {
  const students = store.all<Student>('students');
  const find = (name: string) => students.find(s => norm(s.name) === norm(name)) ?? students.find(s => distance(norm(s.name), norm(name)) <= 3)
    ?? students.find(s => { const a = norm(s.name).split(' '); const b = norm(name).split(' '); return a.length >= 3 && b.length >= 3 && a[0] === b[0] && a.slice(1).filter(p => b.includes(p)).length >= 2; });

  /* ---------- Directorio ---------- */
  const dir = sheet('directorio'); const h = headerRow(dir.rows, 'id estudiante'); const head = (dir.rows.get(h) ?? []).map(norm);
  const c = (name: string) => head.findIndex(x => x.startsWith(name));
  const C = { name: c('nombre'), phone: c('telefono'), role: c('rol'), subjects: c('materias'), sspp: c('ss'), status: c('estado'), contacted: c('contacto'), log: c('bitacora'), folder: c('enlace'), level: c('nivel') };
  for (const [rowNum, r] of [...dir.rows].filter(([n]) => n > h)) {
    const name = clean(r[C.name]); if (name.length < 3 || name.startsWith('#')) continue;
    const mods: string[] = [];
    if (/tesis/i.test(r[C.role] ?? '')) mods.push('Tesis'); else if (/colaborador/i.test(r[C.role] ?? '')) mods.push('Colaborador'); else if (/iniciante/i.test(r[C.role] ?? '')) mods.push('Colaborador');
    const subjects = Number(/(\d+)\s*materia/i.exec(r[C.subjects] ?? '')?.[1] ?? 0) || null; if (subjects) mods.push('Materias');
    if (/servicio/i.test(r[C.sspp] ?? '')) mods.push('Servicio social'); if (/practica|práctica/i.test(norm(r[C.sspp] ?? ''))) mods.push('Prácticas');
    const folderUrl = dir.links.get(cellRef(C.folder, rowNum)) ?? ''; const level = clean(r[C.level]) || null; const tel = phone(r[C.phone]);
    const at0 = now(); let s = find(name);
    if (!s) {
      s = { id: id('student'), name, registration: '', email: '', phone: tel, career: '', semester: '', modalities: [...new Set(mods)], status: 'active', areaIds: [area], technologies: [], createdAt: at0, version: 1,
        avatar: pickAnimal(students.map(x => x.avatar)), startDate: null, endDate: null, hoursRequired: null, subjects, level, folderUrl };
      students.push(s); log.added.push(name);
      if (apply) { store.put('students', s); store.put('audit', { id: id('audit'), actorName, areaId: area, action: 'student_created', entityId: s.id, detail: `Alta de ${name} desde el control del laboratorio.`, createdAt: at0 }); }
    } else {
      const next: Student = { ...s, phone: s.phone || tel, modalities: [...new Set([...s.modalities, ...mods])], subjects: s.subjects ?? subjects, level: s.level ?? level, folderUrl: s.folderUrl || folderUrl,
        areaIds: s.areaIds.includes(area) ? s.areaIds : [...s.areaIds, area], version: s.version + 1 };
      if (!s.areaIds.includes(area)) log.joined.push(`${s.name}${norm(s.name) !== norm(name) ? ` (= ${name})` : ''}`);
      Object.assign(s, next); if (apply) store.put('students', next);
    }
    // Bitácora → nota del área (una sola vez).
    const text = clean(r[C.log]);
    if (text && !store.all<StudentNote>('notes').some(n => n.studentId === s!.id && n.text.includes(text))) {
      log.notes++;
      if (apply) store.put('notes', { id: id('note'), studentId: s.id, areaId: area, authorName: actorName, text: `Bitácora de contacto${r[C.contacted] === '1' ? ' (contacto realizado)' : ' (sin contacto)'}: ${text}`, createdAt: at0 });
    }
    // Inactivo → pausa en el área.
    if (/inactivo/i.test(r[C.status] ?? '') && !s.pauses?.[area]) {
      log.paused.push(s.name);
      const pause = { kind: /no ha regresado|sin contacto/i.test(text) ? 'no_contact' as const : 'temporary' as const, reason: text || 'Inactivo en el control del laboratorio.', since: at0, returnAt: null };
      s.pauses = { ...(s.pauses ?? {}), [area]: pause };
      if (apply) store.put('students', { ...s, version: s.version + 1 });
    }
  }

  /* ---------- Habilidades por familia de código ---------- */
  const FAMILIES: Record<string, [string, string]> = { BJT: ['Transistores BJT', 'Polarización, análisis y armado de circuitos con transistores BJT.'], OPA: ['Amplificadores operacionales', 'Diseño, simulación y armado de circuitos con amplificadores operacionales.'], SPICE: ['Simulación SPICE', 'Modelado y simulación de circuitos en SPICE.'], TSH: ['Prácticas TSH', 'Prácticas de la serie TSH.'], AFE: ['Front-end analógico', 'Acondicionamiento de señal y etapas analógicas de entrada.'] };
  const skills = store.all<Skill>('skills');
  const skillFor = (code: string) => {
    const fam = /^[A-Z]+/.exec(code)?.[0] ?? 'GEN'; const [name, description] = FAMILIES[fam] ?? ['Electrónica', 'Trabajo práctico de electrónica.'];
    let k = skills.find(x => norm(x.name) === norm(name) && (!x.areaId || x.areaId === area));
    if (!k) { k = { id: id('skill'), name, description, areaId: area }; skills.push(k); log.skills.push(name); if (apply) store.put('skills', k); }
    return k.id;
  };

  /* ---------- Registro de tareas ---------- */
  const reg = sheet('registro'); const hr = headerRow(reg.rows, 'estudiante'); const rh = (reg.rows.get(hr) ?? []).map(norm);
  const k = (name: string) => rh.findIndex(x => x.startsWith(name));
  const R = { name: k('estudiante'), week: k('semana'), folder: k('enlace'), level: k('nivel'), n: k('tarea #'), code: k('id tarea'), assigned: k('fecha de asig'), due: k('fecha limite'), est: k('horas estimadas'), delivered: k('fecha real'), real: k('horas reales'), status: k('estado de la tarea') };
  const assignments = store.all<Assignment>('assignments');
  for (const [rowNum, r] of [...reg.rows].filter(([n]) => n > hr)) {
    const name = clean(r[R.name]); const code = clean(r[R.code]); const assigned = serial(r[R.assigned]); if (!name || !code || !assigned) continue;
    const s = find(name); if (!s) { log.skipped++; continue; }
    const week = clean(r[R.week]); const label = clean(r[R.folder]); const due = serial(r[R.due]); const delivered = serial(r[R.delivered]); const status = norm(r[R.status] ?? '');
    const title = `${code} · ${label || `Tarea ${clean(r[R.n])}`}${week ? ` (${week})` : ""}`;
    if (assignments.some(a => a.studentId === s.id && a.title === title && (a.startAt ?? '').slice(0, 10) === at(assigned, '09:00').slice(0, 10))) { log.skipped++; continue; }
    const link = reg.links.get(cellRef(R.folder, rowNum));
    const est = Number(r[R.est]) || null; const real = Number(r[R.real]) || null;
    const a: Assignment = {
      id: id('assignment'), studentId: s.id, areaId: area, ownerId: owner?.id ?? '', title,
      description: [`Tarea ${clean(r[R.n]) || ''} de la ${week || 'semana'} (${label}).`.replace('Tarea  de', 'Tarea de'), clean(r[R.level]) ? `${clean(r[R.level])}.` : '', est ? `Horas estimadas: ${est}.` : ''].filter(Boolean).join(' '),
      project: '', dueAt: due ? at(due, '23:59') : null, startAt: at(assigned, '09:00'), skillIds: [skillFor(code)], phase: '', priority: 'normal',
      links: link ? [{ label: `Carpeta ${label || code}`, url: link }] : [],
      status: /cancel/.test(status) ? 'cancelled' : delivered || /entregad/.test(status) ? 'pending_review' : 'in_progress',
      blockedReason: '', createdAt: at(assigned, '09:00'), updatedAt: now(), version: 1,
    } as Assignment;
    assignments.push(a); log.tasks++;
    if (apply) store.put('assignments', a);
    if (a.status === 'pending_review') {
      const when = delivered ?? due ?? assigned; log.delivered++;
      if (apply) store.put('deliveries', { id: id('delivery'), assignmentId: a.id, receivedAt: at(when, '12:00'), recordedAt: now(), summary: delivered ? 'Entregada (registro del laboratorio).' : 'Entregada según el registro del laboratorio (sin fecha real).', url: link ?? '', completeness: 'complete', authorId: owner?.id ?? '', hours: real, progress: null } satisfies Delivery);
    }
    if (apply) store.put('audit', { id: id('audit'), actorName, areaId: area, action: 'assignment_created', entityId: a.id, detail: `${title} para ${s.name} (registro del laboratorio).`, createdAt: now() });
  }
};
if (apply) store.transaction(run); else run();
store.close();
console.log(`${apply ? 'Hecho' : 'Simulación (usa --apply)'} — alumnos nuevos ${log.added.length}: ${log.added.join(', ') || '—'}.
Ya existían y se incorporan al área ${log.joined.length}: ${log.joined.join(', ') || '—'}.
Pausados (inactivos) ${log.paused.length}: ${log.paused.join(', ') || '—'}. Notas de bitácora: ${log.notes}.
Actividades ${log.tasks} (entregadas, por evaluar: ${log.delivered}); omitidas ${log.skipped}. Habilidades nuevas: ${log.skills.join(', ') || '—'}.`);
