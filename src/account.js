import * as backend from './backend.js';
import { demoWorld, enterWorld } from './world.js';

// The sign-in card: sign in or make an account (email, or Google), start or
// join a sky, or open the demo. It shows nothing personal until someone has
// signed in. Without a backend configured, it is the demo's card only. On the welcome page, handoff(kind) is
// called instead of loading the world there: 'live' once a sky is chosen (the session is saved, and the app
// opens that sky), or 'demo'.
const el=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);e.append(...kids);return e;};
const field=(label,props)=>{const input=el('input',props);return [el('label',{},label,input),input];};
const JOIN_KEY='island-join';

export function createAccount({form,enter,handoff}){
  let main=()=>{};                             // what Enter does on the current card
  const demo=()=>handoff?handoff('demo'):enter(demoWorld());
  if(!backend.configured){
    form.onsubmit=e=>{e.preventDefault();demo();};
    form.querySelector('#login-guest').onclick=demo;
    return {enterKey:demo};
  }
  // an invite link (?join=CODE) is remembered through a Google sign-in round trip
  const fromLink=new URLSearchParams(location.search).get('join');
  try{if(fromLink)sessionStorage.setItem(JOIN_KEY,fromLink.toUpperCase());}catch{}
  const pendingCode=()=>{try{return sessionStorage.getItem(JOIN_KEY)??'';}catch{return '';}};
  const status=el('p',{className:'login-status',role:'alert'});
  const say=(text,good=false)=>{status.textContent=text;status.classList.toggle('good',good);};
  const busy=(button,text)=>{button.disabled=true;button.dataset.label=button.textContent;button.textContent=text;
    return ()=>{button.disabled=false;button.textContent=button.dataset.label;};};
  const card=(title,lede,...kids)=>{
    form.replaceChildren(el('h2',{id:'login-form-title',textContent:title}),el('p',{textContent:lede}),...kids,status);say('');
    form.querySelector('input')?.focus({preventScroll:true});
  };
  const guest=()=>{const b=el('button',{type:'button',className:'text-button',textContent:'Try the demo island'});b.onclick=demo;return b;};

  function signInCard(mode='in'){
    const up=mode==='up';
    const [nameRow,name]=field('Your name',{type:'text',maxLength:40,autocomplete:'given-name',placeholder:'What friends call you'});
    const [emailRow,email]=field('Email',{type:'email',required:true,autocomplete:'username',placeholder:'you@example.com'});
    const [pwRow,pw]=field('Password',{type:'password',required:true,minLength:8,autocomplete:up?'new-password':'current-password',placeholder:'••••••••'});
    const go=el('button',{type:'submit',className:'solid',textContent:up?'Create your island':'Sign in'});
    const google=el('button',{type:'button',className:'google-button'},el('span',{className:'g',ariaHidden:'true',textContent:'G'}),'Continue with Google');
    const swap=el('button',{type:'button',className:'text-button',textContent:up?'Already have an island? Sign in':'New here? Make your island'});
    const forgot=el('button',{type:'button',className:'text-button small',textContent:'Forgot your password?'});
    card(up?'Make your island':'Visit your island',up?'An island for your week, and a sky to share with up to four friends.':'Sign in to see what grew while you were away.',
         ...(up?[nameRow]:[]),emailRow,pwRow,go,google,el('div',{className:'login-links'},swap,...(up?[]:[forgot])),guest());
    swap.onclick=()=>signInCard(up?'in':'up');
    google.onclick=async()=>{busy(google,'Opening Google…');const {error}=await backend.signInWithGoogle();if(error)say(error.message);};
    forgot.onclick=async()=>{
      if(!email.value){email.focus();say('Type your email first.');return;}
      const {error}=await backend.resetPassword(email.value.trim());
      say(error?error.message:'If that email has an island, a link to reset the password is on its way.',!error);
    };
    main=()=>form.requestSubmit();
    form.onsubmit=async e=>{
      e.preventDefault();
      const done=busy(go,up?'Making your island…':'Signing in…');
      const {data,error}=up?await backend.signUp(email.value.trim(),pw.value,name.value.trim())
                           :await backend.signIn(email.value.trim(),pw.value);
      done();
      if(error){say(error.message==='Invalid login credentials'?'That email and password don’t match an island.':error.message);return;}
      if(!data.session){say('Check your email to confirm, then sign in.',true);signInCard('in');return;}
      afterSignIn(data.session.user);
    };
  }

  async function afterSignIn(user){
    form.onsubmit=e=>e.preventDefault();
    card('Opening your sky','One moment…');
    try{
      const profile=await backend.profile(user.id);
      const sky=await backend.mySky(user.id);
      if(sky)welcomeCard(user,profile,sky);else skyCard(user,profile);
    }catch(e){console.error(e);say('We couldn’t reach your island. Check your connection and try again.');signInCard();}
  }

  function skyCard(user,profile){
    const [codeRow,code]=field('Invite code from a friend',{type:'text',maxLength:12,autocomplete:'off',placeholder:'e.g. 7F3K9QXA',value:pendingCode()});
    const join=el('button',{type:'submit',className:'solid',textContent:'Join their sky'});
    const start=el('button',{type:'button',className:'solid-ghost',textContent:'Start a new sky'});
    const out=el('button',{type:'button',className:'text-button',textContent:'Sign out'});
    card(`Hello${profile.name?`, ${profile.name}`:''}`,'A sky is you and up to four friends. Join a friend’s with their code, or start one and share the link.',
         codeRow,join,el('p',{className:'login-or',textContent:'or'}),start,out);
    out.onclick=async()=>{await backend.signOut();signInCard();};
    start.onclick=async()=>{const done=busy(start,'Starting your sky…');try{const sky=await backend.createSky();open(user,sky);}catch(e){done();say(e.message);}};
    main=()=>form.requestSubmit();
    form.onsubmit=async e=>{
      e.preventDefault();if(!code.value.trim()){code.focus();return;}
      const done=busy(join,'Joining…');
      try{const sky=await backend.joinSky(code.value.trim());try{sessionStorage.removeItem(JOIN_KEY);}catch{}open(user,sky);}
      catch(e){done();say(/full/.test(e.message)?'That sky already has five islands.':/no sky/.test(e.message)?'No sky has that code. Check it with your friend.':e.message);}
    };
  }

  function welcomeCard(user,profile,sky){
    const go=el('button',{type:'submit',className:'solid',textContent:'Enter your island'});
    const out=el('button',{type:'button',className:'text-button',textContent:'Not you? Sign out'});
    card(`Welcome back${profile.name?`, ${profile.name}`:''}`,'Your island kept growing while you were away.',go,out);
    out.onclick=async()=>{await backend.signOut();signInCard();};
    main=()=>form.requestSubmit();
    form.onsubmit=e=>{e.preventDefault();busy(go,'Opening your sky…');open(user,sky);};
  }

  async function open(user,sky){
    if(handoff){handoff('live');return;}
    try{enter(enterWorld(await backend.loadWorld(user,sky)));}
    catch(e){console.error(e);say('Your sky didn’t load. Check your connection and try again.');afterSignIn(user);}
  }

  // a returning visitor (or one back from Google) starts signed in
  backend.currentUser().then(user=>user?afterSignIn(user):signInCard(fromLink?'up':'in'));
  backend.db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'&&session&&form.querySelector('#login-form-title')?.textContent==='Visit your island')afterSignIn(session.user);});
  return {enterKey:()=>main()};
}

