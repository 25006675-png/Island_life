// Calendar events -> island blocks, and island blocks -> events (two-way).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventToBlock, keywordKind, titleKey, occurrencesBetween, eventFor, localParts } from '../supabase/functions/_shared/events.ts';

const KL='Asia/Kuala_Lumpur';
const ev=(start,end,extra={})=>({id:'e1',summary:'MA1521 Lecture',start:{dateTime:start},end:{dateTime:end},...extra});

test('a timed event lands on the student\'s own clock', () => {
  assert.deepEqual(localParts('2026-10-05T01:00:00Z',KL),{date:'2026-10-05',minute:9*60});
  assert.deepEqual(eventToBlock(ev('2026-10-05T10:00:00+08:00','2026-10-05T12:00:00+08:00'),KL),
    {external_id:'e1',date:'2026-10-05',start_min:600,mins:120,title:'MA1521 Lecture'});
});

test('what carries no load stays out', () => {
  assert.equal(eventToBlock({id:'a',summary:'Holiday',start:{date:'2026-10-05'},end:{date:'2026-10-06'}},KL),null,'all-day');
  assert.equal(eventToBlock(ev('2026-10-05T10:00:00+08:00','2026-10-05T11:00:00+08:00',{status:'cancelled'}),KL),null);
  assert.equal(eventToBlock(ev('2026-10-05T10:00:00+08:00','2026-10-05T11:00:00+08:00',{attendees:[{self:true,responseStatus:'declined'}]}),KL),null);
  assert.equal(eventToBlock(ev('2026-10-05T10:00:00+08:00','2026-10-05T11:00:00+08:00',{eventType:'outOfOffice'}),KL),null);
  assert.equal(eventToBlock(ev('2026-10-05T08:00:00+08:00','2026-10-05T23:00:00+08:00'),KL),null,'over 12 hours');
});

test('an event past midnight is cut at midnight', () => {
  const b=eventToBlock(ev('2026-10-05T23:00:00+08:00','2026-10-06T01:00:00+08:00'),KL);
  assert.equal(b.start_min,23*60);assert.equal(b.mins,60);
});

test('keywords sort titles when Gemini is unavailable', () => {
  assert.equal(titleKey('MA1521  Lecture'),'ma#### lecture');
  assert.equal(keywordKind('MA1521 Lecture'),'study');
  assert.equal(keywordKind('CS2040S'),'study','a bare course code is study');
  assert.equal(keywordKind('Shift @ Starbucks'),'work');
  assert.equal(keywordKind('Dinner w/ Mei'),'social');
  assert.equal(keywordKind('Gym - legs'),'exercise');
  assert.equal(keywordKind('Dentist'),'errands');
  assert.equal(keywordKind('Pottery'),'other');
});

test('two-way: a weekly block becomes one event per week, let-go weeks left out', () => {
  const b={id:'b1',date:'2026-09-28',start_min:600,mins:120,title:'Linear algebra',cat:'study',repeat:true,skipped:false,
           skipped_on:['2026-10-12'],except_on:['2026-10-19']};
  assert.deepEqual(occurrencesBetween(b,'2026-10-04','2026-10-31'),['2026-10-05','2026-10-26']);
  const e=eventFor(b,'2026-10-05',KL);
  assert.equal(e.key,'b1|2026-10-05');
  assert.deepEqual(e.body.start,{dateTime:'2026-10-05T10:00:00',timeZone:KL});
  assert.deepEqual(e.body.end,{dateTime:'2026-10-05T12:00:00',timeZone:KL});
  assert.deepEqual(occurrencesBetween({...b,repeat:false,date:'2026-10-07',skipped:true},'2026-10-04','2026-10-31'),[]);
});
