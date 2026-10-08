/**
 * Lectura mínima del cronograma de tesis (.xlsx de la plantilla): primera hoja, columnas A (fase), B (inicio) y C (fin).
 * Sin dependencias: un .xlsx es un ZIP con XML. Solo lee; nunca ejecuta nada del archivo.
 */
import { inflateRawSync } from 'node:zlib';
import { planPhase, type ThesisPlanItem } from '../shared/thesis.js';

const MAX_ENTRY = 5 * 1024 * 1024;

/** Archivos del ZIP por nombre (solo los que se piden). */
function unzip(buf: Buffer, wanted: (name: string) => boolean) {
  const out = new Map<string, string>();
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) return out;
  const count = buf.readUInt16LE(end + 10); let p = buf.readUInt32LE(end + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10); const size = buf.readUInt32LE(p + 20); const raw = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28); const extra = buf.readUInt16LE(p + 30); const comment = buf.readUInt16LE(p + 32); const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extra + comment;
    if (!wanted(name) || raw > MAX_ENTRY || local + 30 > buf.length) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    try { out.set(name, (method === 8 ? inflateRawSync(data, { maxOutputLength: MAX_ENTRY }) : data).toString('utf8')); } catch { /* entrada dañada: se ignora */ }
  }
  return out;
}

const decode = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const serialDay = (v: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
function toDay(v: string | undefined) {
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) { const n = Number(v); return n > 20_000 && n < 80_000 ? serialDay(n) : null; }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** Filas del cronograma con fechas válidas; null si el archivo no parece un cronograma. */
export function readSchedule(buf: Buffer): ThesisPlanItem[] | null {
  const files = unzip(buf, n => n === 'xl/sharedStrings.xml' || n === 'xl/worksheets/sheet1.xml');
  const sheet = files.get('xl/worksheets/sheet1.xml'); if (!sheet) return null;
  const strings = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => decode(m[1]));
  const rows = new Map<number, Record<string, string>>();
  for (const m of sheet.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, col, row, attrs, inner = ''] = m;
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? /<is>([\s\S]*?)<\/is>/.exec(inner)?.[1];
    if (v === undefined) continue;
    const value = /t="s"/.test(attrs) ? strings[Number(v)] ?? '' : decode(v);
    (rows.get(+row) ?? rows.set(+row, {}).get(+row)!)[col] = value.trim();
  }
  const plan: ThesisPlanItem[] = [];
  for (const [, r] of [...rows].sort((a, b) => a[0] - b[0])) {
    const start = toDay(r.B); const end = toDay(r.C);
    if (!r.A || !start || !end || end < start) continue;
    const label = r.A.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').slice(0, 120);
    plan.push({ label, start, end, phase: planPhase(label) });
  }
  return plan.length >= 2 ? plan.slice(0, 40) : null;
}
