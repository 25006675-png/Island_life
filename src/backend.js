import { createClient } from '@supabase/supabase-js';
import { SLOT_IDS } from './data.js';
import { TODAY, addDays, daysBetween, iso } from './plan.js';

// Everything that talks to Supabase. The rest of the app keeps the demo's
// data shapes; this file turns rows into those shapes and changes back into
// rows. Without VITE_SUPABASE_URL the app runs as the demo only.
const URL=import.meta.env.VITE_SUPABASE_URL, KEY=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const VAPID=import.meta.env.VITE_VAPID_PUBLIC_KEY;
export const configured=!!(URL&&KEY);
export const db=configured?createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
const TZ=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
const islandOf=slot=>SLOT_IDS[slot-1];
const minuteOf=d=>d.getHours()*60+d.getMinutes();
const must=({data,error})=>{if(error)throw error;return data;};
let onError=()=>{};
export const reportErrorsTo=f=>{onError=f;};
const quietly=p=>p.then(r=>{if(r?.error)throw r.error;return r?.data;}).catch(e=>{console.error(e);onError(e);return null;});

// ---- accounts ------------------------------------------------------------------
export async function currentUser(){
  if(!db)return null;
  const {data}=await db.auth.getSession();
  return data.session?.user??null;
}
export const signIn=(email,password)=>db.auth.signInWithPassword({email,password});
export const signUp=(email,password,name)=>db.auth.signUp({email,password,options:{data:{name},emailRedirectTo:location.origin+location.pathname}});
export const signInWithGoogle=()=>db.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname}});
export const resetPassword=email=>db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
export const signOut=()=>db.auth.signOut();
export async function profile(uid){
  const p=must(await db.from('profiles').select('id,name,timezone,created_at').eq('id',uid).single());
  if(p.timezone!==TZ)await db.from('profiles').update({timezone:TZ}).eq('id',uid);
  return p;
}
export const rename=(uid,name)=>quietly(db.from('profiles').update({name}).eq('id',uid));

// ---- skies -------------------------------------------------------------------------
export async function mySky(uid){
  const m=must(await db.from('sky_members').select('sky_id,slot').eq('user_id',uid).maybeSingle());
  if(!m)return null;
  return must(await db.from('skies').select('id,invite_code,timezone').eq('id',m.sky_id).single());
}
export const createSky=async()=>must(await db.rpc('create_sky',{tz:TZ}));
export const joinSky=async code=>must(await db.rpc('join_sky',{code}));
export const leaveSky=async()=>must(await db.rpc('leave_sky'));
export const inviteLink=code=>`${location.origin}${location.pathname}?join=${code}`;

// ---- rows <-> the app's shapes ---------------------------------------------------------
const toBlock=r=>({id:r.id,date:r.date,start:r.start_min,mins:r.mins,cat:r.cat,title:r.title??'',vis:r.vis,priority:r.priority??'normal',
  repeat:r.repeat,skipped:r.skipped,done:r.done,skippedOn:r.skipped_on??[],doneOn:r.done_on??[],exceptOn:r.except_on??[],
  source:r.source??'island',keptCat:!!r.kept_cat});
const fromBlock=b=>({date:b.date,start_min:Math.round(b.start),mins:Math.round(b.mins),cat:b.cat,title:b.title.slice(0,120),vis:b.vis,
  priority:b.priority,repeat:b.repeat,skipped:b.skipped,done:b.done,skipped_on:b.skippedOn,done_on:b.doneOn,except_on:b.exceptOn,kept_cat:!!b.keptCat});
const localDay=ts=>iso(new Date(ts));

async function signed(paths){
  const list=[...new Set(paths.filter(Boolean))];
  if(!list.length)return {};
  const {data}=await db.storage.from('moments').createSignedUrls(list,60*60*12);
  return Object.fromEntries((data??[]).filter(d=>d.signedUrl).map(d=>[d.path,d.signedUrl]));
}

