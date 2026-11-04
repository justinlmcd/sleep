// SLEEP. Your nights arrive from Apple Health through the YOU watch app; Supabase stores them; this page shows them.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PAGE=1000;
const isoDay=d=>{ const x=new Date(d); return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10); };
// Today in your time zone, with your day running until the hour you chose in YOU's settings.
const today=()=>window.youSettings?window.youSettings.dayOf(Date.now()):isoDay(new Date());
const parseDay=s=>{ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const r1=n=>{ const v=Math.round(n*10)/10; return Number.isInteger(v)?String(v):v.toFixed(1); };

let client=null,user=null,busy=false,authSub=null,connecting=null,storageCleanup=null;
let nights=[],goalHours=8,loadId=0;

function message(id,text,kind=''){ $(id).textContent=text; $(id).className='message'+(kind?' '+kind:''); }

// ---- connection: the two public Supabase settings come from /api/config ----
function projectConfig(v){ const url=typeof v?.url==='string'?v.url.trim().replace(/\/$/,''):'', key=typeof v?.key==='string'?v.key.trim():''; if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error('This page needs its Supabase connection set up in Vercel.'); if(typeof v?.home==='string'&&/^https?:\/\//.test(v.home)) document.getElementById('home-link').href=v.home; { const sl=document.getElementById('settings-link'); if(sl) sl.href=v.home.replace(/\/+$/,'')+'/#settings'; } return {url,key}; }
// The house button goes to the YOU hub. Its address comes from URL_HOME in Vercel.
(function(){ const a=document.getElementById('home-link'); if(!a)return; a.addEventListener('click',e=>{ if(a.getAttribute('href')==='#'){ e.preventDefault(); alert('Set URL_HOME in this project\'s Vercel environment variables to your YOU hub address, then redeploy.'); } }); })();
async function connect(){
  if(client)return client; if(connecting)return connecting;
  connecting=(async()=>{ let r; try{ r=await fetch('/api/config',{cache:'no-store'}); }catch{ throw new Error('Could not connect. Check your internet connection and try again.'); }
    if(!r.ok) throw new Error('This page needs its Supabase connection set up in Vercel.'); return makeClient(projectConfig(await r.json())); })();
  try{ return await connecting; } finally{ connecting=null; }
}
function makeClient(config){
  if(!window.supabase) throw new Error('The connection library could not load. Reload the page.');
  const storageKey='sleep.auth.'+new URL(config.url).hostname, storage=window.localStorage;
  authSub?.unsubscribe(); client?.auth.stopAutoRefresh(); storageCleanup?.();
  client=supabase.createClient(config.url,config.key,{auth:{storage,storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const mine=client;
  authSub=client.auth.onAuthStateChange((_e,session)=>{ setTimeout(()=>{ if(client!==mine)return; setUser(session&&storage.getItem(storageKey)?session.user:null); },0); }).data.subscription;
  const changed=e=>{ if(client===mine&&e.storageArea===storage&&(e.key===storageKey||e.key===null)&&e.newValue===null)setUser(null); };
  window.addEventListener('storage',changed); storageCleanup=()=>window.removeEventListener('storage',changed);
  return client;
}
function setUser(next){
  if(next?.id===user?.id)return;
  user=next; loadId++;
  if(user&&client) window.youSettings?.sync(client);
  $('connect-open').hidden=!!user; $('sign-out').hidden=!user; $('goal-open').hidden=!user; $('csv-nights').hidden=!user; $('goal-fields').disabled=!user;
  $('connection-status').textContent=user?'Connected':'Your record'; $('connection-status').classList.toggle('connected',!!user);
  if(!user){ nights=[]; render(); $('nights-list').innerHTML='<p class="row-empty">Sign in to see your nights.</p>'; $('goal-dialog').close(); }
  else load();
  window.coachUser?.(user?.id);
}
$('connect-open').onclick=()=>{ $('connection-dialog').showModal(); $('email').focus(); };
$('connect-close').onclick=()=>{ if(!busy)$('connection-dialog').close(); };
$('connect-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy)return; busy=true; $('connect-submit').disabled=true; message('connect-message','Signing in…');
  try{ const db=await connect(); const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}); if(error)throw error; $('password').value=''; setUser(data.user); $('connection-dialog').close(); message('connect-message',''); }
  catch(err){ message('connect-message',err.message||'Could not sign in.','error'); }
  finally{ busy=false; $('connect-submit').disabled=false; }
});
$('sign-out').onclick=async()=>{ if(!client||busy)return; busy=true; try{ const {error}=await client.auth.signOut({scope:'local'}); if(error)throw error; setUser(null); }catch(err){ message('history-message',err.message,'error'); } finally{ busy=false; } };

// ---- reading all of it, and never some of it ----
async function readAll(make){ const all=[]; let from=0; for(;;){ const {data,error,count}=await make().range(from,from+PAGE-1); if(error)throw error; all.push(...data); from+=data.length; if(from>=count||!data.length)return all; } }
async function load(){
  const id=++loadId; message('history-message','');
  try{
    const db=await connect();
    const rows=await readAll(()=>db.from('sleep_nights').select('*',{count:'exact'}).order('night',{ascending:false}));
    const {data:goal}=await db.from('sleep_goals').select('goal_hours').maybeSingle();
    if(id!==loadId)return;
    nights=rows.map(r=>({...r,resting_hr:r.resting_hr==null?null:Number(r.resting_hr)})); goalHours=goal?Number(goal.goal_hours):8;
    render();
  }catch(err){ if(id!==loadId)return; const missing=/relation .* does not exist|schema cache/i.test(err.message||''); message('history-message',missing?'Run setup.sql in your Supabase SQL editor once, then reload.':(err.message||'Could not load your nights.'),'error'); }
}

// ---- derived ----
const hm=min=>min==null?'—':`${Math.floor(min/60)}h ${String(Math.round(min%60)).padStart(2,'0')}m`;
const clock=ts=>ts?new Date(ts).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'';
const shortDay=s=>parseDay(s).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});
const goalMin=()=>Math.round(goalHours*60);
// Minutes after 6pm, so 11:30pm and 12:30am sit next to each other when finding a usual bedtime.
const sinceSix=ts=>{ const d=new Date(ts); return ((d.getHours()-18+24)%24)*60+d.getMinutes(); };
const fromSix=m=>{ const d=new Date(); d.setHours(18,0,0,0); d.setMinutes(d.getMinutes()+Math.round(m)); return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); };
// The middle bedtime or wake time, and how far nights usually stray from it.
function usual(list,key){
  const v=list.map(r=>r[key]).filter(Boolean).map(sinceSix).sort((a,b)=>a-b); if(!v.length) return null;
  const mid=v[Math.floor(v.length/2)], spread=Math.round(v.reduce((a,x)=>a+Math.abs(x-mid),0)/v.length);
  return {time:fromSix(mid),spread};
}
const STAGES=[['deep_min','Deep','#5f6bff'],['core_min','Core','#9aa8ff'],['rem_min','REM','#c9a7ff'],['awake_min','Awake','#e6b36b']];

