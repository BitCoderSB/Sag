import { createContext, useContext } from 'react';
import type { AreaId, PauseKind } from '../shared/types';
import type { ActivityDraft, Student, Workspace, Assignment, Review, Meeting } from '../shared/types';

export type Page = 'today' | 'board' | 'students' | 'assignments' | 'talent' | 'reports' | 'settings';
export type ModalState =
  | { type: 'student'; student?: Student }
  | { type: 'assignment'; studentId?: string; dueDate?: string; draft?: ActivityDraft }
  | { type: 'draft'; draft?: ActivityDraft; remove?: boolean }
  | { type: 'assignmentEdit'; assignment: Assignment; mode: 'edit' | 'cancel'; dueDate?: string }
  | { type: 'review'; studentId?: string; assignmentId?: string; date?: string }
  | { type: 'reviewUpdate'; review: Review; mode: 'record' | 'reschedule' | 'cancel'; date?: string; early?: boolean }
  | { type: 'evaluate'; assignment: Assignment }
  | { type: 'block'; assignment: Assignment; mode: 'mark' | 'wait' | 'resolve' }
  | { type: 'pause'; student: Student; kind?: PauseKind }
  | { type: 'resume'; student: Student }
  | { type: 'thesis'; student: Student }
  | { type: 'thesisStep'; student: Student; action: import('../shared/thesis').ThesisAction }
  | { type: 'delivery'; assignment: Assignment; kind?: 'partial' | 'complete' }
  | { type: 'progress'; studentId?: string; assignment?: Assignment; kind?: 'partial' | 'complete' }
  | { type: 'certificate'; studentId: string }
  | { type: 'meeting'; meeting?: Meeting; date?: string; areaIds?: AreaId[]; cancel?: boolean }
  | null;
export interface AppContextType {
  workspace: Workspace; refresh: () => Promise<void>; toast: (message: string, kind?: 'success' | 'error') => void;
  navigate: (page: Page, params?: Record<string, string>) => void; params: URLSearchParams;
  openStudent: (id: string) => void; openAssignment: (id: string) => void;
  modal: (state: ModalState) => void; readonly: boolean; demo: boolean;
  /** Registros recién creados o modificados: se iluminan un momento donde aparecen. */
  fresh: Set<string>; markFresh: (ids: string[]) => void;
}
export const AppContext = createContext<AppContextType | null>(null);
export function useApp() { const app = useContext(AppContext); if (!app) throw new Error('Missing SAG context'); return app; }