// Everything the world needs for one signed-in student and their sky.
export async function loadWorld(user,sky){
  const uid=user.id;
  const members=must(await db.from('sky_members').select('user_id,slot').eq('sky_id',sky.id).order('slot'));
  const profiles=must(await db.from('profiles').select('id,name').in('id',members.map(m=>m.user_id)));
  const nameOf=Object.fromEntries(profiles.map(p=>[p.id,p.name||'A friend']));
  const people=members.map(m=>({id:islandOf(m.slot),userId:m.user_id,slot:m.slot,name:nameOf[m.user_id]??'A friend'}));
  const byUser=Object.fromEntries(people.map(p=>[p.userId,p.id]));
  const me=byUser[uid];
  const from=addDays(TODAY,-49), weekAgo=addDays(TODAY,-8);

  const [mine,friends,answers,checkins,status,notes,gate,tasks,joins,moments,golden,connection,bought,dew]=await Promise.all([
    db.from('blocks').select('*').eq('owner',uid).or(`date.gte.${from},repeat.eq.true`),
    db.rpc('sky_blocks',{from_date:addDays(TODAY,-8),to_date:addDays(TODAY,14)}),
    db.from('drain_answers').select('block_id,occurred_on,start_min,mins,cat,answer').order('occurred_on'),
    db.from('checkins').select('id,owner,at,local_date,minute,mood,photo_path').gte('local_date',addDays(TODAY,-60)).order('at'),
    db.from('island_status').select('user_id,sink,strain'),
    db.from('notes').select('id,from_id,to_id,text,created_at,read_at').order('created_at'),
    db.rpc('gate_notes'),
    db.from('tasks').select('*').gte('created_at',new Date(Date.now()-14*864e5).toISOString()).order('created_at',{ascending:false}),
    db.from('task_members').select('task_id,user_id,joined_at,done_at,photo_path'),
    db.from('moments').select('*').gte('created_at',new Date(Date.now()-36*36e5).toISOString()).order('created_at'),
    db.from('golden_windows').select('local_date,opens_at').eq('local_date',TODAY).maybeSingle(),
    db.from('calendar_connections').select('*').maybeSingle(),
    db.from('purchases').select('user_id,item'),
    db.rpc('dew_balance'),
  ]).then(rs=>rs.map(must));

  const blocks={[me]:mine.map(toBlock)};
  for(const r of friends){const id=byUser[r.owner];if(id)(blocks[id]??=[]).push(toBlock(r));}
  const firstDate=mine.reduce((a,b)=>!a||b.date<a?b.date:a,null);

  const lanterns={};
  for(const c of checkins){
    const id=byUser[c.owner];if(!id)continue;
    const day=daysBetween(c.local_date,TODAY);if(id!==me&&day>7)continue;
    (lanterns[id]??=[]).push({day,mood:c.mood,time:c.minute,photoPath:c.photo_path});
  }
  const paths=[...checkins.map(c=>c.photo_path),...joins.map(j=>j.photo_path),...moments.map(m=>m.photo_path)];
  const urls=await signed(paths);
  for(const list of Object.values(lanterns))for(const l of list)l.photo=urls[l.photoPath]??null;

  // notes: words for the ones you sent or received; just who-for-whom for the rest
  const noteList=notes.map(n=>({id:n.id,from:byUser[n.from_id],to:byUser[n.to_id],text:n.text,day:daysBetween(localDay(n.created_at),TODAY),read:!!n.read_at}))
    .filter(n=>n.from&&n.to);
  for(const g of gate)if(g.from_id!==uid&&g.to_id!==uid&&byUser[g.from_id]&&byUser[g.to_id])
    noteList.push({from:byUser[g.from_id],to:byUser[g.to_id],text:'',day:daysBetween(localDay(g.created_at),TODAY),read:g.is_read});

  const taskList=tasks.map(t=>{
    const js=joins.filter(j=>j.task_id===t.id&&byUser[j.user_id]);
    return {id:t.id,title:t.title,cat:t.cat,mins:t.mins,by:t.posted_by?byUser[t.posted_by]??null:null,reward:t.reward,
            joined:js.map(j=>byUser[j.user_id]),done:Object.fromEntries(js.filter(j=>j.done_at).map(j=>[byUser[j.user_id],urls[j.photo_path]??null]))};
  });
  const momentList=moments.filter(m=>byUser[m.owner]&&localDay(m.created_at)===TODAY)
    .map(m=>({id:m.id,member:byUser[m.owner],src:urls[m.photo_path],at:minuteOf(new Date(m.created_at)),caption:m.caption,golden:m.golden}))
    .filter(m=>m.src);

  return {
    me,uid,sky,people,byUser,blocks,started:firstDate,
    answers:answers.map(a=>({date:a.occurred_on,start:a.start_min,mins:a.mins,cat:a.cat,answer:a.answer,blockId:a.block_id})),
    checkins:lanterns,
    status:Object.fromEntries(status.filter(s=>byUser[s.user_id]).map(s=>[byUser[s.user_id],{sink:s.sink,strain:s.strain}])),
    notes:noteList,tasks:taskList,moments:momentList,
    golden:golden?{opensAt:Date.parse(golden.opens_at)}:null,
    connection,
    purchases:bought.filter(b=>byUser[b.user_id]).map(b=>({member:byUser[b.user_id],item:b.item})),dew,
  };
}