function render(){
  const last=nights[0], week=nights.slice(0,7), t=today();
  const avg=week.length?week.reduce((a,r)=>a+r.asleep_min,0)/week.length:null, met=week.filter(r=>r.asleep_min>=goalMin()).length;
  $('last-label').textContent=last?(last.night===t?'Last night':`Night ending ${shortDay(last.night)}`):'Last night';
  $('last-value').textContent=last?hm(last.asleep_min):'—';
  $('last-note').textContent=last?`${clock(last.bedtime)} → ${clock(last.wake_time)}${last.asleep_min>=goalMin()?' · goal met':` · ${hm(goalMin()-last.asleep_min)} under your goal`}`:'Your nights arrive from Apple Health through the YOU watch app.';
  $('side-last').textContent=last?hm(last.asleep_min):'—'; $('side-avg').textContent=avg!=null?hm(avg):'—';
  $('tile-avg').textContent=avg!=null?hm(avg):'—'; $('tile-avg-note').textContent=`goal ${hm(goalMin())}`;
  $('tile-goal').textContent=week.length?`${met} of ${week.length}`:'—';
  const bed=usual(nights.slice(0,14),'bedtime'), wake=usual(nights.slice(0,14),'wake_time');
  $('tile-bed').textContent=bed?bed.time:'—'; $('tile-bed-note').textContent=bed?`usually within ${bed.spread} min`:'last 14 nights';
  $('tile-wake').textContent=wake?wake.time:'—'; $('tile-wake-note').textContent=wake?`usually within ${wake.spread} min`:'last 14 nights';
  drawBars(); drawStages(last); renderNights();
}

