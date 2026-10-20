import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Key, Plus, WarningCircle } from '@phosphor-icons/react';
import { useApp } from '../context';
import { api, del, formatDate, post } from '../lib';
import { AreaTag, Badge, Button, ErrorMessage, Field, Modal, PageHeader, SectionTitle, Segmented, areaName } from '../components/ui';

const LEVELS = [
  { range: '0 a 2', label: 'Inicial', text: 'Necesita acompañamiento continuo.' },
  { range: '3 a 5', label: 'En desarrollo', text: 'Resuelve partes con apoyo.' },
  { range: '6 a 8', label: 'Competente', text: 'Resuelve con autonomía creciente.' },
  { range: '9 a 10', label: 'Avanzado', text: 'Resuelve, justifica y mejora.' },
];

export default function Settings() {
  const app = useApp(); const w = app.workspace;
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  async function addSkill(e: FormEvent) {
    e.preventDefault(); setPending(true); setError('');
    try { await post('/skills', { name: name.trim(), description: description.trim() }); await app.refresh(); app.toast('Habilidad agregada.'); setOpen(false); setName(''); setDescription(''); }
    catch (e) { setError((e as Error).message); } finally { setPending(false); }
  }
  const skills = [...w.skills].sort((a, b) => Number(!!b.areaId && b.areaId === w.user.areaId) - Number(!!a.areaId && a.areaId === w.user.areaId) || a.name.localeCompare(b.name));
  return <>
    <PageHeader title="Configuración" subtitle={app.readonly ? 'Solo lectura: consultas las tres áreas sin modificar registros.' : `Responsable de ${areaName(w.user.areaId!)}.`} />
    <ClaudeCode />
    <section className="settings-section" aria-labelledby="settings-skills">
      <SectionTitle id="settings-skills" title="Habilidades" count={w.skills.length}>{!app.readonly && <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><Plus size={14} weight="bold" />Agregar habilidad</Button>}</SectionTitle>
      <p className="settings-note">Son las que eliges al asignar una actividad y las que calificas al evaluarla.</p>
      <div className="panel table-panel"><div className="table-scroll"><table className="table">
        <thead><tr><th>Habilidad</th><th>Qué se observa</th><th>Área</th></tr></thead>
        <tbody>{skills.map(skill => <tr key={skill.id}>
          <td><strong>{skill.name}</strong></td>
          <td className="cell-wrap muted">{skill.description || 'Sin criterio descrito.'}</td>
          <td>{skill.areaId ? <AreaTag id={skill.areaId} /> : <Badge>Todas</Badge>}</td>
        </tr>)}</tbody>
      </table></div></div>
    </section>
    <section className="settings-section" aria-labelledby="settings-scale">
      <SectionTitle id="settings-scale" title="Escala de evaluación" />
      <p className="settings-note">De 0 a 10. Deja vacía una habilidad que no pudiste observar: <strong>sin evaluar</strong> no es lo mismo que cero.</p>
      <ol className="scale">{LEVELS.map(level => <li key={level.label}><strong>{level.range}</strong><span>{level.label}</span><small>{level.text}</small></li>)}</ol>
    </section>
    {open && <Modal title="Agregar habilidad" description="Quedará disponible para las actividades de tu área." onClose={() => !pending && setOpen(false)}>
      <form onSubmit={addSkill}>
        <div className="dialog-body">
          <ErrorMessage message={error} />
          <Field label="Nombre" required><input autoFocus value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} placeholder="Ej. Diseño de bases de datos" /></Field>
          <Field label="Qué debe demostrar el alumno" required><textarea value={description} onChange={e => setDescription(e.target.value)} required maxLength={500} rows={3} /></Field>
        </div>
        <div className="dialog-foot"><Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button><Button type="submit" loading={pending}>Agregar habilidad</Button></div>
      </form>
    </Modal>}
  </>;
}

