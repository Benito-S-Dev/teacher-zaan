import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { emptySlots, STATUSES, type Slot, type Status, type BookingRequest } from './schedule';
import { createLessonStore } from './lesson-store';

// Imported exclusively by server routes. Never import this module into a client component.
export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
function text(value: unknown, max: number, min = 0) {
 if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new AppError('Please check the form fields.');
 return value.trim();
}
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function openStore(directory: string) {
 mkdirSync(directory, { recursive: true, mode: 0o700 });
 const db = new Database(resolve(directory, 'matrona.sqlite'));
 db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000'); db.pragma('synchronous = FULL');
 db.exec(`
 CREATE TABLE IF NOT EXISTS slots (
 id TEXT PRIMARY KEY, day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 5),
 start_time TEXT NOT NULL, end_time TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'EMPTY' CHECK(status IN ('EMPTY','AVAILABLE','BOOKED','BREAK','CATCHUP','BLOCKED')),
 student_name TEXT, updated_at TEXT NOT NULL, UNIQUE(day_of_week,start_time));
 CREATE TABLE IF NOT EXISTS requests (
 id TEXT PRIMARY KEY, slot_id TEXT NOT NULL REFERENCES slots(id), requester_name TEXT NOT NULL,
 requester_contact TEXT NOT NULL, notes TEXT, is_reviewed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS request_name ON requests(requester_name COLLATE NOCASE,created_at);
 CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS login_attempts (attempted_at INTEGER NOT NULL);
 `);
 // Existing installations need an expanded CHECK constraint. Preserve slot IDs
 // and request references while replacing the table in one transaction.
 const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='slots'").get() as {sql:string};
 if (!schema.sql.includes("'BLOCKED'")) {
  db.pragma('foreign_keys = OFF');
  try {
   db.transaction(() => {
    db.exec(`CREATE TABLE slots_migrated (
     id TEXT PRIMARY KEY, day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 5),
     start_time TEXT NOT NULL, end_time TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'EMPTY' CHECK(status IN ('EMPTY','AVAILABLE','BOOKED','BREAK','CATCHUP','BLOCKED')),
     student_name TEXT, updated_at TEXT NOT NULL, UNIQUE(day_of_week,start_time));
     INSERT INTO slots_migrated SELECT * FROM slots;
     DROP TABLE slots;
     ALTER TABLE slots_migrated RENAME TO slots;`);
    if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Slot migration failed foreign key validation.');
   }).immediate();
  } catch (error) { db.close(); throw error; }
  finally { if (db.open) db.pragma('foreign_keys = ON'); }
 }
 db.transaction(() => {
  const insert = db.prepare('INSERT OR IGNORE INTO slots VALUES (@id,@day_of_week,@start_time,@end_time,@status,NULL,@updated_at)');
  for (const slot of emptySlots()) insert.run({ ...slot, id: `${slot.day_of_week}-${slot.start_time}`, updated_at: randomUUID() });
 })();
 const register = createLessonStore(db);
 return {
  register,
  close: () => db.close(),
  slots(admin = false) { return db.prepare(`SELECT id,day_of_week,start_time,end_time,${admin ? 'status' : "CASE WHEN status='BLOCKED' THEN 'BOOKED' ELSE status END AS status"},updated_at${admin ? ',student_name' : ''} FROM slots ORDER BY day_of_week,start_time`).all() as Slot[]; },
  requests(): BookingRequest[] { return db.prepare('SELECT id,slot_id,requester_name,notes,is_reviewed,created_at FROM requests ORDER BY created_at DESC').all().map(row => { const r = row as BookingRequest; return { ...r, is_reviewed: !!r.is_reviewed }; }); },
  login(username: unknown, password: unknown) {
   const configuredUsername=process.env.ADMIN_USERNAME;
   const configuredHash=process.env.ADMIN_PASSWORD_HASH;
   if(!configuredUsername||!configuredHash||! /^[a-f0-9]{128}$/i.test(configuredHash)) throw new AppError('Teacher login is not configured.',503);
   const now = Date.now();
   const limited = db.transaction(() => {
    db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').run(now - 15 * 60_000);
    const count = db.prepare('SELECT COUNT(*) AS n FROM login_attempts').get() as {n:number};
    if(count.n >= 10) return true;
    db.prepare('INSERT INTO login_attempts VALUES (?)').run(now); return false;
   }).immediate();
   if(limited) throw new AppError('Too many sign-in attempts. Try again in 15 minutes.',429);
   if(typeof username !== 'string' || typeof password !== 'string' || password.length > 256) throw new AppError('Incorrect username or password.',401);
   const hash = scryptSync(password,'matrona-local-login-v1',64);
   if(!timingSafeEqual(hash,Buffer.from(configuredHash,'hex')) || username !== configuredUsername) throw new AppError('Incorrect username or password.',401);
   const token = randomBytes(32).toString('hex');
   db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
   db.prepare('INSERT INTO sessions VALUES (?,?)').run(tokenHash(token),now+7*86400_000);
   return token;
  },
  authenticated(token?: string) { return !!token && token.length===64 && !!db.prepare('SELECT 1 FROM sessions WHERE hash=? AND expires>?').get(tokenHash(token),Date.now()); },
  logout(token?: string) { if(token) db.prepare('DELETE FROM sessions WHERE hash=?').run(tokenHash(token)); },
  update(body: Record<string,unknown>) {
   const id = text(body.id,80,1); const status = body.status as Status;
   if(!STATUSES.includes(status)) throw new AppError('Invalid slot status.');
   const student = text(body.student_name ?? '',120);
   const version = text(body.updated_at,80,1);
   db.transaction(()=>{
    register.beforeSlotChange();
    const result = db.prepare('UPDATE slots SET status=?,student_name=?,updated_at=? WHERE id=? AND updated_at=?').run(status,['BOOKED','CATCHUP'].includes(status)?student||null:null,randomUUID(),id,version);
    if(!result.changes) throw new AppError('This slot changed. Refresh the board and try again.',409);
    register.afterSlotChange(db.prepare('SELECT * FROM slots WHERE id=?').get(id) as Slot);
   }).immediate();
  },
  submit(body: Record<string,unknown>) {
   const id=text(body.slot_id,80,1), name=text(body.requester_name,120,1), notes=text(body.notes??'',1000);
   db.transaction(() => {
    const slot=db.prepare('SELECT status FROM slots WHERE id=?').get(id) as {status:string}|undefined;
    if(slot?.status!=='AVAILABLE') throw new AppError('This slot is no longer available.',409);
    const count=db.prepare('SELECT COUNT(*) AS n FROM requests WHERE requester_name=? COLLATE NOCASE AND created_at>?').get(name,Date.now()-3600_000) as {n:number};
    if(count.n>=5) throw new AppError('Too many requests. Please try again in an hour.',429);
    if(db.prepare('SELECT 1 FROM requests WHERE slot_id=? AND requester_name=? COLLATE NOCASE AND is_reviewed=0').get(id,name)) throw new AppError('You already have a pending request for this slot.',409);
    db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,0,?)').run(randomUUID(),id,name,'',notes||null,Date.now());
   }).immediate();
  },
  review(id: unknown) { if(!db.prepare('UPDATE requests SET is_reviewed=1 WHERE id=?').run(text(id,80,1)).changes) throw new AppError('Request not found.',404); },
 };
}
let instance: ReturnType<typeof openStore> | undefined;
export function store() { return instance ??= openStore(resolve(process.env.DATA_DIR || './data')); }
