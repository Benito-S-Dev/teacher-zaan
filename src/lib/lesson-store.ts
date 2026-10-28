import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { ATTENDANCE, normalizeName, saDate, nextDate, lessonTimestamp, type Company, type Student, type Lesson, type LessonEvent } from './lessons';
import type { Slot } from './schedule';

export class RegisterError extends Error { constructor(message:string,public status=400) {super(message);} }
const fail=(message:string,status=400):never=>{throw new RegisterError(message,status);};
function field(value:unknown,max=120) {if(typeof value!=='string'||value.trim().length>max) return fail('Please check the form fields.');return value.trim();}
function validDate(value:unknown) {const s=field(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s) return fail('Choose a valid date.');return s;}
function validTime(value:unknown) {const s=field(value,5);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return fail('Choose a valid time.');return s;}
type Rule = { slot_id:string; effective_at:number; payload:string };
type RuleData = Slot & { student_id:string|null; company_id:string|null; tracking_start:string|null };

export function createLessonStore(db:Database.Database,clock:()=>number=Date.now,carrieNames=(process.env.CARRIE_STUDENTS??'').split(',').map(normalizeName).filter(Boolean)) {
 db.exec(`
 CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY,name TEXT NOT NULL,cycle_day INTEGER NOT NULL CHECK(cycle_day IN (1,16)),tracking_start TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,company_id TEXT NOT NULL REFERENCES companies(id),needs_assignment INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS timetable_revisions (id INTEGER PRIMARY KEY,slot_id TEXT NOT NULL,effective_at INTEGER NOT NULL,payload TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS revision_slot ON timetable_revisions(slot_id,effective_at);
 CREATE TABLE IF NOT EXISTS lesson_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY,source_key TEXT UNIQUE,student_id TEXT NOT NULL REFERENCES students(id),student_name TEXT NOT NULL,company_id TEXT NOT NULL REFERENCES companies(id),lesson_date TEXT NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('SCHEDULED','COMPLETED','ABSENT','CANCELLED','RESCHEDULED')),billable INTEGER NOT NULL CHECK(billable IN (0,1)),automatic INTEGER NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',original_id TEXT REFERENCES lessons(id),updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS lessons_date ON lessons(lesson_date);
 CREATE UNIQUE INDEX IF NOT EXISTS lesson_replacement ON lessons(original_id) WHERE original_id IS NOT NULL;
 CREATE TABLE IF NOT EXISTS lesson_events (id INTEGER PRIMARY KEY,lesson_id TEXT NOT NULL,changed_at INTEGER NOT NULL,action TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS student_events (id INTEGER PRIMARY KEY,student_id TEXT NOT NULL,changed_at INTEGER NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL);
 `);
 db.prepare('INSERT OR IGNORE INTO companies VALUES (?,?,?,?)').run('private','Private',1,'2026-10-30');
 db.prepare('INSERT OR IGNORE INTO companies VALUES (?,?,?,?)').run('karin','Karin',1,'2026-10-30');
 db.prepare('INSERT OR IGNORE INTO companies VALUES (?,?,?,?)').run('carrie','Carrie',16,'2026-11-16');
 const companies=()=>db.prepare('SELECT * FROM companies ORDER BY name').all() as Company[];
 const students=()=>db.prepare('SELECT id,name,company_id,needs_assignment,updated_at FROM students ORDER BY name COLLATE NOCASE').all() as Student[];
 function studentFor(name:string) {
  const key=normalizeName(name);
  let student=db.prepare('SELECT * FROM students WHERE name_key=?').get(key) as Student|undefined;
  if(!student) {
   const carrie=carrieNames.includes(key);
   const id=randomUUID();db.prepare('INSERT INTO students VALUES (?,?,?,?,?,?)').run(id,name.trim().replace(/\s+/g,' '),key,carrie?'carrie':'private',carrie?0:1,randomUUID());
   student=db.prepare('SELECT * FROM students WHERE id=?').get(id) as Student;
  }
  return student;
 }
 function recordSlot(slot:Slot) {
  const student=slot.student_name?.trim()?studentFor(slot.student_name):null;
  const company=student?companies().find(c=>c.id===student.company_id):null;
  const payload:RuleData={...slot,student_id:student?.id??null,company_id:company?.id??null,tracking_start:company?.tracking_start??null};
  db.prepare('INSERT INTO timetable_revisions(slot_id,effective_at,payload) VALUES (?,?,?)').run(slot.id,clock(),JSON.stringify(payload));
 }
 db.transaction(()=>{
  if(!db.prepare("SELECT 1 FROM lesson_settings WHERE key='initialized'").get()) {
   for(const slot of db.prepare('SELECT * FROM slots').all() as Slot[]) recordSlot(slot);
   db.prepare("INSERT INTO lesson_settings VALUES ('initialized',?)").run(saDate(clock()));
  }
 }).immediate();
 function audit(id:string,action:string,before:unknown,after:unknown) {
  db.prepare('INSERT INTO lesson_events(lesson_id,changed_at,action,before_json,after_json) VALUES (?,?,?,?,?)').run(id,clock(),action,before?JSON.stringify(before):null,JSON.stringify(after));
 }
 function revisionsFor(date:string) {
  const rules=db.prepare('SELECT * FROM timetable_revisions WHERE effective_at<=? ORDER BY effective_at,id').all(lessonTimestamp(date,'23:59')+59999) as Rule[];
  const groups=new Map<string,Rule[]>();
  for(const rule of rules) {const list=groups.get(rule.slot_id)||[];list.push(rule);groups.set(rule.slot_id,list);}
  return groups;
 }
 function rulesForDay(date:string,includeOccupied=false) {
  const weekday=new Date(date+'T12:00:00Z').getUTCDay();const result:RuleData[]=[];
  for(const rules of revisionsFor(date).values()) {
   // Every revision of a weekly slot has the same start time and weekday.
   const sample=JSON.parse(rules[0].payload) as RuleData;
   if(sample.day_of_week!==weekday) continue;
   const chosen=rules.filter(r=>r.effective_at<=lessonTimestamp(date,sample.start_time)).at(-1);
   if(!chosen) continue;
   const slot=JSON.parse(chosen.payload) as RuleData;
   if(includeOccupied) {if(['BOOKED','CATCHUP','BLOCKED','BREAK'].includes(slot.status))result.push(slot);}
   else if(['BOOKED','CATCHUP'].includes(slot.status)&&slot.student_id&&slot.tracking_start&&date>=slot.tracking_start) result.push(slot);
  }
  return result;
 }
 function sync() {
  db.transaction(()=>{
   const today=saDate(clock());
   const last=db.prepare("SELECT value FROM lesson_settings WHERE key='last_day'").get() as {value:string}|undefined;
   const initialized=(db.prepare("SELECT value FROM lesson_settings WHERE key='initialized'").get() as {value:string}).value;
   let date=last?.value??(initialized>'2026-10-30'?initialized:'2026-10-30');
   for(;date<=today;date=nextDate(date)) {
    for(const slot of rulesForDay(date)) {
     const source=`${slot.id}:${date}`;
     if(db.prepare('SELECT 1 FROM lessons WHERE source_key=?').get(source)) continue;
     const id=randomUUID();
     db.prepare("INSERT INTO lessons VALUES (?,?,?,?,?,?,?,?, 'SCHEDULED',0,0,'',NULL,?)").run(id,source,slot.student_id,slot.student_name!.trim(),slot.company_id,date,slot.start_time,slot.end_time,randomUUID());
     audit(id,'Scheduled from weekly timetable',null,db.prepare('SELECT * FROM lessons WHERE id=?').get(id));
    }
   }
   if(today>='2026-10-30') db.prepare("INSERT OR REPLACE INTO lesson_settings VALUES ('last_day',?)").run(today);
   for(const lesson of db.prepare("SELECT * FROM lessons WHERE status='SCHEDULED' AND lesson_date<=?").all(today) as Lesson[]) {
    if(lessonTimestamp(lesson.lesson_date,lesson.end_time)>clock()) continue;
    db.prepare("UPDATE lessons SET status='COMPLETED',billable=1,automatic=1,updated_at=? WHERE id=?").run(randomUUID(),lesson.id);
    audit(lesson.id,'Automatically completed after lesson end',lesson,db.prepare('SELECT * FROM lessons WHERE id=?').get(lesson.id));
   }
  }).immediate();
 }
 function invalidateFuture(studentId?:string,slotId?:string) {
  const lessons=db.prepare("SELECT * FROM lessons WHERE source_key IS NOT NULL").all() as (Lesson & {source_key:string})[];
  for(const l of lessons) if(lessonTimestamp(l.lesson_date,l.start_time)>clock()&&(!studentId||l.student_id===studentId)&&(!slotId||l.source_key.startsWith(slotId+':'))) {
   const rule=rulesForDay(l.lesson_date).find(r=>`${r.id}:${l.lesson_date}`===l.source_key);
   const sameStudent=rule?.student_id===l.student_id;
   const corrected=!!db.prepare("SELECT 1 FROM lesson_events WHERE lesson_id=? AND action='Attendance or billing corrected'").get(l.id);
   if(l.status==='SCHEDULED'&&!corrected) {
    audit(l.id,'Future timetable entry replaced',l,{removed:true});db.prepare('DELETE FROM lessons WHERE id=?').run(l.id);
   } else if(!sameStudent) {
    // Keep explicit exceptions and linked replacements, but free the weekly
    // occurrence key so a different student's new booking can be generated.
    db.prepare("UPDATE lessons SET source_key=NULL,status=CASE WHEN status='SCHEDULED' THEN 'CANCELLED' ELSE status END,billable=0,updated_at=? WHERE id=?").run(randomUUID(),l.id);
    audit(l.id,'Weekly booking reassigned; original record retained',l,db.prepare('SELECT * FROM lessons WHERE id=?').get(l.id));
   }
  }
 }
 function getLesson(id:unknown,version:unknown) {
  const l=db.prepare('SELECT * FROM lessons WHERE id=?').get(field(id,80)) as Lesson|undefined;
  if(!l) return fail('Lesson not found.',404);
  if(l.updated_at!==version) return fail('This lesson changed. Refresh and try again.',409);
  return l;
 }
 return {
  sync,recordSlot,students,companies,
  beforeSlotChange:sync,
  afterSlotChange(slot:Slot) {recordSlot(slot);invalidateFuture(undefined,slot.id);sync();},
  data(fromValue:unknown,toValue:unknown) {
   const from=validDate(fromValue),to=validDate(toValue);
   if(from>to||Date.parse(to)-Date.parse(from)>370*86400_000) return fail('Choose a date range of one year or less.');
   sync();
   const lessons=db.prepare('SELECT l.*, child.id AS replacement_id, child.lesson_date AS replacement_date, child.start_time AS replacement_time FROM lessons l LEFT JOIN lessons child ON child.original_id=l.id WHERE l.lesson_date BETWEEN ? AND ? ORDER BY l.lesson_date,l.start_time,l.student_name').all(from,to) as Lesson[];
   return {today:saDate(clock()),server_now:clock(),companies:companies(),students:students(),lessons,history:[] as LessonEvent[],from,to};
  },
  history(id:unknown) {
   const lessonId=field(id,80);
   if(!db.prepare('SELECT 1 FROM lessons WHERE id=?').get(lessonId)) return fail('Lesson not found.',404);
   return db.prepare('SELECT * FROM lesson_events WHERE lesson_id=? ORDER BY changed_at DESC,id DESC LIMIT 500').all(lessonId) as LessonEvent[];
  },
  saveStudent(body:Record<string,unknown>) {
   db.transaction(()=>{
    sync();const id=field(body.id,80);const before=db.prepare('SELECT * FROM students WHERE id=?').get(id) as Student|undefined;
    if(!before) return fail('Student not found.',404);
    if(before.updated_at!==body.updated_at) return fail('This student changed. Refresh and try again.',409);
    const name=field(body.name);if(!name) return fail('Enter a student name.');
    const company=companies().find(c=>c.id===body.company_id);if(!company) return fail('Choose a company.');
    const duplicate=db.prepare('SELECT id FROM students WHERE name_key=? AND id<>?').get(normalizeName(name),id);
    if(duplicate) return fail('That name already belongs to another student.');
    db.prepare('UPDATE students SET name=?,name_key=?,company_id=?,needs_assignment=0,updated_at=? WHERE id=?').run(name,normalizeName(name),company.id,randomUUID(),id);
    const slots=db.prepare('SELECT * FROM slots WHERE student_name IS NOT NULL').all() as Slot[];
    for(const slot of slots) if(normalizeName(slot.student_name!)===normalizeName(before.name)) {
     db.prepare('UPDATE slots SET student_name=?,updated_at=? WHERE id=?').run(name,randomUUID(),slot.id);
     recordSlot({...slot,student_name:name});
    }
    invalidateFuture(id);
    const after=db.prepare('SELECT * FROM students WHERE id=?').get(id);
    db.prepare('INSERT INTO student_events(student_id,changed_at,before_json,after_json) VALUES (?,?,?,?)').run(id,clock(),JSON.stringify(before),JSON.stringify(after));
    sync();
   }).immediate();
  },
  addCompany(body:Record<string,unknown>) {
   const name=field(body.name,80);if(!name) return fail('Enter a company name.');
   if(companies().some(c=>normalizeName(c.name)===normalizeName(name))) return fail('This company already exists.');
   const day=Number(body.cycle_day);if(day!==1&&day!==16) return fail('Choose a billing cycle.');
   db.prepare('INSERT INTO companies VALUES (?,?,?,?)').run(randomUUID(),name,day,'2026-10-30');
  },
  updateLesson(body:Record<string,unknown>) {
   db.transaction(()=>{
    sync();const before=getLesson(body.id,body.updated_at);
    const status=body.status as Lesson['status'];
    if(!ATTENDANCE.includes(status)||status==='RESCHEDULED') return fail('Choose an attendance status. Use Reschedule to move a lesson.');
    if(db.prepare('SELECT 1 FROM lessons WHERE original_id=?').get(before.id)) return fail('This lesson has a replacement. Edit the replacement instead.');
    if(['COMPLETED','ABSENT'].includes(status)&&lessonTimestamp(before.lesson_date,before.end_time)>clock()) return fail('Attendance can be recorded after the lesson ends.');
    if(status==='SCHEDULED'&&lessonTimestamp(before.lesson_date,before.end_time)<=clock()) return fail('A past lesson must have an attendance outcome.');
    if(typeof body.billable!=='boolean') return fail('Choose whether this lesson is billable.');
    if(['SCHEDULED','CANCELLED'].includes(status)&&body.billable) return fail('Scheduled and cancelled lessons cannot be billable.');
    db.prepare('UPDATE lessons SET status=?,billable=?,automatic=0,notes=?,updated_at=? WHERE id=?').run(status,body.billable?1:0,field(body.notes??'',1000),randomUUID(),before.id);
    audit(before.id,'Attendance or billing corrected',before,db.prepare('SELECT * FROM lessons WHERE id=?').get(before.id));
   }).immediate();
  },
  reschedule(body:Record<string,unknown>) {
   db.transaction(()=>{
    sync();const before=getLesson(body.id,body.updated_at);
    if(db.prepare('SELECT 1 FROM lessons WHERE original_id=?').get(before.id)) return fail('This lesson already has a replacement. Edit that lesson instead.');
    const date=validDate(body.lesson_date),start=validTime(body.start_time),end=validTime(body.end_time);
    if(start>=end) return fail('The end time must be after the start time.');
    if(date===before.lesson_date&&start===before.start_time&&end===before.end_time) return fail('Choose a different date or time.');
    if(Date.parse(date)>clock()+366*86400_000) return fail('Choose a date within the next year.');
    const student=db.prepare('SELECT * FROM students WHERE id=?').get(before.student_id) as Student;
    let companyId=student.company_id;
    const changes=db.prepare('SELECT before_json FROM student_events WHERE student_id=? AND changed_at>? ORDER BY changed_at DESC,id DESC').all(student.id,lessonTimestamp(date,start)) as {before_json:string}[];
    for(const change of changes)companyId=(JSON.parse(change.before_json) as Student).company_id;
    const company=companies().find(c=>c.id===companyId)!;
    if(date<company.tracking_start) return fail('That date is before this company starts tracking.');
    const clash=db.prepare("SELECT id FROM lessons WHERE lesson_date=? AND start_time<? AND end_time>? AND status NOT IN ('CANCELLED','RESCHEDULED') AND id<>?").get(date,end,start,before.id);
    const recurringClash=rulesForDay(date,true).some(r=>{
     if(r.start_time>=end||r.end_time<=start)return false;
     const occurrence=db.prepare('SELECT id,status FROM lessons WHERE source_key=?').get(`${r.id}:${date}`) as {id:string;status:string}|undefined;
     return !occurrence||(occurrence.id!==before.id&&!['CANCELLED','RESCHEDULED'].includes(occurrence.status));
    });
    if(clash||recurringClash) return fail('Another lesson is already scheduled at that time. Choose a different time.',409);
    const id=randomUUID();
    db.prepare("UPDATE lessons SET status='RESCHEDULED',billable=0,automatic=0,notes=?,updated_at=? WHERE id=?").run(field(body.notes??'',1000),randomUUID(),before.id);
    db.prepare("INSERT INTO lessons VALUES (?,NULL,?,?,?,?,?,?,'SCHEDULED',0,0,?,?,?)").run(id,before.student_id,student.name,company.id,date,start,end,field(body.notes??'',1000),before.id,randomUUID());
    audit(before.id,'Rescheduled; replacement '+id,before,db.prepare('SELECT * FROM lessons WHERE id=?').get(before.id));
    audit(id,'Replacement for '+before.id,null,db.prepare('SELECT * FROM lessons WHERE id=?').get(id));
    sync();
   }).immediate();
  },
 };
}
