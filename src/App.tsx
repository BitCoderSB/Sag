import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { House, Kanban, Sun, Moon, SquaresFour, UsersThree, ListChecks, ChartBar, GearSix, Sparkle, MagnifyingGlass, Plus, SignOut, CaretUpDown, List, X, WarningCircle, Check, Eye } from '@phosphor-icons/react';
import type { Session, Workspace, Role } from '../shared/types';
import { AREAS } from '../shared/types';
import { api, post, setCsrf, todoCount, scoped } from './lib';
import { AppContext, type ModalState, type Page } from './context';
import { useIndicator } from './motion';
import { Avatar, Brand, Button, CreateMenu, Loading, Toast, Empty, AreaIcon, IconButton, areaName } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Board from './pages/Board';
import Students from './pages/Students';
import Assignments from './pages/Assignments';
import Talent from './pages/Talent';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Forms from './components/Forms';
import StudentDrawer from './components/StudentDrawer';
import AssignmentDrawer from './components/AssignmentDrawer';
import CommandPalette from './components/CommandPalette';
import Ambient from './components/Ambient';
import GanttView from './pages/GanttView';

const PAGES: Page[] = ['today', 'board', 'students', 'assignments', 'talent', 'reports', 'settings', 'gantt'];
const TITLES: Record<Page, string> = { today: 'Hoy', board: 'Tablero', students: 'Alumnos', assignments: 'Actividades', talent: 'Talento', reports: 'Reportes', settings: 'Configuración', gantt: 'Cronograma' };
function readRoute() {
  const raw = location.hash.slice(1);
  const [path, query = ''] = raw.split('?');
  const page: Page = path === 'dashboard' ? 'today' : PAGES.includes(path as Page) ? path as Page : 'today';
  return { page, params: new URLSearchParams(query), key: raw || 'today' };
}

