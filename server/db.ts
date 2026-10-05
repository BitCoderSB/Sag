import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { User } from '../shared/types.js';

const scrypt = promisify(nodeScrypt);
export type Entity = 'students' | 'assignments' | 'reviews' | 'deliveries' | 'evaluations' | 'skills' | 'notes' | 'attachments' | 'audit' | 'meetings';
export interface StoredUser extends User { passwordHash: string }
export interface StoredSession { hash: string; user_id: string; csrf: string; expires_at: number }
export class Store {
  db: DatabaseSync;
  path: string;
  constructor(path: string) {
    this.path = path === ':memory:' ? path : resolve(path);
    if (path !== ':memory:') mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    for (const table of ['students','assignments','reviews','deliveries','evaluations','skills','notes','attachments','audit','meetings']) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));`);
    }
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS student_registration ON students(upper(json_extract(data, '$.registration')));
      CREATE UNIQUE INDEX IF NOT EXISTS evaluation_current ON evaluations(json_extract(data, '$.assignmentId')) WHERE json_extract(data, '$.current')=1;`);
  }
  all<T>(table: Entity): T[] { return this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all().map(row => JSON.parse(row.data as string)); }
  get<T>(table: Entity, id: string): T | undefined { const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id); return row ? JSON.parse(row.data as string) : undefined; }
  put<T extends { id: string }>(table: Entity, data: T): T { this.db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(data.id, JSON.stringify(data)); return data; }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  users(): StoredUser[] { return this.db.prepare('SELECT data FROM users').all().map(r => JSON.parse(r.data as string)); }
  user(id: string): StoredUser | undefined { const row = this.db.prepare('SELECT data FROM users WHERE id=?').get(id); return row ? JSON.parse(row.data as string) : undefined; }
  userByEmail(email: string): StoredUser | undefined { const row = this.db.prepare('SELECT data FROM users WHERE email=? COLLATE NOCASE').get(email); return row ? JSON.parse(row.data as string) : undefined; }
  putUser(user: StoredUser) { this.db.prepare('INSERT INTO users(id,email,data) VALUES(?,?,?)').run(user.id, user.email.toLowerCase(), JSON.stringify(user)); }
  close() { this.db.close(); }
}
export function openStore(path = process.env.SAG_DB ?? '.data/sag.sqlite') { return new Store(path); }
export const id = (prefix: string) => `${prefix}_${randomUUID()}`;
export const now = () => new Date().toISOString();
export function publicUser(user: StoredUser): User { const { passwordHash: _, ...safe } = user; return safe; }
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
const dummySalt = randomBytes(24).toString('hex');
export async function checkPassword(password: string, encoded?: string): Promise<boolean> {
  const [, salt, hex] = encoded?.split(':') ?? [];
  const key = await scrypt(password, salt || dummySalt, 64) as Buffer;
  if (!hex || hex.length !== 128) return false;
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}
