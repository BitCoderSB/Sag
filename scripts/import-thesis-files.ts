/**
 * Carga la carpeta «Propuestas de Tesis» (descargada de Drive) al expediente de tesis de cada alumno.
 *   node --experimental-sqlite --import tsx scripts/import-thesis-files.ts <carpeta> [ruta de la base] [carpeta de archivos]
 * Sin rutas usa SAG_DB / SAG_FILES o .data/sag.sqlite y .data/files. Cada subcarpeta lleva el nombre del tesista.
 * Solo agrega: salta documentos que ya estén (mismo nombre y tamaño) y carpetas sin tesista. El cronograma .xlsx más
 * reciente de cada tesista se vuelve su plan en el Gantt. Los documentos tienen datos personales: no los subas al repositorio.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Student } from '../shared/types.js';
import { DOC_KIND_LABEL, guessDocKind, type ThesisDocument, type ThesisPlanItem } from '../shared/thesis.js';
import { readSchedule } from '../server/xlsx.js';
import { openStore, id, now } from '../server/db.js';

const [folder, dbPath, filesPath] = process.argv.slice(2);
if (!folder) { console.error('Uso: import-thesis-files.ts <carpeta> [ruta de la base] [carpeta de archivos]'); process.exit(1); }
const TYPES: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain', '.csv': 'text/csv', '.md': 'text/plain', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

const filesDir = resolve(filesPath ?? process.env.SAG_FILES ?? '.data/files');
mkdirSync(filesDir, { recursive: true });
const store = openStore(dbPath ?? process.env.SAG_DB ?? '.data/sag.sqlite');
const actor = store.users().find(u => u.areaId === 'research');
const students = store.all<Student>('students').filter(s => s.thesis);
const existing = store.all<ThesisDocument>('thesisDocs');
let added = 0; let plans = 0; const unmatched: string[] = []; const ignored: string[] = [];
store.transaction(() => {
  for (const entry of readdirSync(folder, { withFileTypes: true }).filter(e => e.isDirectory())) {
    const student = students.find(s => norm(s.name) === norm(entry.name));
    if (!student) { unmatched.push(entry.name); continue; }
    const files = walk(join(folder, entry.name)).map(path => ({ path, name: path.split(/[\\/]/).pop()!, stat: statSync(path) })).sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
    let plan: ThesisPlanItem[] | null = null;
    for (const f of files) {
      const ext = extname(f.name).toLowerCase();
      if (!TYPES[ext] || f.stat.size === 0 || f.stat.size > 10 * 1024 * 1024) { ignored.push(`${entry.name}/${f.name}`); continue; }
      const kind = guessDocKind(f.name);
      if (kind === 'schedule' && ext === '.xlsx') plan = readSchedule(readFileSync(f.path)) ?? plan; // el más reciente gana
      if (existing.some(d => d.studentId === student.id && d.name === f.name && d.size === f.stat.size)) continue;
      const doc = { id: id('tdoc'), studentId: student.id, name: f.name.slice(0, 180), size: f.stat.size, kind, createdAt: new Date(f.stat.mtimeMs).toISOString(), uploadedBy: actor?.name ?? 'SAG', storageName: randomBytes(24).toString('hex') + ext, mimeType: TYPES[ext] };
      copyFileSync(f.path, join(filesDir, doc.storageName));
      store.put('thesisDocs', doc); added++;
      store.put('audit', { id: id('audit'), actorName: actor?.name ?? 'SAG', areaId: 'research', action: 'thesis_file', entityId: student.id, detail: `${DOC_KIND_LABEL[kind]} de ${student.name}: ${f.name} (carpeta de Drive).`, createdAt: now() });
    }
    if (plan && JSON.stringify(plan) !== JSON.stringify(student.thesis!.plan)) { const fresh = store.get<Student>('students', student.id)!; store.put('students', { ...fresh, thesis: { ...fresh.thesis!, plan }, version: fresh.version + 1 }); plans++; }
  }
});
store.close();
console.log(`Documentos agregados: ${added}. Cronogramas cargados: ${plans}.${unmatched.length ? ` Carpetas sin tesista registrado (no se cargaron): ${unmatched.join(', ')}.` : ''}${ignored.length ? ` Archivos no admitidos: ${ignored.join(', ')}.` : ''}`);
