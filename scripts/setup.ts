import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { openStore, hashPassword } from '../server/db.js';
import { USER_DEFAULTS, seedSkills } from '../server/seed.js';

if (process.env.SAG_DEMO==='1') throw new Error('Ejecuta setup sin SAG_DEMO. Las credenciales reales se guardan por separado.');
const store = openStore(process.env.SAG_DB??'.data/sag.sqlite');
const credentialFile = resolve('.local/initial-credentials.txt');
try {
  if (store.users().length) throw new Error('La aplicación ya tiene usuarios. Setup no sobrescribe cuentas ni contraseñas.');
  if (existsSync(credentialFile)) throw new Error('Ya existe .local/initial-credentials.txt. Revisa el archivo antes de repetir setup.');
  const credentials = await Promise.all(USER_DEFAULTS.map(async defaults=>{
    const password = randomBytes(24).toString('base64url');
    const key = defaults.role.toUpperCase();
    const name = process.env[`SAG_${key}_NAME`]?.trim()||defaults.name;
    const email = process.env[`SAG_${key}_EMAIL`]?.trim().toLowerCase()||defaults.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Correo inválido para ${defaults.role}.`);
    return {user:{...defaults,name,email,passwordHash:await hashPassword(password)},password};
  }));
  if (new Set(credentials.map(c=>c.user.email)).size!==4) throw new Error('Cada cuenta necesita un correo distinto.');
  mkdirSync(resolve('.local'),{recursive:true});
  const content = ['SAG · credenciales iniciales','Información privada. Entrega cada credencial por un canal seguro y guarda este archivo fuera del repositorio.','El jefe tiene acceso exclusivamente de consulta.','',...credentials.flatMap(c=>[`${c.user.name} · ${c.user.role}`,`Correo: ${c.user.email}`,`Contraseña: ${c.password}`,''])].join('\n');
  writeFileSync(credentialFile,content,{flag:'wx',mode:0o600});
  try {store.transaction(()=>{for(const c of credentials)store.putUser(c.user);seedSkills(store);});}
  catch(error){unlinkSync(credentialFile);throw error;}
  console.log('Se crearon las cuatro cuentas. Credenciales guardadas en .local/initial-credentials.txt (no se imprimen en consola).');
} finally {store.close();}