// ---- writing ----------------------------------------------------------------------------
// The plan store's writer (plan.js persistTo). Inserts resolve to the new id;
// an update or removal that arrives first waits for its insert.
export function planWriter(){
  const inserting=new Map();
  const idOf=async b=>inserting.has(b)?await inserting.get(b):b.id;
  return {
    add(b){
      const p=db.from('blocks').insert(fromBlock(b)).select('id').single()
        .then(({data,error})=>{if(error)throw error;return data.id;})
        .catch(e=>{console.error(e);onError(e);return null;})
        .finally(()=>inserting.delete(b));
      inserting.set(b,p);return p;
    },
    async update(b){const id=await idOf(b);if(typeof id==='string')quietly(db.from('blocks').update(fromBlock(b)).eq('id',id));},
    async remove(b){const id=await idOf(b);if(typeof id==='string')quietly(db.from('blocks').delete().eq('id',id));},
  };
}

export function saveAnswer(a){
  quietly(db.from('drain_answers').insert({block_id:typeof a.blockId==='string'?a.blockId:null,occurred_on:a.date,start_min:Math.round(a.start),
    mins:Math.round(a.mins),cat:a.cat,answer:a.answer}));
  if(typeof a.blockId==='string')quietly(db.from('prompts').update({answered_at:new Date().toISOString()})
    .eq('kind','drain').eq('block_id',a.blockId).eq('occurred_on',a.date));
}

const dataUrlToBlob=async url=>(await fetch(url)).blob();
async function upload(sky,uid,dataUrl){
  const path=`${sky}/${uid}/${crypto.randomUUID()}.jpg`;
  must(await db.storage.from('moments').upload(path,await dataUrlToBlob(dataUrl),{contentType:'image/jpeg'}));
  return path;
}

export async function saveCheckin(w,{mood,minute,photo}){
  const photo_path=photo?await upload(w.sky.id,w.uid,photo).catch(e=>{onError(e);return null;}):null;
  quietly(db.from('checkins').insert({local_date:TODAY,minute:Math.round(minute),mood,photo_path}));
  quietly(db.from('prompts').update({answered_at:new Date().toISOString()}).eq('kind','mood').eq('occurred_on',TODAY));
}

// what friends see: published by the owner's own app, never hours or titles
let lastStatus='';
export function publishStatus(w,sink,strain){
  const s={sink:Math.round(sink*1000)/1000,strain:Math.round(strain*1000)/1000}, key=JSON.stringify(s);
  if(key===lastStatus)return;lastStatus=key;
  quietly(db.from('island_status').upsert({user_id:w.uid,...s,updated_at:new Date().toISOString()}));
}

export const sendNote=(w,toIsland,text)=>quietly(db.from('notes').insert({to_id:w.people.find(p=>p.id===toIsland).userId,text}).select('id').single());
export const markNotesRead=w=>quietly(db.from('notes').update({read_at:new Date().toISOString()}).eq('to_id',w.uid).is('read_at',null));

export const postTask=(w,{title,cat,mins,reward})=>quietly(db.from('tasks').insert({sky_id:w.sky.id,title,cat,mins,reward,posted_by:w.uid}).select('id').single());
export const joinTask=id=>quietly(db.from('task_members').insert({task_id:id}));
export const finishTask=(w,id)=>quietly(db.from('task_members').update({done_at:new Date().toISOString()}).eq('task_id',id).eq('user_id',w.uid));
export async function taskPhoto(w,id,dataUrl){
  const path=await upload(w.sky.id,w.uid,dataUrl).catch(e=>{onError(e);return null;});
  if(path)quietly(db.from('task_members').update({photo_path:path}).eq('task_id',id).eq('user_id',w.uid));
}

// hang a photo; the server decides whether it lands inside the golden window
export async function hangMoment(w,{dataUrl,caption}){
  try{
    const path=await upload(w.sky.id,w.uid,dataUrl);
    return must(await db.from('moments').insert({local_date:TODAY,minute:minuteOf(new Date()),caption:caption.slice(0,80),photo_path:path}).select('id,golden').single());
  }catch(e){onError(e);return null;}
}

// ---- the dewdrop shop: the server counts what you've earned and checks every purchase
export const dewBalance=()=>quietly(db.rpc('dew_balance'));
export async function buy(item){
  const {error}=await db.rpc('buy',{item_id:item});
  return error?{error:/not enough/.test(error.message)?'short':/already/.test(error.message)?'owned':'failed'}:{ok:true};
}

