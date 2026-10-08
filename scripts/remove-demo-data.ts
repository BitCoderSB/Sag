/**
 * Quita los datos ficticios de la demostración y deja solo a los tesistas importados (matrícula TES-NN).
 *   node --experimental-sqlite --import tsx scripts/remove-demo-data.ts <ruta de la base> [carpeta de archivos] [--apply]
 * Sin --apply solo cuenta lo que quitaría. Borra alumnos ficticios con sus actividades, revisiones, entregas,
 * evaluaciones, notas, adjuntos y bitácora; también reuniones y el banco de actividades de ejemplo.
 * Conserva cuentas, habilidades, tesistas, sus documentos de tesis y su bitácora. Haz un respaldo antes.
 */
import { existsSync, unlinkSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { Assignment, Student } from '../shared/types.js';
import { openStore, type Entity } from '../server/db.js';

const args = process.argv.slice(2); const apply = args.includes('--apply');
const [dbPath, filesPath] = args.filter(a => a !== '--apply');
if (!dbPath) { console.error('Uso: remove-demo-data.ts <ruta de la base> [carpeta de archivos] [--apply]'); process.exit(1); }
const store = openStore(dbPath); const filesDir = filesPath ? resolve(filesPath) : null;
const keep = (s: Student) => /^TES-\d+$/i.test(s.registration);
const students = store.all<Student>('students');
const kept = students.filter(keep); const gone = new Set(students.filter(s => !keep(s)).map(s => s.id));
if (!kept.length) { console.error('No hay tesistas importados (TES-NN): no se quita nada.'); process.exit(1); }
const assignments = new Set(store.all<Assignment>('assignments').filter(a => gone.has(a.studentId)).map(a => a.id));
const plan: [Entity, (r: Record<string, unknown>) => boolean][] = [
  ['students', r => gone.has(r.id as string)],
  ['assignments', r => assignments.has(r.id as string)],
  ['reviews', r => gone.has(r.studentId as string) || assignments.has(r.assignmentId as string)],
  ['deliveries', r => assignments.has(r.assignmentId as string)],
  ['evaluations', r => gone.has(r.studentId as string) || assignments.has(r.assignmentId as string)],
  ['notes', r => gone.has(r.studentId as string)],
  ['attachments', r => assignments.has(r.assignmentId as string)],
  ['thesisDocs', r => gone.has(r.studentId as string)],
  ['audit', r => gone.has(r.entityId as string) || assignments.has(r.entityId as string) || !kept.some(s => s.id === r.entityId)],
  ['meetings', () => true],
  ['drafts', () => true],
];
const counts: string[] = []; const files: string[] = [];
const run = () => { for (const [table, match] of plan) {
  const rows = store.all<Record<string, unknown>>(table).filter(match);
  counts.push(`${table}: ${rows.length}`);
  if (table === 'attachments' || table === 'thesisDocs') files.push(...rows.map(r => r.storageName as string));
  if (apply) for (const r of rows) store.remove(table, r.id as string);
} };
if (apply) store.transaction(run); else run();
if (apply && filesDir) for (const name of files) { const p = resolve(filesDir, name); if (p.startsWith(filesDir + sep) && existsSync(p)) unlinkSync(p); }
store.close();
console.log(`${apply ? 'Quitado' : 'Se quitaría (simulación; usa --apply)'} — ${counts.join(', ')}. Se conservan ${kept.length} tesistas.`);
