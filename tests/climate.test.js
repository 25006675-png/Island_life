// The mechanism in docs/algorithm.md, checked number by number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshClimate, worn, predict, learn, normalWeek, loadOf, sinkOf, dayForecast, link,
         gardenerMode, askChance, PRIOR, ANSWER, NORMAL } from '../src/climate.js';

const day=(n)=>{const d=new Date(Date.UTC(2026,9,5+n));return d.toISOString().slice(0,10);};   // day(0) = Mon 5 Oct 2026
const dayNum=iso=>Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))/864e5;
const block=(n,start,mins,cat,extra={})=>({date:day(n),start,mins,cat,skipped:false,...extra});
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≈ ${b}`);

test('a typical stretch is not worn; a heavy one is, a quiet one the other way', () => {
  const c=freshClimate();
  // 30 ordinary hours a week = 30/7 h a day of study at cost 1
  const typical=[];for(let n=-14;n<0;n++)typical.push(block(n,9*60,Math.round(30/7*60),'study'));
  near(worn(typical,dayNum(day(0)),30,c),0,.06);
  const heavy=typical.map(b=>({...b,mins:b.mins*2}));
  assert.ok(worn(heavy,dayNum(day(0)),30,c)>.8);
  assert.equal(worn([],dayNum(day(0)),30,c),-.5,'an empty fortnight bottoms out at -0.5');
});

test('prediction = cost × (1 + sensitivity × worn)', () => {
  const c=freshClimate();
  near(predict(c,'study',0),1);
  near(predict(c,'study',.6),1.3);
  near(predict(c,'rest',0),.15);
});

test('answers teach the island: study that keeps feeling draining costs more', () => {
  const occ=[], answers=[];
  for(let n=0;n<10;n++){occ.push(block(n,9*60,120,'study'));answers.push({date:day(n),start:9*60,mins:120,cat:'study',answer:'draining'});}
  const c=learn(answers,occ,30);
  assert.ok(c.cost.study>1.4,`study cost rose to ${c.cost.study}`);
  assert.equal(c.cost.social,PRIOR.social,'kinds never answered keep their starting value');
  assert.equal(c.n.study,10);
});

test('the first answer moves the cost by one sixth of the error', () => {
  const c=learn([{date:day(0),start:600,mins:60,cat:'errands',answer:'draining'}],[block(0,600,60,'errands')],30);
  // nothing before it, so worn = -0.5 and the prediction is 0.6 × 0.75 = 0.45
  const w=-.5, p=PRIOR.errands*(1+.5*w), g=1+.5*w;
  near(c.cost.errands,PRIOR.errands+(ANSWER.draining-p)*g/6);
});

test('a bad day is not a bad activity: shared error is halved', () => {
  const occ=[block(0,9*60,60,'study'),block(0,14*60,60,'social')];
  const both=[{date:day(0),start:9*60,mins:60,cat:'study',answer:'draining'},{date:day(0),start:14*60,mins:60,cat:'social',answer:'draining'}];
  const alone=learn([both[0]],[occ[0]],30), together=learn(both,occ,30);
  assert.ok(together.cost.study<alone.cost.study,'study learns less when the whole day felt heavy');
});

test('costs stay inside their bounds', () => {
  const occ=[],answers=[];
  for(let n=0;n<60;n++){occ.push(block(n%14,8*60+n,30,'rest'));answers.push({date:day(n%14),start:8*60+n,mins:30,cat:'rest',answer:'draining'});}
  const c=learn(answers,occ,30);
  assert.ok(c.cost.rest<=2.5&&c.sensitivity<=1.5&&c.sensitivity>=0);
});

test('recovery speed is picked from three once there are eight answers', () => {
  const occ=[],answers=[];
  for(let n=0;n<12;n++){occ.push(block(n,10*60,90,'work'));answers.push({date:day(n),start:10*60,mins:90,cat:'work',answer:n%3?'okay':'draining'});}
  assert.ok([2,3.5,5].includes(learn(answers,occ,30).halfLife));
  assert.equal(learn(answers.slice(0,7),occ,30).halfLife,3.5,'fewer than eight answers keep the middle speed');
});

test('your normal week: a running average, newest weighing 0.4, within 10-45', () => {
  assert.equal(normalWeek([]),NORMAL.start);
  near(normalWeek([20,30]),24);
  assert.equal(normalWeek([80,90]),45,'too much never becomes normal');
  assert.equal(normalWeek([2,3]),10);
});

test('altitude: half your normal week is high, your normal is mid-sky, 1.5× is the cloud sea', () => {
  assert.equal(sinkOf({week:15,normal:30}),0);
  near(sinkOf({week:30,normal:30}),.5);
  assert.equal(sinkOf({week:45,normal:30}),1);
  assert.equal(sinkOf({week:20,normal:45,hours:56}),.85,'55 planned hours sink the island whatever the ratio');
  assert.equal(sinkOf({week:20,normal:45,late:4}),.85,'so do four late nights');
});

test('week load uses answers where given and predictions elsewhere', () => {
  const c=freshClimate(), week=[block(0,9*60,120,'study',{drain:1.6}),block(1,9*60,60,'rest'),block(2,9*60,60,'social',{skipped:true})];
  const load=loadOf(week,[],30,c);
  near(load,2*1.6+predict(c,'rest',-.5));
});

test('forecast labels a day against a typical busy day (normal week ÷ 5)', () => {
  assert.equal(dayForecast(3,30).label,'light');
  assert.equal(dayForecast(6,30).label,'usual');
  assert.equal(dayForecast(10,30).label,'heavy');
  assert.equal(dayForecast(11,30).label,'very heavy');
});

test('the link is shrunk while there are few days, and unknown below seven', () => {
  assert.equal(link([[0,1],[1,2]]),null);
  const pairs=[];for(let i=0;i<10;i++)pairs.push([i/10,i]);
  near(link(pairs),.5);                       // perfect correlation × 10/(10+10)
  assert.equal(link(Array.from({length:8},()=>[.5,1])),0);
});

test('the gardener offers the help that fits, never a reason', () => {
  assert.equal(gardenerMode({sink:.2,strain:.3,link:.5,rainyDays:14}),'support');
  assert.equal(gardenerMode({sink:.2,strain:.7,link:.05}),'rest','light week, heavy sky: not the schedule');
  assert.equal(gardenerMode({sink:.2,strain:.7,link:null}),'rest');
  assert.equal(gardenerMode({sink:.8,strain:.7,link:.5}),'schedule');
  assert.equal(gardenerMode({sink:.8,strain:.7,link:.05}),'rest','schedule fixes have not tracked this student');
  assert.equal(gardenerMode({sink:.3,strain:.1,link:.5,heavyAhead:true}),'schedule');
  assert.equal(gardenerMode({sink:.4,strain:.3,link:.5}),null,'nothing to say');
});

test('the island asks less as it learns, and never stops checking', () => {
  near(askChance(0,0),1);
  near(askChance(3,0),.5);
  assert.equal(askChance(400,0),.15);
  assert.ok(askChance(8,.8)>askChance(8,0),'an unusual stretch is worth asking about');
});