type Theme = 'light' | 'dark';
/** Tema elegido por la persona; sin elección, el del sistema. Se guarda en este navegador. */
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#eef0f4' : '#000000');
  }, [theme]);
  return [theme, t => { try { localStorage.setItem('sag-theme', t); } catch { /* sin almacenamiento: dura la sesión */ } setTheme(t); }];
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null); const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [route, setRoute] = useState(readRoute); const [loadError, setLoadError] = useState('');
  const [mobileNav, setMobileNav] = useState(false); const [modal, setModal] = useState<ModalState>(null);
  const [theme, setTheme] = useTheme();
  const [studentId, setStudentId] = useState<string | null>(null); const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: 'success' | 'error'; leaving?: boolean; id: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set()); const freshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const markFresh = useCallback((ids: string[]) => { if (!ids.length) return; clearTimeout(freshTimer.current); setFresh(new Set(ids)); freshTimer.current = setTimeout(() => setFresh(new Set()), 2600); }, []);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = useCallback(async () => { const data = await api<Workspace>('/workspace'); setWorkspace(data); setLoadError(''); }, []);
  const toast = useCallback((text: string, kind: 'success' | 'error' = 'success') => {
    clearTimeout(toastTimer.current); const id = Date.now(); setMessage({ text, kind, id });
    // Sale más rápido de lo que entra.
    toastTimer.current = setTimeout(() => { setMessage(m => m && m.id === id ? { ...m, leaving: true } : m); toastTimer.current = setTimeout(() => setMessage(m => m && m.id === id ? null : m), 180); }, 5000);
  }, []);
  const login = useCallback((value: Session) => { setCsrf(value.csrf); setSession(value); setWorkspace(null); }, []);
  useEffect(() => { api<Session>('/session').then(login).catch(e => setLoadError(e.message)); return () => clearTimeout(toastTimer.current); }, [login]);
  useEffect(() => {
    if (!session?.user) return;
    let alive = true;
    refresh().catch(e => alive && setLoadError(e.message));
    const interval = setInterval(() => { if (document.visibilityState === 'visible') refresh().catch(() => {}); }, 60000);
    return () => { alive = false; clearInterval(interval); };
  }, [session?.user?.id, refresh]);
  useEffect(() => { const change = () => setRoute(readRoute()); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  // Al pasar a la vista ampliada (o salir de ella) no se arrastran paneles abiertos de la otra vista.
  useEffect(() => { setStudentId(null); setAssignmentId(null); }, [route.page === 'gantt']);
  useEffect(() => {
    const expired = () => { if (session?.user) { login({ user: null, csrf: null, demo: session.demo }); setModal(null); setStudentId(null); setAssignmentId(null); toast('Tu sesión terminó. Inicia sesión de nuevo.', 'error'); } };
    window.addEventListener('sag:session-expired', expired); return () => window.removeEventListener('sag:session-expired', expired);
  }, [session, login, toast]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && session?.user) { e.preventDefault(); setSearchOpen(v => !v); } };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [session?.user]);
  const readonly = session?.user?.role === 'director';
  const pageTitle = route.page === 'today' && readonly ? 'Panorama' : TITLES[route.page];
  const navMarker = useIndicator<HTMLElement>([route.page, !!session?.user, !!workspace]);
  useEffect(() => { document.title = `${pageTitle} · SAG`; }, [pageTitle]);

  function navigate(page: Page, params?: Record<string, string>) {
    const query = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
    location.hash = `${page}${query}`;
    setRoute(readRoute()); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function openStudent(id: string) { setAssignmentId(null); setStudentId(id); setSearchOpen(false); }
  function openAssignment(id: string) { setStudentId(null); setAssignmentId(id); setSearchOpen(false); }
  async function logout() { try { await post('/auth/logout', {}); login({ user: null, csrf: null, demo: !!session?.demo }); } catch (e) { toast((e as Error).message, 'error'); } }
  async function switchRole(role: Role) { try { const next = await post<Session>('/auth/demo', { role }); setStudentId(null); setAssignmentId(null); setModal(null); login(next); navigate('today'); } catch (e) { toast((e as Error).message, 'error'); } }

  if (!session) return <div className="boot"><Brand />{loadError ? <><p className="form-error">{loadError}</p><Button onClick={() => location.reload()}>Reintentar</Button></> : <Loading />}</div>;
  if (!session.user) return <><Login demo={session.demo} onLogin={login} />{message && <Toast key={message.id} message={message.text} kind={message.kind} leaving={message.leaving} />}</>;

  const user = session.user;
  const mine = workspace ? scoped(workspace) : null;
  const taskCount = mine && !readonly ? todoCount(mine) : 0;
  const nav: { id: Page; label: string; icon: typeof House; count?: number; urgent?: boolean }[] = [
    { id: 'today', label: readonly ? 'Panorama' : 'Hoy', icon: readonly ? SquaresFour : House, count: taskCount || undefined, urgent: true },
    { id: 'board', label: 'Tablero', icon: Kanban },
    { id: 'students', label: 'Alumnos', icon: UsersThree },
    { id: 'assignments', label: 'Actividades', icon: ListChecks },
    { id: 'talent', label: 'Talento', icon: Sparkle },
    { id: 'reports', label: 'Reportes', icon: ChartBar },
  ];
  // Vista ampliada del Gantt: pantalla completa, sin barra lateral (se abre en otra pestaña con «Expandir»).
  if (route.page === 'gantt') return <div className="gantt-screen">
    {workspace ? <AppContext.Provider value={{ workspace, refresh, toast, navigate, params: route.params, openStudent, openAssignment, modal: setModal, readonly, demo: session.demo, fresh, markFresh }}>
      <main id="main" className="gantt-screen-main"><GanttView key={route.key} /></main>
      {studentId && <StudentDrawer id={studentId} onClose={() => setStudentId(null)} />}
      {assignmentId && <AssignmentDrawer id={assignmentId} onClose={() => setAssignmentId(null)} />}
      {modal && <Forms state={modal} onClose={() => setModal(null)} />}
    </AppContext.Provider> : loadError ? <Empty icon={<WarningCircle size={22} />} title="No pudimos cargar tus datos" description={loadError} /> : <Loading />}
    {message && <Toast key={message.id} message={message.text} kind={message.kind} leaving={message.leaving} />}
  </div>;
  const roleLabel = readonly ? 'Jefe · solo lectura' : `Responsable de ${areaName(user.areaId!)}`;

  return <div className="shell">
    <Ambient />
    <a href="#main" className="skip-link" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Saltar al contenido</a>
    {mobileNav && <button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`} aria-label="Barra lateral">
      <div className="sidebar-top">
        <Brand />
        <IconButton className="sidebar-close" label="Cerrar menú" onClick={() => setMobileNav(false)}><X size={18} /></IconButton>
      </div>
      <button type="button" className="sidebar-search" onClick={() => { setMobileNav(false); setSearchOpen(true); }}>
        <MagnifyingGlass size={16} aria-hidden="true" /><span>Buscar</span><kbd>Ctrl K</kbd>
      </button>
      {!readonly && <CreateMenu block className="sidebar-cta" onPick={kind => { setMobileNav(false); setModal({ type: kind }); }} />}
      <nav className="nav" aria-label="Navegación principal" ref={navMarker.container}>
        <span ref={navMarker.indicator} className="nav-thumb" aria-hidden="true" />
        {nav.map(item => { const current = route.page === item.id; return <button type="button" key={item.id} className="nav-item" aria-current={current ? 'page' : undefined} onClick={() => navigate(item.id)}>
          <item.icon size={18} weight={current ? 'fill' : 'regular'} aria-hidden="true" />
          <span>{item.label}</span>
          {item.count !== undefined && <span key={item.count} className={`nav-count ${item.urgent ? 'nav-count-urgent' : ''}`} aria-label={item.urgent ? `${item.count} pendientes` : `${item.count} hoy`}>{item.count}</span>}
        </button>; })}
      </nav>
      <div className="sidebar-bottom">
        {session.demo && <p className="demo-flag">Datos de ejemplo</p>}
        <div className="theme-switch" role="radiogroup" aria-label="Tema">
          <button type="button" role="radio" aria-checked={theme === 'light'} onClick={() => setTheme('light')}><Sun size={15} weight={theme === 'light' ? 'fill' : 'regular'} aria-hidden="true" />Claro</button>
          <button type="button" role="radio" aria-checked={theme === 'dark'} onClick={() => setTheme('dark')}><Moon size={15} weight={theme === 'dark' ? 'fill' : 'regular'} aria-hidden="true" />Oscuro</button>
        </div>
        <Dropdown.Root modal={false}>
          <Dropdown.Trigger asChild>
            <button type="button" className="account" aria-label={`Cuenta: ${user.name}`}>
              <Avatar name={user.name} />
              <span className="account-text"><strong>{user.name}</strong><small>{readonly ? <><Eye size={12} aria-hidden="true" />Solo lectura</> : <><AreaIcon id={user.areaId!} size={12} />{areaName(user.areaId!)}</>}</small></span>
              <CaretUpDown size={14} aria-hidden="true" />
            </button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content className="menu account-menu" side="top" align="start" sideOffset={8}>
              <div className="menu-header"><strong>{user.name}</strong><span>{user.email}</span><span>{roleLabel}</span></div>
              <Dropdown.Separator className="menu-separator" />
              <Dropdown.Item className="menu-item" onSelect={() => navigate('settings')}><GearSix size={16} />Configuración</Dropdown.Item>
              <Dropdown.Item className="menu-item" onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}{theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}</Dropdown.Item>
              {session.demo && <>
                <Dropdown.Separator className="menu-separator" />
                <Dropdown.Label className="menu-label">Ver la demostración como</Dropdown.Label>
                {[...AREAS.map(a => ({ role: a.id as Role, label: `Responsable de ${a.name}` })), { role: 'director' as Role, label: 'Jefe (solo lectura)' }].map(item => <Dropdown.Item key={item.role} className="menu-item" onSelect={() => switchRole(item.role)}><span className="menu-check">{user.role === item.role && <Check size={14} weight="bold" />}</span>{item.label}</Dropdown.Item>)}
              </>}
              <Dropdown.Separator className="menu-separator" />
              <Dropdown.Item className="menu-item" onSelect={logout}><SignOut size={16} />Cerrar sesión</Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
    </aside>
    <div className="workspace">
      <header className="mobile-bar">
        <IconButton label="Abrir menú" onClick={() => setMobileNav(true)}><List size={20} /></IconButton>
        <strong>{pageTitle}</strong>
        <IconButton label="Buscar" onClick={() => setSearchOpen(true)}><MagnifyingGlass size={19} /></IconButton>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {workspace ? <AppContext.Provider value={{ workspace, refresh, toast, navigate, params: route.params, openStudent, openAssignment, modal: setModal, readonly, demo: session.demo, fresh, markFresh }}>
          <div key={route.key} className="page">
            {route.page === 'today' && <Dashboard />}
            {route.page === 'board' && <Board />}
            {route.page === 'students' && <Students />}
            {route.page === 'assignments' && <Assignments />}
            {route.page === 'talent' && <Talent />}
            {route.page === 'reports' && <Reports />}
            {route.page === 'settings' && <Settings />}
          </div>
          {studentId && <StudentDrawer id={studentId} onClose={() => setStudentId(null)} />}
          {assignmentId && <AssignmentDrawer id={assignmentId} onClose={() => setAssignmentId(null)} />}
          {modal && <Forms state={modal} onClose={() => setModal(null)} />}
          {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
        </AppContext.Provider>
          : loadError ? <Empty icon={<WarningCircle size={22} />} title="No pudimos cargar tus datos" description={loadError} action={<Button onClick={() => refresh().catch(e => setLoadError(e.message))}>Reintentar</Button>} />
          : <div className="page"><Loading /></div>}
      </main>
    </div>
    {message && <Toast key={message.id} message={message.text} kind={message.kind} leaving={message.leaving} />}
  </div>;
}
