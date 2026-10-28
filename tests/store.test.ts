import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/lib/store';
import Database from 'better-sqlite3';
import { scryptSync } from 'node:crypto';
const TEST_PASSWORD='test-only-passphrase';
process.env.ADMIN_USERNAME='test-teacher';
process.env.ADMIN_PASSWORD_HASH=scryptSync(TEST_PASSWORD,'matrona-local-login-v1',64).toString('hex');

test('legacy schedules migrate to support blocked slots without losing requests',()=>{
 const directory=mkdtempSync(join(tmpdir(),'matrona-migration-'));
 const legacy=new Database(join(directory,'matrona.sqlite'));
 legacy.exec(`CREATE TABLE slots (
  id TEXT PRIMARY KEY, day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 5),
  start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'EMPTY' CHECK(status IN ('EMPTY','AVAILABLE','BOOKED','BREAK','CATCHUP')),
  student_name TEXT, updated_at TEXT NOT NULL, UNIQUE(day_of_week,start_time));
  CREATE TABLE requests (id TEXT PRIMARY KEY, slot_id TEXT NOT NULL REFERENCES slots(id),
  requester_name TEXT NOT NULL, requester_contact TEXT NOT NULL, notes TEXT,
  is_reviewed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
  INSERT INTO slots VALUES ('1-07:00',1,'07:00','07:30','BOOKED','Existing student','original');
  INSERT INTO requests VALUES ('existing-request','1-07:00','Existing requester','','Keep this',0,1);`);
 legacy.close();
 let db=openStore(directory);
 try {
  assert.equal(db.slots(true)[0].student_name,'Existing student');
  assert.equal(db.requests()[0].id,'existing-request');
  const slot=db.slots()[0];
  db.update({...slot,status:'BLOCKED',student_name:'Must not be retained'});
  assert.equal(db.slots(true)[0].student_name,null);
  assert.equal(db.slots(true)[0].status,'BLOCKED');
  assert.equal(db.slots()[0].status,'BOOKED');
  assert.throws(()=>db.submit({slot_id:slot.id,requester_name:'Test'}),/no longer available/);
  db.close();db=openStore(directory);
  assert.equal(db.slots(true)[0].status,'BLOCKED');
  assert.equal(db.slots()[0].status,'BOOKED');
  assert.equal(db.requests()[0].id,'existing-request');
  db.update({...db.slots()[0],status:'AVAILABLE'});
  assert.equal(db.slots()[0].status,'AVAILABLE');
 } finally {db.close();for(const file of readdirSync(directory)) unlinkSync(join(directory,file));rmdirSync(directory);}
});

test('local data survives restarts; public reads hide names; writes and requests are validated',()=>{
 const directory=mkdtempSync(join(tmpdir(),'matrona-test-'));
 let db=openStore(directory);
 try {
  assert.equal(db.slots().length,100);
  assert.equal(db.slots().filter(s=>s.day_of_week===5).length,20);
  assert.equal(db.slots().at(-1)?.end_time,'17:00');
  assert.throws(()=>db.login('test-teacher','wrong'),/Incorrect/);
  const token=db.login('test-teacher',TEST_PASSWORD);
  assert.equal(db.authenticated(token),true);
  assert.equal(db.authenticated('a'.repeat(64)),false);
  const slot=db.slots()[0];
  db.update({...slot,status:'BOOKED',student_name:'Private student'});
  assert.equal(db.slots(true)[0].student_name,'Private student');
  assert.equal('student_name' in db.slots()[0],false);
  assert.throws(()=>db.update({...slot,status:'AVAILABLE'}),/changed/);
  assert.throws(()=>db.submit({slot_id:slot.id,requester_name:'Agency'}),/no longer available/);
  const booked=db.slots(true)[0];
  db.update({...booked,status:'AVAILABLE',student_name:''});
  assert.equal(db.slots(true)[0].student_name,null);
  const request={slot_id:slot.id,requester_name:'Agency',notes:'Maths'};
  db.submit(request);
  assert.throws(()=>db.submit(request),/pending request/);
  const incoming=db.requests()[0];
  db.review(incoming.id);
  assert.equal(db.requests()[0].is_reviewed,true);
  for(let i=0;i<4;i++) {db.submit(request);const r=db.requests().find(r=>!r.is_reviewed)!;db.review(r.id);}
  assert.throws(()=>db.submit(request),/Too many requests/);
  assert.throws(()=>db.update({...db.slots()[0],status:'INVALID'}),/Invalid slot status/);
  db.close();db=openStore(directory);
  assert.equal(db.slots().length,100);
  assert.equal(db.slots()[0].status,'AVAILABLE');
  assert.equal(db.requests().length,5);
  assert.equal(db.authenticated(token),true);
  db.logout(token);assert.equal(db.authenticated(token),false);
  for(let i=0;i<8;i++) assert.throws(()=>db.login('test-teacher','wrong'),/Incorrect/);
  assert.throws(()=>db.login('test-teacher',TEST_PASSWORD),/Too many sign-in/);
 } finally {db.close();for(const file of readdirSync(directory)) unlinkSync(join(directory,file));rmdirSync(directory);}
});
