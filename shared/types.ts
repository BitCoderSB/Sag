import type { AnimalId } from './avatars.js';

export type AreaId = 'software' | 'hardware' | 'research';
export type Role = AreaId | 'director';
export interface Area { id: AreaId; name: string; description: string }
export interface User { id: string; name: string; email: string; role: Role; areaId: AreaId | null }
export interface Session { user: User | null; csrf: string | null; demo: boolean }
export type StudentStatus = 'active' | 'paused' | 'completed';
export interface Student {
  id: string; name: string; registration: string; email: string; career: string;
  semester: string; modalities: string[]; status: StudentStatus; areaIds: AreaId[];
  technologies: string[]; createdAt: string; version: number; openAssignmentCount?: number;
  /** Animal del avatar (ver `shared/avatars.ts`). El servidor lo asigna al crear y rellena los expedientes anteriores. */
  avatar?: AnimalId;
  /** Periodo de participación (AAAA-MM-DD). Opcional: sin él, el plan usa la primera y la última actividad. */
  startDate?: string | null; endDate?: string | null;
  /** Horas que exige su modalidad (servicio social, prácticas). Opcional. */
  hoursRequired?: number | null;
}
export interface Skill { id: string; name: string; areaId: AreaId | null; description: string }
export type AssignmentStatus = 'in_progress' | 'pending_review' | 'changes_requested' | 'completed' | 'cancelled';
export interface ResourceLink { label: string; url: string }
export interface Assignment {
  id: string; studentId: string; areaId: AreaId; ownerId: string; title: string;
  description: string; project: string; dueAt: string | null; status: AssignmentStatus;
  priority: 'normal' | 'high'; blockedReason: string; skillIds: string[];
  links: ResourceLink[]; createdAt: string; updatedAt: string; version: number;
  /** Cuándo empieza a trabajarla (para el plan). Sin él, se usa la fecha de asignación. */
  startAt?: string | null;
  /** Fase o etapa del plan (p. ej. «Marco teórico» en una tesis). Vacía si no aplica. */
  phase?: string;
}
export interface Review {
  id: string; studentId: string; assignmentId: string | null; areaId: AreaId;
  ownerId: string; startsAt: string; durationMinutes: number;
  type: 'follow_up' | 'delivery' | 'evaluation';
  status: 'scheduled' | 'completed' | 'cancelled' | 'missed';
  notes: string; outcome: string; version: number;
  /** Horas trabajadas que se reconocen en esta revisión. */
  hours?: number | null;
  /** Acuerdos de la revisión; los pendientes se muestran en la siguiente. */
  agreements?: Agreement[];
}
export interface Agreement { id: string; text: string; done: boolean }
export interface Delivery {
  id: string; assignmentId: string; receivedAt: string; recordedAt: string;
  summary: string; url: string; completeness: 'partial' | 'complete' | 'not_submitted'; authorId: string;
  hours?: number | null;
  /** Avance estimado de 0 a 100 al registrar un avance parcial. */
  progress?: number | null;
}
export interface Evaluation {
  id: string; assignmentId: string; studentId: string; areaId: AreaId;
  evaluatorId: string; evaluatorName: string; createdAt: string;
  scores: { skillId: string; score: number | null; comment: string }[];
  feedback: string; outcome: 'completed' | 'changes_requested'; current: boolean;
}
/** Reunión que el jefe agenda con uno o varios responsables (identificados por su área). */
export interface Meeting {
  id: string; title: string; startsAt: string; durationMinutes: number; areaIds: AreaId[];
  place: string; notes: string; status: 'scheduled' | 'cancelled'; organizerName: string;
  createdAt: string; updatedAt: string; version: number;
}
export interface StudentNote { id: string; studentId: string; areaId: AreaId; authorName: string; text: string; createdAt: string }
export interface Attachment { id: string; assignmentId: string; name: string; size: number; kind: 'instruction' | 'evidence'; createdAt: string }
export interface AuditEvent { id: string; actorName: string; areaId: AreaId | null; action: string; entityId: string; detail: string; createdAt: string }
export interface Workspace {
  user: User; areas: Area[]; students: Student[]; assignments: Assignment[];
  reviews: Review[]; skills: Skill[]; deliveries: Delivery[]; evaluations: Evaluation[];
  notes: StudentNote[]; attachments: Attachment[]; audit: AuditEvent[];
  meetings: Meeting[];
}
export const AREAS: Area[] = [
  { id: 'software', name: 'Software', description: 'Desarrollo y experiencias digitales' },
  { id: 'hardware', name: 'Hardware', description: 'Electrónica y sistemas embebidos' },
  { id: 'research', name: 'Investigación', description: 'Ideas que se convierten en conocimiento' },
];
