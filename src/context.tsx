import { createContext, useContext } from 'react';
import type { AreaId } from '../shared/types';
import type { Student, Workspace, Assignment, Review, Meeting } from '../shared/types';

export type Page = 'today' | 'agenda' | 'students' | 'assignments' | 'talent' | 'reports' | 'settings';
export type ModalState =
  | { type: 'student'; student?: Student }
  | { type: 'assignment'; studentId?: string }
  | { type: 'assignmentEdit'; assignment: Assignment; mode: 'edit' | 'cancel' }
  | { type: 'review'; studentId?: string; assignmentId?: string; date?: string }
  | { type: 'reviewUpdate'; review: Review; mode: 'record' | 'reschedule' | 'cancel' }
  | { type: 'evaluate'; assignment: Assignment }
  | { type: 'delivery'; assignment: Assignment }
  | { type: 'progress'; studentId?: string; assignment?: Assignment }
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