interface KeyRecord { id: string; label: string; createdAt: string; lastUsedAt: string | null }
const SUGGESTIONS = ['Dame un resumen de las actividades de Ana esta semana', 'Registra que Luis entregó el prototipo (avance 60 %) y sube este PDF como evidencia', 'Programa una revisión con Marina en el primer horario libre de mañana', 'Haz un diagrama de Gantt en Mermaid con las actividades abiertas'];
/** Conectar Claude Code con SAG: una llave personal y un comando para copiar. La llave se muestra una sola vez. */
function ClaudeCode() {
  const app = useApp();
  const [keys, setKeys] = useState<KeyRecord[] | null>(null); const [fresh, setFresh] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [copied, setCopied] = useState(false); const [os, setOs] = useState<'win' | 'mac' | 'app'>(() => /Mac/i.test(navigator.platform) ? 'mac' : 'win');
  useEffect(() => { api<{ tokens: KeyRecord[] }>('/tokens').then(r => setKeys(r.tokens)).catch(e => setError((e as Error).message)); }, []);
  const command = `claude mcp add --transport http --scope user sag ${location.origin}/mcp --header "Authorization: Bearer ${fresh || 'TU_LLAVE'}"`;
  async function create() {
    setBusy(true); setError('');
    try { const r = await post<{ token: string; record: KeyRecord }>('/tokens', { label: 'Claude Code' }); setFresh(r.token); setKeys(k => [...(k ?? []), r.record]); setCopied(false); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function revoke(k: KeyRecord) {
    setBusy(true); setError('');
    try { await del(`/tokens/${k.id}`); setKeys(list => (list ?? []).filter(x => x.id !== k.id)); app.toast('Llave revocada: ya no da acceso.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(command); setCopied(true); } catch { setError('No pude copiar; selecciona el comando y cópialo.'); } }
  return <section className="settings-section" aria-labelledby="settings-claude">
    <SectionTitle id="settings-claude" title="Claude Code">{<Button size="sm" onClick={create} loading={busy}><Key size={14} weight="bold" />Crear llave y conectar</Button>}</SectionTitle>
    <p className="settings-note">Conecta Claude Code con SAG para pedirle cosas en lenguaje natural: {app.readonly ? 'resúmenes, listas y diagramas de todas las áreas, y agendar reuniones' : 'registrar avances, asignar actividades, subir documentos, programar revisiones, resúmenes y diagramas'}. Usa tus mismos permisos.</p>
    <ErrorMessage message={error} />
    {fresh && <ol className="mcp-steps">
      <li>
        <span className="mcp-step-n" aria-hidden="true">1</span>
        <div>
          <h4>Abre la terminal de tu computadora</h4>
          <p>No es el navegador: es el programa de comandos donde funciona Claude Code.</p>
          <Segmented label="Tu sistema" value={os} onChange={setOs} options={[{ value: 'win', label: 'Windows' }, { value: 'mac', label: 'Mac' }, { value: 'app', label: 'App de Claude' }]} />
          {os === 'win' && <p className="mcp-how">Presiona la tecla <kbd>Windows</kbd>, escribe <strong>PowerShell</strong> y presiona <kbd>Enter</kbd>.</p>}
          {os === 'mac' && <p className="mcp-how">Presiona <kbd>⌘ Cmd</kbd> + <kbd>Espacio</kbd>, escribe <strong>Terminal</strong> y presiona <kbd>Enter</kbd>.</p>}
          {os === 'app' && <p className="mcp-how">En la app de escritorio de Claude, abre la pestaña <strong>Code</strong> y pídele: «ejecuta este comando», pegando el del paso 2.</p>}
        </div>
      </li>
      <li>
        <span className="mcp-step-n" aria-hidden="true">2</span>
        <div>
          <h4>Pega este comando y presiona <kbd>Enter</kbd> <span className="muted">· solo una vez</span></h4>
          <div className="mcp-command"><code>{command}</code><Button size="sm" variant={copied ? 'secondary' : 'primary'} onClick={copy}>{copied ? <><Check size={14} weight="bold" />Copiado</> : <><Copy size={14} />Copiar</>}</Button></div>
          <p className="mcp-how">{os === 'win' ? <>En PowerShell se pega con <strong>clic derecho</strong> o <kbd>Ctrl</kbd> + <kbd>V</kbd>.</> : os === 'mac' ? <>Se pega con <kbd>⌘ Cmd</kbd> + <kbd>V</kbd>.</> : 'Claude lo ejecutará por ti.'} Verás <code className="mcp-inline">Added HTTP MCP server sag</code>.</p>
          <p className="mcp-warn"><WarningCircle size={15} weight="fill" aria-hidden="true" />El comando incluye tu llave personal: no lo compartas ni lo mandes en capturas. Si se filtra, revócala abajo y crea otra.</p>
        </div>
      </li>
      <li>
        <span className="mcp-step-n" aria-hidden="true">3</span>
        <div>
          <h4>Abre Claude Code y pídele lo que necesites</h4>
          <p>Escribe <code className="mcp-inline">claude</code> en la terminal (o usa la pestaña Code de la app). Para comprobar la conexión escribe <code className="mcp-inline">/mcp</code>: debe aparecer <strong>sag</strong> como conectado.</p>
          <ul className="mcp-examples">{SUGGESTIONS.map(t => <li key={t}>«{t}»</li>)}</ul>
          <p className="mcp-how">¿No tienes Claude Code? Instálalo desde <a className="text-link" href="https://claude.com/claude-code" target="_blank" rel="noopener noreferrer">claude.com/claude-code</a> y vuelve a este paso.</p>
        </div>
      </li>
    </ol>}
    {keys && keys.length > 0 && <ul className="mcp-keys">{keys.map(k => <li key={k.id}>
      <Key size={16} aria-hidden="true" /><span><strong>{k.label}</strong><small>Creada {formatDate(k.createdAt, { year: 'numeric' })} · {k.lastUsedAt ? `último uso ${formatDate(k.lastUsedAt)}` : 'sin usar todavía'}</small></span>
      <Button size="sm" variant="ghost" onClick={() => revoke(k)} disabled={busy}>Revocar</Button>
    </li>)}</ul>}
  </section>;
}
