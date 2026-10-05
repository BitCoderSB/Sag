import { ANIMALS } from '../shared/avatars.js';
import type { AreaId, Assignment, Evaluation, Review, Skill, Student } from '../shared/types.js';
import { Store, id, now, hashPassword } from './db.js';
import { randomBytes } from 'node:crypto';

export const USER_DEFAULTS = [
  { id: 'user_software', name: 'Ana Torres', email: 'ana@sag.local', role: 'software', areaId: 'software' },
  { id: 'user_hardware', name: 'Miguel Ortega', email: 'miguel@sag.local', role: 'hardware', areaId: 'hardware' },
  { id: 'user_research', name: 'Elena Ríos', email: 'elena@sag.local', role: 'research', areaId: 'research' },
  { id: 'user_director', name: 'Roberto Salazar', email: 'roberto@sag.local', role: 'director', areaId: null },
] as const;
export const DEFAULT_SKILLS: Skill[] = [
  { id: 'skill_backend', name: 'Backend', areaId: 'software', description: 'Lógica del servidor, contratos, seguridad y manejo de errores.' },
  { id: 'skill_frontend', name: 'Frontend', areaId: 'software', description: 'Interfaces funcionales, adaptables y accesibles.' },
  { id: 'skill_ux', name: 'UX/UI', areaId: 'software', description: 'Comprensión del usuario y claridad de flujos e interacción.' },
  { id: 'skill_testing', name: 'Pruebas', areaId: 'software', description: 'Diseño y ejecución de pruebas que verifican el comportamiento.' },
  { id: 'skill_electronics', name: 'Electrónica', areaId: 'hardware', description: 'Diseño, montaje y verificación de circuitos.' },
  { id: 'skill_firmware', name: 'Firmware', areaId: 'hardware', description: 'Programación y depuración de sistemas embebidos.' },
  { id: 'skill_pcb', name: 'Diseño PCB', areaId: 'hardware', description: 'Diseño y validación de placas de circuito impreso.' },
  { id: 'skill_methodology', name: 'Metodología', areaId: 'research', description: 'Preguntas, hipótesis y diseño de investigación reproducible.' },
  { id: 'skill_analysis', name: 'Análisis de datos', areaId: 'research', description: 'Análisis, interpretación y presentación de evidencia.' },
  { id: 'skill_literature', name: 'Revisión bibliográfica', areaId: 'research', description: 'Búsqueda, evaluación y síntesis de fuentes.' },
  { id: 'skill_documentation', name: 'Documentación', areaId: null, description: 'Explicación clara y reproducible de decisiones y resultados.' },
  { id: 'skill_communication', name: 'Comunicación', areaId: null, description: 'Presentación y discusión de resultados técnicos.' },
];
export function seedSkills(store: Store) { for (const skill of DEFAULT_SKILLS) if (!store.get('skills', skill.id)) store.put('skills', skill); }
// Dates are relative to the current date in Mexico City, rather than the host locale.
function dateAt(offset: number, hour = 11) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + offset, hour + 6)).toISOString();
}
export async function seedDemo(store: Store) {
  if (store.db.prepare("SELECT value FROM meta WHERE key='demo_seeded'").get()) { enrichDemo(store); return; }
  if (store.users().length || store.all('students').length) throw new Error('La base de demostración debe estar vacía. Usa una ruta separada.');
  const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
  store.transaction(() => {
    for (const user of USER_DEFAULTS) store.putUser({ ...user, passwordHash });
    seedSkills(store);
    const names = ['Andrea Martínez','Luis Hernández','Sofía Pérez','Diego Ramírez','Valeria Torres','Emiliano Castro','Camila Rojas','Mateo Rivera','Mariana López','Carlos Ruiz','Lucía Mendoza','Daniel Vega','Regina Flores','Pablo Navarro','Isabel Santos','Santiago León'];
    const memberships: AreaId[][] = [ ['software','research'],['software'],['software','hardware'],['software','research'],['software'],['software','hardware'],['software','research'],['software'],['software','hardware','research'],['software','research'],['hardware'],['hardware'],['hardware'],['hardware'],['research'],['research'] ];
    const technologies = [['React','Figma'],['Python','PostgreSQL'],['C++','ESP32'],['Python','Pandas'],['React','TypeScript'],['Rust','Docker'],['Python','OpenCV'],['Go','Docker'],['TypeScript','Arduino'],['Python','Jupyter'],['KiCad','STM32'],['C++','Raspberry Pi'],['KiCad'],['MATLAB'],['R','Zotero'],['Python','LaTeX']];
    const students = names.map((name, index): Student => ({ id: `student_${index+1}`, name, registration: `A2026${String(index+1).padStart(3,'0')}`, email: `${name.split(' ')[0].toLowerCase()}${index+1}@universidad.example`, career: index > 13 ? 'Ingeniería en Ciencias' : 'Ingeniería en Computación', semester: `${5 + index % 4}.º semestre`, modalities: index % 3 === 0 ? ['Tesis','Servicio social'] : index % 3 === 1 ? ['Servicio social'] : ['Prácticas'], status: 'active', areaIds: memberships[index], technologies: technologies[index], avatar: ANIMALS[index % ANIMALS.length], createdAt: dateAt(-70-index), version: 1 }));
    students.forEach(s => store.put('students', s));
    const titles: Record<AreaId, string[]> = { software: ['Diseño del panel de seguimiento','API de gestión del laboratorio','Interfaz del monitor de sensores','Pipeline de procesamiento de datos','Flujo de registro de usuarios','Automatización de pruebas','Clasificador de imágenes','Servicio de notificaciones','Panel de reservas de equipo','Visualización de resultados'], hardware: ['Calibración de sensores de temperatura','Prototipo de adquisición de señales','Integración del módulo de comunicación','Diseño de placa de alimentación','Pruebas del controlador STM32','Montaje del circuito de protección','Caracterización del sensor óptico','Validación del sistema de medición'], research: ['Estado del arte: interacción humano-computadora','Análisis de los datos experimentales','Evaluación del modelo de visión','Protocolo de validación del prototipo','Comparación de métodos de clasificación','Revisión sistemática de literatura','Diseño del experimento de campo'] };
    for (const areaId of ['software','hardware','research'] as AreaId[]) {
      const areaStudents = students.filter(s => s.areaIds.includes(areaId));
      const areaSkills = DEFAULT_SKILLS.filter(s => s.areaId === areaId).map(s => s.id);
      areaStudents.forEach((student, index) => {
        const ownerId = `user_${areaId}`;
        const title = titles[areaId][index % titles[areaId].length];
        const assignment: Assignment = { id: `assignment_${areaId}_${index+1}`, studentId: student.id, areaId, ownerId, title, description: 'Desarrollar una solución verificable y documentar las decisiones. Presentar el resultado durante la próxima revisión junto con las evidencias y los puntos pendientes.', project: ['Laboratorio conectado','Plataforma SAG','Exploración aplicada'][index % 3], dueAt: dateAt(index === 1 ? -2 : index+2, 18), status: index === 0 ? 'pending_review' : index === 3 ? 'changes_requested' : 'in_progress', priority: index === 1 ? 'high' : 'normal', blockedReason: index === 1 ? (areaId === 'hardware' ? 'Pendiente recibir componentes para completar las pruebas.' : 'Se requiere validar el alcance con el responsable.') : '', skillIds: [...areaSkills.slice(0, index === 0 ? 3 : 2), 'skill_documentation'], links: [], createdAt: dateAt(-12-index), updatedAt: dateAt(-1), version: 1 };
        store.put('assignments', assignment);
        if (index !== 1) {
          const review: Review = { id: `review_${areaId}_${index+1}`, studentId: student.id, assignmentId: assignment.id, areaId, ownerId, startsAt: dateAt(index === 0 ? 0 : index < 4 ? 1 : index-1, 10+index%5), durationMinutes: 30, type: index === 0 ? 'evaluation' : 'follow_up', status: 'scheduled', notes: 'Revisar avances, resolver dudas y acordar siguientes pasos.', outcome: '', version: 1 };
          store.put('reviews', review);
        }
        if (index === 0) store.put('deliveries', { id: id('delivery'), assignmentId: assignment.id, receivedAt: dateAt(-1), recordedAt: dateAt(-1), summary: 'Primera versión terminada. Lista para revisión con el responsable.', url: '', completeness: 'complete', authorId: ownerId });
        for (let history = 0; history < (index % 3)+2; history++) {
          const past: Assignment = { ...assignment, id: `assignment_${areaId}_${index+1}_past_${history}`, title: `${['Fundamentos','Prototipo inicial','Validación','Documentación'][history]} · ${title}`, status: 'completed', blockedReason: '', dueAt: dateAt(-15-history*14), createdAt: dateAt(-29-history*14), updatedAt: dateAt(-15-history*14), version: 3 };
          store.put('assignments', past);
          store.put('deliveries', { id: id('delivery'), assignmentId: past.id, receivedAt: dateAt(-16-history*14), recordedAt: dateAt(-15-history*14), summary: 'Resultado presentado y revisado en sesión.', url: '', completeness: 'complete', authorId: ownerId });
          const evaluation: Evaluation = { id: id('evaluation'), assignmentId: past.id, studentId: student.id, areaId, evaluatorId: ownerId, evaluatorName: USER_DEFAULTS.find(u=>u.id===ownerId)!.name, createdAt: dateAt(-15-history*14), scores: past.skillIds.map((skillId, skillIndex)=>({ skillId, score: index === 9 && history === 0 && skillIndex === 0 ? 0 : index === 4 && skillIndex === 1 ? null : Math.min(10, Math.round((6.4+((index*7+skillIndex*3)%30)/10+history*.2)*10)/10), comment: skillIndex === 0 ? 'Solución funcional con decisiones justificadas durante la revisión.' : '' })), feedback: 'Buen avance. Fortalecer la documentación de decisiones y agregar casos de prueba.', outcome: 'completed', current: true };
          store.put('evaluations', evaluation);
        }
        store.put('notes', { id: id('note'), studentId: student.id, areaId, authorName: USER_DEFAULTS.find(u=>u.id===ownerId)!.name, text: index === 1 ? 'Acordamos resolver el bloqueo antes de fijar la siguiente revisión.' : 'Muestra iniciativa y buen avance. En la siguiente sesión revisaremos los resultados y la documentación.', createdAt: dateAt(-2-index) });
      });
    }
    store.put('audit', { id: id('audit'), actorName: 'SAG', areaId: null, action: 'demo_initialized', entityId: 'demo', detail: 'Datos ficticios de demostración. Los cambios se guardan únicamente en la base de demostración.', createdAt: now() });
    store.db.prepare("INSERT INTO meta(key,value) VALUES('demo_seeded','1')").run();
  });
  enrichDemo(store);
}