// ---- live updates from the sky ------------------------------------------------------------
export function listen(w,handlers){
  const ch=db.channel(`sky-${w.sky.id}`);
  const on=(table,event,f)=>ch.on('postgres_changes',{event,schema:'public',table},p=>f(p.new,p.old));
  on('island_status','*',r=>w.byUser[r.user_id]&&r.user_id!==w.uid&&handlers.status?.(w.byUser[r.user_id],r));
  on('checkins','INSERT',async r=>{
    if(r.owner===w.uid||!w.byUser[r.owner])return;
    const urls=await signed([r.photo_path]);
    handlers.checkin?.(w.byUser[r.owner],{day:daysBetween(r.local_date,TODAY),mood:r.mood,time:r.minute,photo:urls[r.photo_path]??null});
  });
  on('notes','INSERT',r=>r.to_id===w.uid&&handlers.note?.({id:r.id,from:w.byUser[r.from_id],to:w.byUser[r.to_id],text:r.text,day:0,read:false}));
  on('moments','INSERT',async r=>{
    if(r.owner===w.uid||!w.byUser[r.owner])return;
    const urls=await signed([r.photo_path]);
    handlers.moment?.({id:r.id,member:w.byUser[r.owner],src:urls[r.photo_path],at:minuteOf(new Date(r.created_at)),caption:r.caption,golden:r.golden});
  });
  on('golden_windows','*',r=>r?.local_date===TODAY&&handlers.golden?.({opensAt:Date.parse(r.opens_at)}));
  on('tasks','INSERT',r=>r.posted_by!==w.uid&&handlers.task?.({id:r.id,title:r.title,cat:r.cat,mins:r.mins,by:r.posted_by?w.byUser[r.posted_by]??null:null,reward:r.reward,joined:[],done:{}}));
  on('task_members','*',async r=>{
    if(!r||r.user_id===w.uid||!w.byUser[r.user_id])return;
    const urls=await signed([r.photo_path]);
    handlers.taskMember?.(r.task_id,w.byUser[r.user_id],r.done_at?urls[r.photo_path]??null:undefined);
  });
  on('purchases','INSERT',r=>r.user_id!==w.uid&&w.byUser[r.user_id]&&handlers.purchase?.(w.byUser[r.user_id],r.item));
  on('sky_members','INSERT',()=>handlers.membersChanged?.());
  ch.subscribe();
  return ()=>db.removeChannel(ch);
}

// ---- Google Calendar --------------------------------------------------------------------------
const fn=async(name,body)=>{
  const {data,error}=await db.functions.invoke(name,{body:body??{}});
  if(error)throw error;return data;
};
const here=()=>location.origin+location.pathname;
export const calendar={
  connection:async()=>must(await db.from('calendar_connections').select('*').maybeSingle()),
  async connect(write=false){const {url}=await fn('google-calendar/start',{return_to:here(),write});location.href=url;},
  sync:()=>fn('google-calendar/sync'),
  async setWrite(write){const r=await fn('google-calendar/settings',{write,return_to:here()});if(r.url){location.href=r.url;return null;}return r;},
  disconnect:()=>fn('google-calendar/disconnect'),
  reloadMine:async uid=>must(await db.from('blocks').select('*').eq('owner',uid).or(`date.gte.${addDays(TODAY,-49)},repeat.eq.true`)).map(toBlock),
};

// ---- the gardener's words ---------------------------------------------------------------------------
export async function gardenerLine(mode,facts,fallback){
  try{return (await fn('gardener',{mode,facts,fallback})).line||fallback;}catch{return fallback;}
}
// Gemini's own idea from a summary of the week; null means use the app's own ideas
export async function gardenerIdea(summary){
  try{return (await fn('gardener',summary)).idea??null;}catch{return null;}
}

// ---- phone prompts ----------------------------------------------------------------------------------------
export const pushSupported=()=>configured&&!!VAPID&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const keyBytes=b64=>Uint8Array.from(atob((b64+'='.repeat((4-b64.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function pushState(){
  if(!pushSupported())return 'unsupported';
  if(Notification.permission==='denied')return 'denied';
  const reg=await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription())?'on':'off';
}
export async function enablePush(){
  const reg=await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  if(await Notification.requestPermission()!=='granted')return false;
  const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(VAPID)});
  const j=sub.toJSON();
  must(await db.from('push_subscriptions').upsert({endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth}));
  return true;
}
export async function disablePush(){
  const sub=await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if(!sub)return;
  await db.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);
  await sub.unsubscribe();
}
