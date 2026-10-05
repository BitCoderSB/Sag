import { mkdirSync, copyFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { openStore } from '../server/db.js';
import type { Attachment } from '../shared/types.js';

// VACUUM INTO creates a consistent SQLite snapshot, including a database in WAL mode.
// Physical attachment files are append-only; a manifest records exactly those in the snapshot.
const requested = process.argv[2];
if (!requested) throw new Error('Indica un directorio de respaldo: npm run backup -- C:/respaldos/sag');
if (process.env.SAG_DEMO==='1') throw new Error('Usa SAG_DB y SAG_FILES explícitos para respaldar una demostración.');
const dbPath = resolve(process.env.SAG_DB??'.data/sag.sqlite');
if (!existsSync(dbPath)) throw new Error('No existe la base de datos de SAG.');
const target = resolve(requested,`sag-${new Date().toISOString().replace(/[:.]/g,'-')}`);
mkdirSync(target,{recursive:true});
const store = openStore(dbPath);
const snapshot = join(target,'sag.sqlite');
try {store.db.prepare('VACUUM INTO ?').run(snapshot);} finally {store.close();}
const copy = openStore(snapshot);
try {
  // Sessions are intentionally excluded: a restore requires a fresh login.
  copy.db.exec('DELETE FROM sessions; PRAGMA wal_checkpoint(TRUNCATE);');
  const files = copy.all<Attachment&{storageName:string}>('attachments');
  const sourceFiles = resolve(process.env.SAG_FILES??'.data/files');
  const targetFiles = join(target,'files');
  mkdirSync(targetFiles,{recursive:true});
  const manifest = files.map(file=>{
    const source = resolve(sourceFiles,file.storageName);
    if(!source.startsWith(sourceFiles+sep))throw new Error('Ruta de archivo inválida en la base de datos.');
    if(!existsSync(source))throw new Error(`Falta el adjunto ${file.id}; el respaldo queda incompleto.`);
    const destination = join(targetFiles,file.storageName);
    copyFileSync(source,destination);
    return {id:file.id,name:file.name,storageName:file.storageName,size:file.size,sha256:createHash('sha256').update(readFileSync(destination)).digest('hex')};
  });
  writeFileSync(join(target,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),schemaVersion:1,attachments:manifest},null,2));
  console.log(`Respaldo creado en ${target}. Contiene información privada y hashes de acceso; protégelo.`);
} finally {copy.close();}
