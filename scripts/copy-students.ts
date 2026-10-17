/**
 * Copia alumnos de una base a otra (por ejemplo, los que se registraron en el sitio de prueba hacia el real),
 * con sus actividades, revisiones, entregas, evaluaciones, notas, documentos y habilidades nuevas.
 *   node --experimental-sqlite --import tsx scripts/copy-students.ts <origen.sqlite> <destino.sqlite> [archivos-origen] [archivos-destino] [--apply]
 * Sin --apply solo muestra qué copiaría. Salta tesistas importados (TES-NN) y a quien ya exista en el destino
 * (mismo id, matrícula o nombre). Los responsables se asignan al usuario del destino de la misma área. Respalda antes.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { Assignment, Skill, Student } from '../shared/types.js';
import { openStore, type Entity } from '../server/db.js';

const args = process.argv.slice(2); const apply = args.includes('--apply');
const [srcPath, dstPath, srcFiles, dstFiles] = args.filter(a => a !== '--apply');
if (!srcPath || !dstPath) { console.error('Uso: copy-students.ts <origen> <destino> [archivos-origen] [archivos-destino] [--apply]'); process.exit(1); }
const src = openStore(srcPath); const dst = openStore(dstPath);
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const existing = dst.all<Student>('students');
const picked = src.all<Student>('students').filter(s => !/^TES-\d+$/i.test(s.registration)
  && !existing.some(e => e.id === s.id || (s.registration && e.registration.toUpperCase() === s.registration.toUpperCase()) || norm(e.name) === norm(s.name)));
if (!picked.length) { console.log('No hay alumnos nuevos que copiar.'); process.exit(0); }
const ids = new Set(picked.map(s => s.id));
const assignments = src.all<Assignment>('assignments').filter(a => ids.has(a.studentId)); const aIds = new Set(assignments.map(a => a.id));
// Usuarios: el responsable del área en el destino (los ids de cuenta no coinciden entre sitios).
const srcUsers = src.users(); const dstUsers = dst.users();
const userMap = new Map(srcUsers.map(u => [u.id, dstUsers.find(d => d.role === u.role && d.areaId === u.areaId)]));
const mapUser = (id: string) => userMap.get(id)?.id ?? id;
const mapName = (id: string, name: string) => userMap.get(id)?.name ?? name;
const rows: [Entity, Record<string, unknown>][] = [];
for (const s of picked) rows.push(['students', s as unknown as Record<string, unknown>]);
for (const a of assignments) rows.push(['assignments', { ...a, ownerId: mapUser(a.ownerId) }]);
for (const r of src.all<Record<string, string>>('reviews')) if (ids.has(r.studentId) || aIds.has(r.assignmentId)) rows.push(['reviews', { ...r, ownerId: mapUser(r.ownerId) }]);
for (const d of src.all<Record<string, string>>('deliveries')) if (aIds.has(d.assignmentId)) rows.push(['deliveries', { ...d, authorId: mapUser(d.authorId) }]);
for (const e of src.all<Record<string, string>>('evaluations')) if (ids.has(e.studentId) || aIds.has(e.assignmentId)) rows.push(['evaluations', { ...e, evaluatorId: mapUser(e.evaluatorId), evaluatorName: mapName(e.evaluatorId, e.evaluatorName) }]);
for (const n of src.all<Record<string, string>>('notes')) if (ids.has(n.studentId)) rows.push(['notes', n]);
for (const f of src.all<Record<string, string>>('attachments')) if (aIds.has(f.assignmentId)) rows.push(['attachments', f]);
for (const d of src.all<Record<string, string>>('thesisDocs')) if (ids.has(d.studentId)) rows.push(['thesisDocs', d]);
for (const a of src.all<Record<string, string>>('audit')) if (ids.has(a.entityId) || aIds.has(a.entityId)) rows.push(['audit', a]);
// Habilidades que existan solo en el origen (creadas ahí) y que usen estas actividades.
const used = new Set(assignments.flatMap(a => a.skillIds));
for (const k of src.all<Skill>('skills')) if (used.has(k.id) && !dst.get('skills', k.id)) rows.push(['skills', k as unknown as Record<string, unknown>]);
const count = (t: Entity) => rows.filter(r => r[0] === t).length;
console.log(`${apply ? 'Copiando' : 'Se copiaría (simulación; usa --apply)'}: ${picked.map(s => s.name).join(', ')} — actividades ${count('assignments')}, revisiones ${count('reviews')}, entregas ${count('deliveries')}, evaluaciones ${count('evaluations')}, notas ${count('notes')}, adjuntos ${count('attachments') + count('thesisDocs')}, habilidades nuevas ${count('skills')}.`);
const files = rows.filter(r => r[0] === 'attachments' || r[0] === 'thesisDocs').map(r => r[1].storageName as string);
if (files.length && (!srcFiles || !dstFiles)) { console.error('Hay adjuntos: indica las carpetas de archivos de origen y destino.'); process.exit(1); }
if (apply) {
  if (files.length) for (const name of files) {
    const from = resolve(srcFiles!, name); const to = resolve(dstFiles!, name);
    if (!from.startsWith(resolve(srcFiles!) + sep) || !to.startsWith(resolve(dstFiles!) + sep)) throw new Error('Ruta de archivo inválida.');
    if (existsSync(from) && !existsSync(to)) copyFileSync(from, to);
  }
  dst.transaction(() => { for (const [table, row] of rows) dst.put(table, row as { id: string }); });
  console.log('Listo.');
}
src.close(); dst.close();
