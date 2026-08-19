
const APP_KEY="school-timetable-app-data";
const SCHEMA_VERSION=5;
const DAYS=["月","火","水","木","金"];
const PERIODS=[1,2,3,4,5,6];
const ALL_PERIODS=[0,1,2,3,4,5,6];
const DEPARTMENTS=["国語","数学","英語","理科","社会","芸術","家庭科","体育","商業"];

let state={
  schemaVersion:SCHEMA_VERSION,
  classes:["1年1組","1年2組"],
  teachers:[],
  teacherProfiles:{},
  teacherOrder:{},
  base:{},
  daily:{},
  history:[],
  classSettings:{}
};

let ui={dailyMode:"day",baseMode:"class"};
let editing=null;
let copiedLesson=null;
let conditionCache=[];

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const cellKey=(d,p)=>`${d}-${p}`;
const dayKey=(date,cls)=>`${date}__${cls}`;

function esc(s){
  return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
function uniqueId(){
  if(window.crypto?.randomUUID)return crypto.randomUUID();
  return "g-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function defaultAvailability(on=true){
  const a={};DAYS.forEach(d=>a[d]={});
  DAYS.forEach(d=>ALL_PERIODS.forEach(p=>a[d][p]=!!on));
  return a;
}
function normalizeAvailability(a,employment="常勤"){
  const out=defaultAvailability(employment==="常勤");
  if(a&&typeof a==="object"){
    DAYS.forEach(d=>ALL_PERIODS.forEach(p=>{
      if(a[d]&&typeof a[d][p]==="boolean")out[d][p]=a[d][p];
    }));
  }
  return out;
}
function normalizeProfile(p={}){
  const employment=p.employment==="非常勤"?"非常勤":"常勤";
  return {
    department:DEPARTMENTS.includes(p.department)?p.department:"",
    employment,
    availability:normalizeAvailability(p.availability,employment)
  };
}
function normalizeLesson(l,fallbackClass="",fallbackGroup=""){
  if(!l)return null;
  const rooms=Array.isArray(l.rooms)?l.rooms:(l.room?[l.room]:[]);
  const participants=Array.isArray(l.participants)&&l.participants.length?l.participants:(fallbackClass?[fallbackClass]:[]);
  return {
    subject:l.subject||"",
    teachers:Array.isArray(l.teachers)?l.teachers:(l.teacher?[l.teacher]:[]),
    absent:Array.isArray(l.absent)?l.absent:[],
    substitute:l.substitute||"",
    rooms:[...new Set(rooms.filter(Boolean))],
    participants:[...new Set(participants.filter(Boolean))],
    groupId:l.groupId||fallbackGroup||uniqueId()
  };
}
function migrate(data){
  if(!data||typeof data!=="object")return state;
  data.schemaVersion=data.schemaVersion||1;
  data.classes=Array.isArray(data.classes)&&data.classes.length?data.classes:["1年1組","1年2組"];
  data.teachers=Array.isArray(data.teachers)?data.teachers:[];
  data.teacherProfiles=data.teacherProfiles||{};
  data.teacherOrder=data.teacherOrder||{};
  data.base=data.base||{};
  data.daily=data.daily||data.overrides||{};
  data.history=data.history||[];
  data.classSettings=data.classSettings||{};

  const found=new Set(data.teachers);
  Object.keys(data.base).forEach(c=>{
    Object.keys(data.base[c]||{}).forEach(k=>{
      data.base[c][k]=normalizeLesson(data.base[c][k],c,`base-${c}-${k}`);
      data.base[c][k]?.teachers.forEach(t=>found.add(t));
    });
  });
  Object.keys(data.daily).forEach(dk=>{
    const cls=dk.split("__").slice(1).join("__");
    Object.keys(data.daily[dk]||{}).forEach(k=>{
      if(data.daily[dk][k]!==null){
        data.daily[dk][k]=normalizeLesson(data.daily[dk][k],cls,`daily-${dk}-${k}`);
        data.daily[dk][k]?.teachers.forEach(t=>found.add(t));
        if(data.daily[dk][k]?.substitute)found.add(data.daily[dk][k].substitute);
      }
    });
  });
  data.teachers=[...found].filter(Boolean);

  data.teachers.forEach(t=>{
    data.teacherProfiles[t]=normalizeProfile(data.teacherProfiles[t]||{});
  });
  DEPARTMENTS.forEach(dep=>{
    const members=data.teachers.filter(t=>data.teacherProfiles[t]?.department===dep);
    const existing=Array.isArray(data.teacherOrder[dep])?data.teacherOrder[dep]:[];
    data.teacherOrder[dep]=[...existing.filter(t=>members.includes(t)),...members.filter(t=>!existing.includes(t))];
  });
  data.schemaVersion=SCHEMA_VERSION;
  return data;
}
function load(){
  const raw=localStorage.getItem(APP_KEY);
  if(raw){try{state=migrate(JSON.parse(raw))}catch(e){console.error(e)}}
  ensureClasses();
}
function save(){localStorage.setItem(APP_KEY,JSON.stringify(state))}
function ensureClasses(){
  state.classes.forEach(c=>{
    if(!state.base[c])state.base[c]={};
    if(!state.classSettings[c])state.classSettings[c]={zeroPeriod:false};
    if(typeof state.classSettings[c].zeroPeriod!=="boolean")state.classSettings[c].zeroPeriod=false;
  });
}
function periodsForClass(cls){return state.classSettings?.[cls]?.zeroPeriod?ALL_PERIODS:PERIODS}
function allPeriodsForSchool(){return state.classes.some(c=>state.classSettings?.[c]?.zeroPeriod)?ALL_PERIODS:PERIODS}
function getBase(cls,d,p){return state.base[cls]?.[cellKey(d,p)]||null}
function getDaily(cls,date,d,p){
  const v=state.daily[dayKey(date,cls)]?.[cellKey(d,p)];
  if(v===null)return null;
  if(v!==undefined)return normalizeLesson(v,cls);
  return getBase(cls,d,p);
}
function isChanged(cls,date,d,p){return state.daily[dayKey(date,cls)]?.[cellKey(d,p)]!==undefined}
function setDaily(cls,date,d,p,val){
  const dk=dayKey(date,cls);
  if(!state.daily[dk])state.daily[dk]={};
  state.daily[dk][cellKey(d,p)]=val===null?null:normalizeLesson(val,cls);
}
function addHistory(type,detail){
  state.history.unshift({ts:new Date().toISOString(),type,detail});
  state.history=state.history.slice(0,400);
}
function teachersText(l){
  if(!l)return"";
  const active=(l.teachers||[]).filter(t=>!(l.absent||[]).includes(t));
  if(l.substitute)active.push(l.substitute);
  return [...active,...(l.absent||[]).map(t=>`（${t}）`)].join("・");
}
function roomsText(l){return (l?.rooms||[]).join("・")}
function participantsText(l){return (l?.participants||[]).join("・")}

function profileOf(name){
  if(!state.teacherProfiles[name])state.teacherProfiles[name]=normalizeProfile({});
  return state.teacherProfiles[name];
}
function teacherAvailable(name,day,period){
  const p=profileOf(name);
  return !!p.availability?.[day]?.[period];
}
function activeTeachers(l){
  if(!l)return[];
  return [...(l.teachers||[]).filter(t=>!(l.absent||[]).includes(t)),...(l.substitute?[l.substitute]:[])];
}
function departmentRank(name){
  const d=profileOf(name).department;
  const i=DEPARTMENTS.indexOf(d);
  return i<0?999:i;
}
function ensureTeacherOrder(){
  state.teacherOrder=state.teacherOrder||{};
  DEPARTMENTS.forEach(dep=>{
    const members=state.teachers.filter(t=>profileOf(t).department===dep);
    const existing=Array.isArray(state.teacherOrder[dep])?state.teacherOrder[dep]:[];
    state.teacherOrder[dep]=[...existing.filter(t=>members.includes(t)),...members.filter(t=>!existing.includes(t))];
  });
}
function teacherOrderRank(name){
  const dep=profileOf(name).department;
  const i=(state.teacherOrder?.[dep]||[]).indexOf(name);
  return i<0?999:i;
}
function sortedTeachers(){
  ensureTeacherOrder();
  return [...state.teachers].sort((a,b)=>{
    const r=departmentRank(a)-departmentRank(b);
    if(r)return r;
    const rr=teacherOrderRank(a)-teacherOrderRank(b);
    return rr||a.localeCompare(b,"ja");
  });
}

/* v1.6.1 source preserved from approved package */
