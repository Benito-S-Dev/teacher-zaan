import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptySlots,displayTime,preferredZone} from '../src/lib/schedule';
test('China display shifts every slot six hours without changing stored times or weekdays',()=>{
 const slots=emptySlots();const before=JSON.stringify(slots);
 assert.equal(displayTime('07:00','china'),'13:00');
 assert.equal(displayTime('16:30','china'),'22:30');
 assert.equal(displayTime('17:00','china'),'23:00');
 for(const slot of slots) {
  assert.equal(displayTime(slot.start_time,'south-africa'),slot.start_time);
  assert.equal(Number(displayTime(slot.start_time,'china').slice(0,2))-Number(slot.start_time.slice(0,2)),6);
 }
 assert.equal(JSON.stringify(slots),before);
});
test('China device default and explicit saved preference',()=>{
 assert.equal(preferredZone(null,'Asia/Shanghai'),'china');
 assert.equal(preferredZone('south-africa','Asia/Shanghai'),'south-africa');
 assert.equal(preferredZone('china','Africa/Johannesburg'),'china');
 assert.equal(preferredZone(null,'Africa/Johannesburg'),'south-africa');
 assert.equal(preferredZone('invalid','Asia/Shanghai'),'china');
});
