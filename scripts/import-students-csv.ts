/**
 * Agrega alumnos a un área desde un CSV (Nombre, Especialidad, Correo, Matricula, Status Lab, Telefono).
 *   node --experimental-sqlite --import tsx scripts/import-students-csv.ts <archivo.csv> <base> <área> [--apply]
 * Sin --apply solo muestra qué haría. Si el alumno ya existe (misma matrícula o nombre casi igual), no se duplica:
 * solo se completan los datos vacíos y se agrega al área. El CSV tiene datos personales: no lo subas al repositorio.
 */
import { readFileSync } from 'node:fs';
import { pickAnimal } from '../shared/avatars.js';
import type { AreaId, Student } from '../shared/types.js';
import { openStore, id, now } from '../server/db.js';

const args = process.argv.slice(2); const apply = args.includes('--apply');
const [file, dbPath, area] = args.filter(a => a !== '--apply') as [string, string, AreaId];
if (!file || !dbPath || !['software', 'hardware', 'research'].includes(area)) { console.error('Uso: import-students-csv.ts <archivo.csv> <base> <software|hardware|research> [--apply]'); process.exit(1); }

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; continue; }
    if (c === '"') quoted = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const clean = (s = '') => s.replace(/\s+/g, ' ').trim();
const norm = (s: string) => clean(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Distancia de edición: «Gonzales» y «González» son la misma persona. */
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const modalities = (status: string) => {
  const s = norm(status); const out: string[] = [];
  if (/colaborador/.test(s)) out.push('Colaborador');
  if (/materia/.test(s)) out.push('Materias');
  if (/servicio/.test(s)) out.push('Servicio social');
  if (/practica/.test(s)) out.push('Prácticas');
  if (/tesis/.test(s)) out.push('Tesis');
  return out;
};

const rows = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''));
const h = rows.findIndex(r => r.some(c => norm(c) === 'nombre'));
if (h < 0) { console.error('No encontré la fila de encabezados (Nombre, …).'); process.exit(1); }
const head = rows[h].map(norm); const col = (name: string) => head.findIndex(c => c.startsWith(name));
const C = { name: col('nombre'), spec: col('especialidad'), email: col('correo'), reg: col('matricula'), status: col('status'), phone: col('telefono') };

const store = openStore(dbPath);
const actor = store.users().find(u => u.areaId === area);
const added: string[] = []; const updated: string[] = [];
const run = () => {
  for (const r of rows.slice(h + 1)) {
    const name = clean(r[C.name]); if (name.length < 2) continue;
    const registration = clean(r[C.reg]).replace(/\s/g, '').toUpperCase();
    const email = clean(r[C.email]).toLowerCase(); const phone = clean(r[C.phone]); const spec = clean(r[C.spec]);
    const mods = modalities(r[C.status] ?? '');
    const all = store.all<Student>('students');
    const match = all.find(s => (registration && s.registration.toUpperCase() === registration) || (email && s.email.toLowerCase() === email) || distance(norm(s.name), norm(name)) <= 2);
    const at = now();
    if (match) {
      const next: Student = { ...match,
        registration: match.registration || (registration && !all.some(s => s.registration.toUpperCase() === registration) ? registration : match.registration),
        email: match.email || email, phone: match.phone || phone,
        modalities: [...new Set([...match.modalities, ...mods])], technologies: match.technologies.length || !spec ? match.technologies : [spec],
        areaIds: match.areaIds.includes(area) ? match.areaIds : [...match.areaIds, area], version: match.version + 1 };
      if (JSON.stringify(next) === JSON.stringify({ ...match, version: match.version + 1 })) continue;
      updated.push(`${match.name}${norm(match.name) !== norm(name) ? ` (= ${name})` : ''}`);
      if (apply) { store.put('students', next); store.put('audit', { id: id('audit'), actorName: actor?.name ?? 'SAG', areaId: area, action: 'student_updated', entityId: match.id, detail: `Datos completados desde la lista de alumnos de ${area}.`, createdAt: at }); }
      continue;
    }
    added.push(name);
    if (apply) {
      const student: Student = { id: id('student'), name, registration, email, phone, career: '', semester: '', modalities: mods, status: 'active', areaIds: [area], technologies: spec ? [spec] : [], createdAt: at, version: 1, avatar: pickAnimal(all.map(s => s.avatar)), startDate: at.slice(0, 10), endDate: null, hoursRequired: null };
      store.put('students', student);
      store.put('audit', { id: id('audit'), actorName: actor?.name ?? 'SAG', areaId: area, action: 'student_created', entityId: student.id, detail: `Alta de ${name} desde la lista de alumnos.`, createdAt: at });
    }
  }
};
if (apply) store.transaction(run); else run();
store.close();
console.log(`${apply ? 'Hecho' : 'Simulación (usa --apply)'} — nuevos ${added.length}: ${added.join(', ') || '—'}. Ya existían (se completan datos vacíos) ${updated.length}: ${updated.join(', ') || '—'}.`);
