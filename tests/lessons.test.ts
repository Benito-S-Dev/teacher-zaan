import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createLessonStore } from '../src/lib/lesson-store';
import { billingPeriod, normalizeName, saDate } from '../src/lib/lessons';

function fixture() {
 const db=new Database(':memory:');db.pragma('foreign_keys = ON');
 db.exec(`CREATE TABLE slots (id TEXT PRIMARY KEY,day_of_week INTEGER,start_time TEXT,end_time TEXT,status TEXT,student_name TEXT,updated_at TEXT);
  INSERT INTO slots VALUES ('q1',5,'08:00','08:30','BOOKED','Quinton','v1');
  INSERT INTO slots VALUES ('q2',5,'10:00','10:30','BOOKED',' quinton ','v2');
  INSERT INTO slots VALUES ('blank',5,'09:00','09:30','BOOKED',NULL,'v3');
  INSERT INTO slots VALUES ('blocked',5,'11:00','11:30','BLOCKED',NULL,'v4');
  INSERT INTO slots VALUES ('demo carrie',1,'08:00','08:30','BOOKED','Demo Carrie','v5');`);
 let now=Date.parse('2026-10-28T12:00:00+02:00');
 const register=createLessonStore(db,()=>now,['demo carrie']);
 return {db,register,at:(value:string)=>{now=Date.parse(value+'+02:00');}};
}

test('name matching, fixed South African dates and month/cycle boundaries',()=>{
 assert.equal(normalizeName('  QUINTON  '),normalizeName('Quinton'));
 assert.deepEqual(billingPeriod('2026-11',16),{from:'2026-11-16',to:'2026-12-15'});
 assert.deepEqual(billingPeriod('2026-12',16),{from:'2026-12-16',to:'2027-01-15'});
 assert.deepEqual(billingPeriod('2028-02',1),{from:'2028-02-01',to:'2028-02-29'});
 assert.equal(saDate(Date.parse('2026-10-29T22:00:00Z')),'2026-10-30');
});

test('start dates, unnamed bookings, company assignments and automatic completion',()=>{
 const {db,register,at}=fixture();try {
  assert.equal(register.students().filter(s=>normalizeName(s.name)==='quinton').length,1);
  assert.equal(register.students().find(s=>s.name==='Demo Carrie')!.company_id,'carrie');
  assert.equal(register.data('2026-10-01','2026-10-31').lessons.length,0);
  at('2026-10-30T08:15:00');
  let lessons=register.data('2026-10-01','2026-10-31').lessons;
  assert.equal(lessons.length,2);assert.ok(lessons.every(l=>l.status==='SCHEDULED'&&!l.billable));
  at('2026-10-30T08:30:00');
  lessons=register.data('2026-10-01','2026-10-31').lessons;
  assert.equal(lessons.filter(l=>l.status==='COMPLETED').length,1);
  assert.equal(lessons.find(l=>l.status==='COMPLETED')!.billable,1);
  const ids=lessons.map(l=>l.id);assert.deepEqual(register.data('2026-10-01','2026-10-31').lessons.map(l=>l.id),ids);
  at('2026-11-16T09:00:00');
  const all=register.data('2026-10-01','2026-11-30').lessons;
  const companyLessons=all.filter(l=>normalizeName(l.student_name)==='demo carrie');
  assert.equal(companyLessons.length,1);assert.equal(companyLessons[0].lesson_date,'2026-11-16');assert.equal(companyLessons[0].status,'COMPLETED');
 } finally {db.close();}
});

test('attendance corrections persist, billing is independent, stale writes are rejected',()=>{
 const {db,register,at}=fixture();try {
  at('2026-10-30T12:00:00');const lesson=register.data('2026-10-30','2026-10-30').lessons[0];
  register.updateLesson({...lesson,status:'ABSENT',billable:true,notes:'Charged by agreement'});
  let changed=register.data('2026-10-30','2026-10-30').lessons[0];
  assert.equal(changed.status,'ABSENT');assert.equal(changed.billable,1);assert.equal(changed.automatic,0);
  assert.throws(()=>register.updateLesson({...lesson,status:'COMPLETED',billable:true}),/changed/);
  register.updateLesson({...changed,status:'ABSENT',billable:false});
  changed=register.data('2026-10-30','2026-10-30').lessons[0];assert.equal(changed.billable,0);
  assert.ok(register.history(lesson.id).some(e=>e.action==='Attendance or billing corrected'));
 } finally {db.close();}
});

test('rescheduling links one replacement and bills its actual month without double counting',()=>{
 const {db,register,at}=fixture();try {
  at('2026-10-30T12:00:00');const lesson=register.data('2026-10-30','2026-10-30').lessons[0];
  register.reschedule({...lesson,lesson_date:'2026-11-02',start_time:'09:00',end_time:'09:30',notes:'Make-up'});
  let october=register.data('2026-10-01','2026-10-31').lessons;
  assert.equal(october.filter(l=>l.billable).length,1);
  assert.equal(october.find(l=>l.id===lesson.id)!.status,'RESCHEDULED');
  const moved=register.data('2026-11-01','2026-11-30').lessons.find(l=>l.original_id===lesson.id)!;
  assert.equal(moved.status,'SCHEDULED');assert.equal(moved.billable,0);
  assert.throws(()=>register.reschedule({...october.find(l=>l.id===lesson.id),lesson_date:'2026-11-03',start_time:'09:00',end_time:'09:30'}),/replacement/);
  at('2026-11-02T10:00:00');
  const completed=register.data('2026-11-01','2026-11-30').lessons.find(l=>l.id===moved.id)!;
  assert.equal(completed.status,'COMPLETED');assert.equal(completed.billable,1);
  october=register.data('2026-10-01','2026-10-31').lessons;
  assert.equal(october.filter(l=>l.billable).length,1);
 } finally {db.close();}
});

