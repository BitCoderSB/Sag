/**
 * Importa tesistas al área de Investigación desde el CSV «Seguimiento de Tesis - Laboratorio».
 *   node --experimental-sqlite --import tsx scripts/import-tesistas.ts <archivo.csv> [ruta de la base]
 * Sin ruta usa SAG_DB o .data/sag.sqlite. Solo agrega: no modifica ni borra alumnos existentes y salta a quien ya
 * esté (por matrícula o por nombre). Se puede correr varias veces. El CSV tiene datos personales: no lo subas al repositorio.
 * Matrícula temporal TES-01…: corrígela después en «Editar expediente».
 */
import { readFileSync } from 'node:fs';
import { pickAnimal } from '../shared/avatars.js';
import type { Student } from '../shared/types.js';
import type { Thesis } from '../shared/thesis.js';
import { RESEARCH_DRIVE_URL } from '../shared/research.js';
import { openStore, id, now } from '../server/db.js';

const [file, dbPath] = process.argv.slice(2);
if (!file) { console.error('Uso: import-tesistas.ts <archivo.csv> [ruta de la base]'); process.exit(1); }

/** CSV con comillas («"a, b"») y celdas vacías. */
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
const months = (s: string) => { const y = /(\d+)\s*año/.exec(s); const m = /(\d+)\s*mes/.exec(s); const total = (y ? +y[1] * 12 : 0) + (m ? +m[1] : 0); return total || null; };
const day = (s: string) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim()); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const addMonths = (key: string, n: number) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const clean = (s = '') => s.replace(/\s+/g, ' ').trim();
const norm = (s: string) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const rows = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''));
const header = rows[0].map(h => clean(h).toLowerCase());
const col = (name: string) => header.findIndex(h => h.startsWith(name));
const C = { n: col('#'), name: col('estudiante'), career: col('carrera'), estimate: col('tiempo estimado'), start: col('fecha de inicio'), topic: col('tema'), defined: col('pre-propuesta definida'), link: col('link'), email: col('correo'), phone: col('número'), callDate: col('fecha disponible'), callTime: col('horario') };
if (C.name < 0) { console.error('El CSV no tiene la columna «Estudiante».'); process.exit(1); }

const store = openStore(dbPath ?? process.env.SAG_DB ?? '.data/sag.sqlite');
const actor = store.users().find(u => u.areaId === 'research');
const existing = store.all<Student>('students');
let added = 0; const skipped: string[] = [];
store.transaction(() => {
  for (const r of rows.slice(1)) {
    const name = clean(r[C.name]); if (!name || !/^\d+$/.test(clean(r[C.n]))) continue;
    const registration = `TES-${clean(r[C.n]).padStart(2, '0')}`;
    if (existing.some(s => s.registration.toUpperCase() === registration || norm(s.name) === norm(name))) { skipped.push(name); continue; }
    const estimate = months(r[C.estimate] ?? ''); const startDate = day(r[C.start] ?? '');
    const defined = norm(r[C.defined] ?? '').startsWith('si');
    const at = now();
    const thesis: Thesis = {
      topic: clean(r[C.topic]), estimateMonths: estimate, proposalUrl: clean(r[C.link]), driveUrl: '',
      callAvailability: [clean(r[C.callDate]), clean(r[C.callTime]).replace(/:00(?= [ap])/, '').replace(/([ap]).m./, '$1. m.')].filter(Boolean).join(' · '),
      // Con pre-propuesta definida: entregó y falta revisarla (puntos 3–4). Sin ella: investiga temas (punto 2).
      phase: 'preproposal', step: defined ? 'review' : 'working',
      startedAt: startDate ? `${startDate}T12:00:00-06:00` : at, phaseSince: at, defendedAt: null,
      history: [{ id: id('thesis'), at, phase: 'preproposal', action: 'moved', to: undefined, note: `Importado del registro de tesistas.${defined ? ' Pre-propuesta definida.' : ' Sin pre-propuesta.'}`, actorName: actor?.name ?? 'SAG' }],
    };
    const student: Student = {
      id: id('student'), name, registration, email: clean(r[C.email]), phone: clean(r[C.phone]), career: clean(r[C.career]), semester: '',
      modalities: ['Tesis'], status: 'active', areaIds: ['research'], technologies: [], createdAt: at, version: 1,
      avatar: pickAnimal([...existing, ...store.all<Student>('students')].map(s => s.avatar)),
      startDate, endDate: startDate && estimate ? addMonths(startDate, estimate) : null, hoursRequired: null, thesis,
    };
    store.put('students', student);
    store.put('audit', { id: id('audit'), actorName: actor?.name ?? 'SAG', areaId: 'research', action: 'student_created', entityId: student.id, detail: `Alta de ${name} (${registration}) desde el registro de tesistas.`, createdAt: at });
    added++;
  }
});
store.close();
console.log(`Tesistas agregados: ${added}.${skipped.length ? ` Ya existían (sin cambios): ${skipped.join(', ')}.` : ''} Carpeta del área: ${RESEARCH_DRIVE_URL}`);
