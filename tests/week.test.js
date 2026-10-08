// Earlier days are settled; the evening asks about at most two of today's activities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plans, TODAY, addDays, isDone } from '../src/plan.js';
import { ANSWERS, eveningAsks } from '../src/readings.js';

const b=(date,extra={})=>({id:Math.random(),date,start:600,mins:60,cat:'study',title:'x',skipped:false,done:false,...extra});

test('earlier days count as done unless let go; today waits for Done', () => {
  assert.equal(isDone(b(addDays(TODAY,-1))),true);
  assert.equal(isDone(b(addDays(TODAY,-1),{skipped:true})),false);
  assert.equal(isDone(b(TODAY)),false);
  assert.equal(isDone(b(TODAY,{done:true})),true);
  assert.equal(isDone(b(addDays(TODAY,1))),false);
});

test('the evening asks about the least-known kinds, one per kind, longest first, two at most', t => {
  t.mock.method(Math,'random',()=>0);   // every chance passes
  const day=[
    {id:1,date:TODAY,start:480,mins:120,cat:'study',title:'Lecture'},
    {id:2,date:TODAY,start:600,mins:90,cat:'study',title:'Lab'},
    {id:3,date:TODAY,start:720,mins:240,cat:'work',title:'Café shift'},
    {id:4,date:TODAY,start:1020,mins:60,cat:'exercise',title:'Gym'},
    {id:5,date:TODAY,start:1100,mins:20,cat:'social',title:'Quick call'},     // under 30 minutes: never asked
  ];
  plans.load('me',day);
  const old=n=>Array.from({length:n},(_,i)=>({date:addDays(TODAY,-1-i),start:600,mins:60,answer:'okay',blockId:null}));
  ANSWERS.me=[...old(12).map(a=>({...a,cat:'study'})),...old(2).map(a=>({...a,cat:'work'}))];
  const asks=eveningAsks('me',plans.on('me',TODAY));
  assert.deepEqual(asks.map(x=>x.title),['Gym','Café shift']);
  // one already answered today leaves room for one more
  ANSWERS.me.push({date:TODAY,start:1020,mins:60,cat:'exercise',answer:'light',blockId:4});
  assert.deepEqual(eveningAsks('me',plans.on('me',TODAY)).map(x=>x.title),['Café shift']);
});