// ---- bars: hours asleep, last 30 nights, with the goal as a dashed line ----
function drawBars(){
  const t=today(), days=Array.from({length:30},(_,i)=>{ const d=parseDay(t); d.setDate(d.getDate()-29+i); return isoDay(d); });
  const by=new Map(nights.map(r=>[r.night,r])), has=days.some(d=>by.has(d));
  $('bars-empty').hidden=has; $('bars').hidden=!has; $('goal-line').hidden=!has;
  if(!has){ $('bars').innerHTML=''; return; }
  const H=150, max=Math.max(goalMin()+60,...days.map(d=>by.get(d)?.asleep_min||0));
  $('bars').innerHTML=days.map((d,i)=>{ const r=by.get(d), h=r?Math.max(4,Math.round(r.asleep_min/max*H)):3;
    return `<div><b>${r&&i%5===4?r1(r.asleep_min/60):''}</b><i class="${r?(r.asleep_min>=goalMin()?'goal-hit':'goal-miss'):'zero'}" style="height:${h}px" title="${esc(shortDay(d))}: ${r?esc(hm(r.asleep_min)):'no data'}"></i><span>${i%5===4?esc(parseDay(d).toLocaleDateString([], {month:'short',day:'numeric'})):''}</span></div>`; }).join('');
  // The goal line sits at the goal's height, above the date labels.
  const label=$('bars').querySelector('span'), labelH=label?label.offsetHeight:14;
  $('goal-line').style.bottom=(labelH+6+Math.round(goalMin()/max*H))+'px'; $('goal-label').textContent=`goal ${hm(goalMin())}`;
  $('bars-sub').textContent=`Last 30 nights · ${days.filter(d=>by.has(d)).length} recorded`;
}

// ---- last night's stages ----
function drawStages(r){
  if(!r||r.deep_min==null){ $('stages-body').innerHTML=`<div class="chart-empty">${r?'No stages for this night. Stages need Sleep tracking on your Apple Watch.':'No nights yet.'}</div>`; return; }
  const total=STAGES.reduce((a,[k])=>a+(r[k]||0),0)||1;
  $('stages-sub').textContent=`${shortDay(r.night)} · ${clock(r.bedtime)} → ${clock(r.wake_time)}${r.resting_hr?` · resting HR ${Math.round(r.resting_hr)} bpm`:''}`;
  $('stages-body').innerHTML=`<div class="stages" role="img" aria-label="${STAGES.map(([k,l])=>`${l} ${hm(r[k]||0)}`).join(', ')}">${STAGES.map(([k,,c])=>`<i style="width:${(r[k]||0)/total*100}%;background:${c}"></i>`).join('')}</div><ul class="stage-legend">${STAGES.map(([k,l,c])=>`<li><i style="background:${c}"></i>${l}<b>${hm(r[k]||0)}</b></li>`).join('')}</ul>`;
}

// ---- nights ----
function renderNights(){
  $('nights-count').textContent=nights.length?`${nights.length} night${nights.length===1?'':'s'}`:'';
  if(!user)return;
  if(!nights.length){ $('nights-list').innerHTML='<p class="row-empty">No nights yet. Wear your Apple Watch to bed with Sleep turned on (Health app → Sleep), and open the YOU watch app once so it can read Apple Health. From then on, nights arrive each morning.</p>'; return; }
  $('nights-list').innerHTML=nights.slice(0,60).map(r=>`<div class="night"><div class="when"><b>${esc(shortDay(r.night))}</b><small>${esc(clock(r.bedtime))} → ${esc(clock(r.wake_time))}</small></div><div><small>${r.deep_min!=null?`deep ${hm(r.deep_min)} · core ${hm(r.core_min)} · REM ${hm(r.rem_min)}`:'no stages'}${r.awake_min?` · awake ${hm(r.awake_min)}`:''}${r.resting_hr?` · ${Math.round(r.resting_hr)} bpm`:''}</small></div><span class="amt${r.asleep_min>=goalMin()?'':' miss'}">${esc(hm(r.asleep_min))}</span></div>`).join('');
}