const PHASES = ['Protocolo', 'Marco teórico', 'Desarrollo', 'Redacción'];
/**
 * Datos del plan para la demostración: periodo y horas del alumno, inicio y fase de cada actividad, y revisiones
 * pasadas con horas y acuerdos. Corre una sola vez por base de demostración y solo añade lo que falta.
 */
export function enrichDemo(store: Store) {
  if (store.db.prepare("SELECT value FROM meta WHERE key='demo_plan'").get()) return;
  store.transaction(() => {
    const assignments = store.all<Assignment>('assignments'); const reviews = new Set(store.all<Review>('reviews').map(r => r.id));
    for (const s of store.all<Student>('students')) {
      const n = Number(s.id.replace(/\D/g, '')) || 0;
      const thesis = s.modalities.includes('Tesis'); const service = s.modalities.includes('Servicio social'); const practice = s.modalities.includes('Prácticas');
      const startDate = s.startDate ?? s.createdAt.slice(0, 10);
      const endDate = s.endDate ?? new Date(Date.parse(`${startDate}T12:00:00Z`) + (thesis ? 300 : service ? 180 : 120) * 86_400_000).toISOString().slice(0, 10);
      store.put('students', { ...s, startDate, endDate, hoursRequired: s.hoursRequired ?? (service ? 480 : practice ? 240 : null) });
      assignments.filter(a => a.studentId === s.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .forEach((a, i) => store.put('assignments', { ...a, startAt: a.startAt ?? a.createdAt, phase: a.phase ?? (thesis ? PHASES[Math.min(i, PHASES.length - 1)] : '') }));
      // Un alumno de cada cuatro lleva más de dos semanas sin revisión: así se ve el aviso «sin seguimiento».
      const first = n % 4 === 2 ? 19 : 5;
      for (const areaId of s.areaIds) for (let k = 0; k < 3; k++) {
        const reviewId = `review_${s.id}_${areaId}_past_${k}`; if (reviews.has(reviewId)) continue;
        const latest = k === 0;
        store.put<Review>('reviews', { id: reviewId, studentId: s.id, assignmentId: null, areaId, ownerId: `user_${areaId}`, startsAt: dateAt(-(first + k * 14), 10 + k), durationMinutes: 30, type: 'follow_up', status: 'completed', notes: 'Revisar avances y acordar siguientes pasos.', outcome: 'Revisamos avances y acordamos los siguientes pasos.', version: 2,
          hours: service || practice ? 40 + k * 8 : null,
          agreements: [{ id: `agreement_${reviewId}_1`, text: 'Documentar las decisiones de diseño', done: !latest }, { id: `agreement_${reviewId}_2`, text: 'Preparar una demostración para la siguiente revisión', done: !latest || n % 2 === 0 }] });
      }
    }
    store.db.prepare("INSERT INTO meta(key,value) VALUES('demo_plan','1')").run();
  });
}
