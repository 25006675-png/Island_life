// The gardener's idea from Gemini is shown only if it picks from what the app offered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIdea } from '../supabase/functions/_shared/idea.ts';

const offered={slots:3,canWait:1,friends:['Ben','Chen']};
const line='A slow walk by the water might be just right before a busy Thursday.';

test('an idea that uses an offered free time comes through, tidied', () => {
  assert.deepEqual(checkIdea({type:'add',title:'  Walk by the water ',cat:'exercise',mins:38,slot:2,friend:'',line,button:'Add the walk'},offered),
    {type:'add',title:'Walk by the water',cat:'exercise',mins:45,slot:2,friend:'',line,button:'Add the walk'});
  assert.equal(checkIdea({type:'add',title:'Tea with Ben',cat:'social',mins:60,slot:0,friend:'Ben',line},offered).button,'Add it to my plan');
});

test('a move must name a block that can wait', () => {
  assert.deepEqual(checkIdea({type:'move',move:0,line},offered),{type:'move',move:0,line});
  assert.equal(checkIdea({type:'move',move:1,line},offered),null);
  assert.equal(checkIdea({type:'move',move:0,line},{...offered,canWait:0}),null);
});

test('anything outside the offer is dropped', () => {
  const ok={type:'add',title:'Early night',cat:'rest',mins:60,slot:0,line};
  assert.equal(checkIdea({...ok,slot:3},offered),null,'a free time that was never offered');
  assert.equal(checkIdea({...ok,slot:1.5},offered),null);
  assert.equal(checkIdea({...ok,cat:'study'},offered),null,'never more study or work');
  assert.equal(checkIdea({...ok,title:'x'},offered),null);
  assert.equal(checkIdea({...ok,title:'A very long title that goes on and on and on'},offered),null);
  assert.equal(checkIdea({...ok,line:'Hi'},offered),null);
  assert.equal(checkIdea({...ok,type:'cancel'},offered),null);
  assert.equal(checkIdea(null,offered),null);
  assert.equal(checkIdea('walk',offered),null);
});

test('only friends in the sky are named; length stays between 15 and 90 minutes', () => {
  const ok={type:'add',title:'Tea together',cat:'social',slot:0,line};
  assert.equal(checkIdea({...ok,friend:'Someone else'},offered).friend,'');
  assert.equal(checkIdea({...ok,mins:300},offered).mins,90);
  assert.equal(checkIdea({...ok,mins:2},offered).mins,15);
});