// ---- goal ----
$('goal-open').onclick=()=>{ $('goal-hours').value=goalHours; message('goal-message',''); $('goal-dialog').showModal(); $('goal-hours').focus(); };
$('goal-close').onclick=()=>{ if(!busy)$('goal-dialog').close(); };
for(const id of ['goal-dialog','connection-dialog']) $(id).addEventListener('cancel',e=>{ if(busy)e.preventDefault(); });
$('goal-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy||!user)return; busy=true; $('goal-save').disabled=true;
  try{ const v=Number($('goal-hours').value); if(!(v>=4&&v<=12)) throw new Error('Pick a goal between 4 and 12 hours.');
    const db=await connect(); const {error}=await db.from('sleep_goals').upsert({user_id:user.id,goal_hours:v,updated_at:new Date().toISOString()},{onConflict:'user_id'}); if(error)throw error;
    goalHours=v; $('goal-dialog').close(); render(); }
  catch(err){ message('goal-message',err.message||'Could not save.','error'); }
  finally{ busy=false; $('goal-save').disabled=false; }
});

// Download, or on a phone share, a CSV of your nights.
async function exportCsv(name,header,rows){
  const q=v=>{ const s=String(v??''); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const csv=[header,...rows].map(r=>r.map(q).join(',')).join('\r\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
  try{ const file=new File([blob],name,{type:'text/csv'}); if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:name}); return; } }catch(err){ if(err?.name==='AbortError') return; }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000);
}
$('csv-nights').onclick=()=>exportCsv('sleep-nights.csv',['night','bedtime','wake_time','asleep_min','deep_min','core_min','rem_min','awake_min','resting_hr'],nights.map(r=>[r.night,r.bedtime||'',r.wake_time||'',r.asleep_min,r.deep_min??'',r.core_min??'',r.rem_min??'',r.awake_min??'',r.resting_hr??'']));

// What the coach reads: the last 30 nights against the goal, with bed and wake times and stages.
function coachSummary(){
  const recent=nights.slice(0,30), L=[];
  const bed=usual(recent,'bedtime'), wake=usual(recent,'wake_time');
  L.push(`Sleep goal: ${hm(goalMin())} a night. ${recent.length} nights recorded in the last 30.`);
  if(recent.length) L.push(`Average asleep: ${hm(recent.reduce((a,r)=>a+r.asleep_min,0)/recent.length)}. Goal met on ${recent.filter(r=>r.asleep_min>=goalMin()).length} nights.${bed?` Usual bedtime ${bed.time} (nights usually within ${bed.spread} min).`:''}${wake?` Usual wake time ${wake.time} (within ${wake.spread} min).`:''}`);
  L.push('\nNight by night, newest first (the date is the morning you woke):');
  for(const r of recent) L.push(`${r.night} (${parseDay(r.night).toLocaleDateString('en-US',{weekday:'short'})}): asleep ${hm(r.asleep_min)}, ${clock(r.bedtime)} to ${clock(r.wake_time)}${r.deep_min!=null?`, deep ${hm(r.deep_min)}, core ${hm(r.core_min)}, REM ${hm(r.rem_min)}`:''}${r.awake_min!=null?`, awake ${hm(r.awake_min)}`:''}${r.resting_hr?`, resting HR ${Math.round(r.resting_hr)}`:''}`);
  return L.join('\n');
}
window.coach={app:'sleep',note:'The coach reads your last 30 nights: times, stages and resting heart rate.',userId:async()=>user?.id||null,session:async()=>{ try{ const db=await connect(); const {data:{session}}=await db.auth.getSession(); return session?.access_token||null; }catch{ return null; } },summary:coachSummary};

// Reconnect a saved session, if any.
render();
connect().catch(()=>{});
window.youSettings?.on((v,keys)=>{ if(user&&keys.some(k=>k==='timeZone'||k==='dayEnds')) load(); });
})();