test('company and timetable changes preserve previous lessons and affect future occurrences',()=>{
 const {db,register,at}=fixture();try {
  at('2026-10-30T12:00:00');register.sync();
  const student=register.students().find(s=>normalizeName(s.name)==='quinton')!;
  register.saveStudent({...student,name:'QUINTON',company_id:'karin'});
  at('2026-11-06T12:00:00');
  const all=register.data('2026-10-01','2026-11-30').lessons;
  assert.ok(all.filter(l=>l.lesson_date==='2026-10-30').every(l=>l.company_id==='private'));
  assert.ok(all.filter(l=>l.lesson_date==='2026-11-06').every(l=>l.company_id==='karin'));
  assert.ok(all.every(l=>l.student_id===student.id));
  const slot=db.prepare("SELECT * FROM slots WHERE id='q1'").get() as Parameters<typeof register.afterSlotChange>[0];
  register.beforeSlotChange();db.prepare("UPDATE slots SET status='BLOCKED',student_name=NULL WHERE id='q1'").run();register.afterSlotChange({...slot,status:'BLOCKED',student_name:null});
  at('2026-11-13T12:00:00');
  const later=register.data('2026-11-13','2026-11-13').lessons;
  assert.equal(later.length,1);assert.equal(later[0].start_time,'10:00');
  assert.equal(register.data('2026-10-30','2026-10-30').lessons.length,2);
 } finally {db.close();}
});

test('a moved lesson cannot overlap an unnamed booking or blocked weekly time',()=>{
 const {db,register,at}=fixture();try {
  at('2026-10-30T12:00:00');const lesson=register.data('2026-10-30','2026-10-30').lessons[0];
  assert.throws(()=>register.reschedule({...lesson,lesson_date:'2026-11-06',start_time:'09:00',end_time:'09:30'}),/already scheduled/);
  assert.throws(()=>register.reschedule({...lesson,lesson_date:'2026-11-06',start_time:'11:00',end_time:'11:30'}),/already scheduled/);
 } finally {db.close();}
});

test('Carrie make-up lessons cross the 15th boundary and do not count twice',()=>{
 const {db,register,at}=fixture();try {
  at('2026-11-16T12:00:00');const original=register.data('2026-11-16','2026-12-15').lessons.find(l=>l.student_name==='Demo Carrie')!;
  register.reschedule({...original,lesson_date:'2026-12-16',start_time:'09:00',end_time:'09:30'});
  at('2026-12-16T12:00:00');
  const first=register.data('2026-11-16','2026-12-15').lessons;
  const second=register.data('2026-12-16','2027-01-15').lessons;
  assert.equal(first.find(l=>l.id===original.id)!.billable,0);
  assert.equal(first.find(l=>l.id===original.id)!.status,'RESCHEDULED');
  const replacement=second.find(l=>l.original_id===original.id)!;
  assert.equal(replacement.status,'COMPLETED');assert.equal(replacement.billable,1);
  assert.equal(replacement.company_id,'carrie');
 } finally {db.close();}
});

test('future company assignment changes today’s unstarted lessons and persists on restart',()=>{
 const {db,register,at}=fixture();try {
  at('2026-10-30T07:00:00');const initial=register.data('2026-10-30','2026-10-30');
  const student=initial.students.find(s=>normalizeName(s.name)==='quinton')!;
  register.saveStudent({...student,company_id:'karin'});
  let lessons=register.data('2026-10-30','2026-10-30').lessons;
  assert.equal(lessons.length,2);assert.ok(lessons.every(l=>l.company_id==='karin'));
  at('2026-10-30T12:00:00');
  const restarted=createLessonStore(db,()=>Date.parse('2026-10-30T12:00:00+02:00'));
  lessons=restarted.data('2026-10-30','2026-10-30').lessons;
  assert.equal(lessons.length,2);assert.ok(lessons.every(l=>l.status==='COMPLETED'&&l.company_id==='karin'));
 } finally {db.close();}
});

test('reassigning a cancelled future slot creates the new student’s lesson and retains the exception',()=>{
 const {db,register,at}=fixture();try {
  at('2026-10-30T07:00:00');const lesson=register.data('2026-10-30','2026-10-30').lessons[0];
  register.updateLesson({...lesson,status:'CANCELLED',billable:false,notes:'Original student cancelled'});
  const slot=db.prepare("SELECT * FROM slots WHERE id='q1'").get() as Parameters<typeof register.afterSlotChange>[0];
  register.beforeSlotChange();db.prepare("UPDATE slots SET student_name='Alice' WHERE id='q1'").run();register.afterSlotChange({...slot,student_name:'Alice'});
  const lessons=register.data('2026-10-30','2026-10-30').lessons;
  assert.equal(lessons.find(l=>l.id===lesson.id)!.status,'CANCELLED');
  assert.equal(lessons.find(l=>l.student_name==='Alice')!.status,'SCHEDULED');
  assert.equal(lessons.length,3);
 } finally {db.close();}
});