// ---- in the world: your sky's invite, phone prompts, signing out ---------------------
export function mountSkyPanel(world,notice){
  const box=document.getElementById('sky-section');
  if(!world.live){box.hidden=true;return;}
  box.hidden=false;
  const link=backend.inviteLink(world.sky.invite_code);
  const count=world.people.length;
  const copy=el('button',{type:'button',className:'text-button',textContent:'Copy invite link'});
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(link);notice('Invite link copied. Send it to a friend.');}catch{prompt('Copy this invite link',link);}};
  const push=el('button',{type:'button',className:'text-button'});
  const showPush=async()=>{
    const s=await backend.pushState();
    push.hidden=s==='unsupported';
    push.textContent=s==='on'?'Turn off notifications':s==='denied'?'Notifications are blocked in your browser':'Get notifications on this device';
    push.disabled=s==='denied';
  };
  push.onclick=async()=>{
    try{
      if(await backend.pushState()==='on'){await backend.disablePush();notice('No more prompts on this device.');}
      else if(await backend.enablePush())notice('Your island will ask after activities, once in the evening, and ring when the golden window opens.');
    }catch(e){console.error(e);notice('Prompts couldn’t be turned on here.');}
    showPush();
  };
  const out=el('button',{type:'button',className:'text-button',textContent:'Sign out'});
  out.onclick=async()=>{await backend.signOut();location.href=location.pathname;};
  box.replaceChildren(el('h3',{textContent:'Your sky'}),
    el('p',{className:'panel-note',textContent:count<5?`${count} of 5 islands. Invite code ${world.sky.invite_code}.`:'All five islands are taken.'}),
    ...(count<5?[copy]:[]),push,out);
  showPush();
}
