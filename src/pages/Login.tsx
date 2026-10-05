import { useState, type FormEvent } from 'react';
import { Eye, EyeSlash, ShieldCheck } from '@phosphor-icons/react';
import { AREAS, type Session, type Role } from '../../shared/types';
import { post } from '../lib';
import { AreaIcon, Brand, Button, ErrorMessage, Field } from '../components/ui';

export default function Login({ demo, onLogin }: { demo: boolean; onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false); const [pending, setPending] = useState<string | null>(null); const [error, setError] = useState('');
  async function login(event: FormEvent) { event.preventDefault(); setPending('login'); setError(''); try { onLogin(await post<Session>('/auth/login', { email, password })); } catch (e) { setError((e as Error).message); } finally { setPending(null); } }
  async function openDemo(role: Role) { setPending(role); setError(''); try { onLogin(await post<Session>('/auth/demo', { role })); } catch (e) { setError((e as Error).message); } finally { setPending(null); } }
  return <main className="login">
    <div className="login-box">
      <Brand />
      <h1>Inicia sesión</h1>
      <p className="login-lead">Seguimiento de alumnos del laboratorio.</p>
      <form onSubmit={login} className="login-form">
        <Field label="Correo electrónico"><input autoComplete="username" type="email" required value={email} onChange={e => setEmail(e.target.value)} maxLength={200} /></Field>
        <Field label="Contraseña"><span className="password-field"><input type={visible ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} maxLength={200} /><button aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} type="button" onClick={() => setVisible(!visible)}>{visible ? <EyeSlash size={18} /> : <Eye size={18} />}</button></span></Field>
        <ErrorMessage message={error} />
        <Button type="submit" className="login-submit" loading={pending === 'login'} disabled={!!pending}>Entrar</Button>
      </form>
      {demo && <section className="login-demo" aria-labelledby="demo-title">
        <h2 id="demo-title">Demostración con datos ficticios</h2>
        <div className="login-demo-grid">
          {AREAS.map(area => <button type="button" key={area.id} disabled={!!pending} onClick={() => openDemo(area.id)}><span className={`area-mark area-${area.id}`}><AreaIcon id={area.id} size={14} /></span>Responsable de {area.name}</button>)}
          <button type="button" disabled={!!pending} onClick={() => openDemo('director')}><span className="area-mark"><ShieldCheck size={14} weight="bold" /></span>Jefe (solo lectura)</button>
        </div>
      </section>}
      <p className="login-foot">Acceso solo para los responsables del laboratorio. Los alumnos no tienen cuenta.</p>
    </div>
  </main>;
}
