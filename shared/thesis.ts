/**
 * Flujo de tesis del área de Investigación (el del responsable, puntos 1–28).
 * Cada fase sigue el mismo ciclo: el tesista trabaja → el responsable revisa y propone cambios →
 * llamada con el tesista. En la llamada se decide: pasar a la siguiente fase, seguir en la misma
 * (corregir) o, solo en desarrollo matemático, regresar a diseño y simulaciones.
 */
export type ThesisPhase = 'preproposal' | 'proposal' | 'theory' | 'design' | 'math' | 'prototype' | 'testing' | 'slides' | 'corrections' | 'defense';
/** kickoff: llamada inicial (intereses e idea) · working: el tesista trabaja · review: te toca revisar · call: llamada para decidir. */
export type ThesisStep = 'kickoff' | 'working' | 'review' | 'call' | 'done';
export type ThesisAction = 'kickoff' | 'submitted' | 'reviewed' | 'advance' | 'stay' | 'back' | 'defended' | 'moved';

export interface ThesisEvent { id: string; at: string; phase: ThesisPhase; action: ThesisAction; to?: ThesisPhase; note: string; actorName: string }
export interface Thesis {
  phase: ThesisPhase; step: ThesisStep;
  /** Tema general y título tentativo. */
  topic: string;
  /** Tiempo estimado de entrega en meses (6, 12, 18…). */
  estimateMonths: number | null;
  proposalUrl: string; driveUrl: string;
  /** Disponibilidad para llamadas (texto libre: «lunes 3:30 p. m.»). */
  callAvailability: string;
  startedAt: string; phaseSince: string; defendedAt: string | null;
  history: ThesisEvent[];
  /** Cronograma planeado (de la plantilla «Cronograma» del tesista). Sin él, el Gantt reparte las fases restantes. */
  plan?: ThesisPlanItem[];
}
/** Una fila del cronograma (fechas AAAA-MM-DD). `phase` es null en tareas que corren en paralelo, como la redacción. */
export interface ThesisPlanItem { label: string; start: string; end: string; phase: ThesisPhase | null }

export type ThesisDocKind = 'preproposal' | 'proposal' | 'delimitation' | 'schedule' | 'draft' | 'other';
/** Documento del expediente de tesis (pre-propuesta, propuesta, cronograma, borradores). */
export interface ThesisDocument { id: string; studentId: string; name: string; size: number; kind: ThesisDocKind; createdAt: string; uploadedBy: string }
export const DOC_KIND_LABEL: Record<ThesisDocKind, string> = { preproposal: 'Pre-propuesta', proposal: 'Propuesta', delimitation: 'Delimitación', schedule: 'Cronograma', draft: 'Borrador de tesis', other: 'Otro documento' };
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Tipo probable de un documento por su nombre de archivo. */
export function guessDocKind(name: string): ThesisDocKind {
  const n = plain(name);
  if (/cronograma/.test(n)) return 'schedule';
  if (/pre-?propuesta/.test(n)) return 'preproposal';
  if (/delimitaci/.test(n)) return 'delimitation';
  if (/propuesta/.test(n)) return 'proposal';
  if (/tesis/.test(n)) return 'draft';
  return 'other';
}
/** Fase del flujo que corresponde a una fila del cronograma (por su nombre). */
export function planPhase(label: string): ThesisPhase | null {
  const n = plain(label);
  const rules: [RegExp, ThesisPhase | null][] = [[/redaccion|documentacion/, null], [/eleccion de tema|pre-?propuesta|delimitacion/, 'preproposal'], [/propuesta/, 'proposal'], [/bibliograf|marco teorico/, 'theory'],
    [/matematic/, 'math'], [/componentes|diseno|simulacion/, 'design'], [/implementacion|prototip/, 'prototype'], [/prueba|validacion/, 'testing'], [/diapositiva|presentacion/, 'slides'], [/correccion/, 'corrections'], [/defensa/, 'defense']];
  for (const [re, phase] of rules) if (re.test(n)) return phase;
  return null;
}

export interface PhaseInfo {
  id: ThesisPhase; n: number; label: string; short: string;
  /** Qué hace el tesista en esta fase. */
  work: string;
  /** Qué revisa el responsable. */
  review: string;
  /** A dónde se regresa si en la llamada hay inconsistencias que no son de esta fase. */
  backTo?: ThesisPhase;
  /** Puntos del flujo original (para que el responsable lo reconozca). */
  points: string;
}
export const THESIS_PHASES: PhaseInfo[] = [
  { id: 'preproposal', n: 1, label: 'Pre-propuesta', short: 'Pre-propuesta', work: 'Investiga temas relevantes y redacta la pre-propuesta.', review: 'Revisa la investigación de temas y la pre-propuesta.', points: '1–4' },
  { id: 'proposal', n: 2, label: 'Propuesta de tesis', short: 'Propuesta', work: 'Trabaja el documento de propuesta (incluye el cronograma de la plantilla).', review: 'Revisa el documento de propuesta y propone cambios.', points: '5–7' },
  { id: 'theory', n: 3, label: 'Marco teórico y redacción', short: 'Marco teórico', work: 'Revisión bibliográfica, marco teórico e inicio de la redacción.', review: 'Revisa el marco teórico y la redacción.', points: '8–10' },
  { id: 'design', n: 4, label: 'Análisis, diseño y simulaciones', short: 'Diseño', work: 'Analiza los componentes necesarios y trabaja diseño y simulaciones.', review: 'Revisa tablas comparativas, justificación de cada elemento, diseño y simulaciones.', points: '11–13' },
  { id: 'math', n: 5, label: 'Desarrollo matemático', short: 'Matemático', work: 'Investiga herramientas, técnicas o modelos matemáticos y desarrolla el modelo.', review: 'Revisa el desarrollo matemático.', backTo: 'design', points: '14–16' },
  { id: 'prototype', n: 6, label: 'Implementación y prototipo', short: 'Prototipo', work: 'Implementa y construye el prototipo.', review: 'Revisa la implementación y los prototipos.', points: '17–19' },
  { id: 'testing', n: 7, label: 'Pruebas y validación experimental', short: 'Pruebas', work: 'Realiza pruebas y validación experimental.', review: 'Revisa las pruebas y validaciones.', points: '20–22' },
  { id: 'slides', n: 8, label: 'Diapositivas para el jurado', short: 'Diapositivas', work: 'Prepara las diapositivas para presentar ante el jurado.', review: 'Revisa las diapositivas.', points: '23–25' },
  { id: 'corrections', n: 9, label: 'Correcciones finales', short: 'Correcciones', work: 'Aplica las correcciones finales.', review: 'Revisa las correcciones.', points: '26–28' },
  { id: 'defense', n: 10, label: 'Defensa de tesis', short: 'Defensa', work: 'Lista para defender ante el jurado.', review: '', points: '28' },
];
export const phaseInfo = (p: ThesisPhase) => THESIS_PHASES.find(x => x.id === p)!;
export const nextPhase = (p: ThesisPhase): ThesisPhase | null => THESIS_PHASES[THESIS_PHASES.findIndex(x => x.id === p) + 1]?.id ?? null;

export const STEP_LABEL: Record<ThesisStep, string> = { kickoff: 'Llamada inicial', working: 'Tesista trabajando', review: 'Te toca revisar', call: 'Llamada pendiente', done: 'Tesis defendida' };

/** Transiciones válidas. El servidor las aplica igual que la interfaz: nadie salta pasos por accidente. */
export function applyThesisAction(t: Thesis, action: ThesisAction, at: string, to?: ThesisPhase): { phase: ThesisPhase; step: ThesisStep } | string {
  const info = phaseInfo(t.phase);
  switch (action) {
    case 'kickoff': return t.step === 'kickoff' ? { phase: t.phase, step: 'working' } : 'La llamada inicial ya se registró.';
    case 'submitted': return t.step === 'working' ? { phase: t.phase, step: 'review' } : 'Solo se registra una entrega cuando el tesista está trabajando.';
    case 'reviewed': return t.step === 'review' ? { phase: t.phase, step: 'call' } : 'Primero registra que entregó.';
    case 'advance': {
      if (t.step !== 'call') return 'La fase se aprueba en la llamada.';
      const n = nextPhase(t.phase); if (!n) return 'Ya está en la última fase.';
      return { phase: n, step: 'working' };
    }
    case 'stay': return t.step === 'call' ? { phase: t.phase, step: 'working' } : 'Las correcciones se deciden en la llamada.';
    case 'back': return t.step === 'call' && info.backTo ? { phase: info.backTo, step: 'working' } : 'Esta fase no regresa a otra.';
    case 'defended': return t.phase === 'defense' && t.step !== 'done' ? { phase: 'defense', step: 'done' } : 'La defensa se registra en la fase de defensa.';
    case 'moved': return to ? { phase: to, step: 'working' } : 'Indica la fase.';
  }
  void at;
}
