
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
  data.base=data.base||{};
  data.daily=data.daily||data.overrides||{};
  data.history=data.history||[];
  data.classSettings=data.classSettings||{};

  // 旧時間割に登場する教員を自動回収
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
function sortedTeachers(){
  return [...state.teachers].sort((a,b)=>{
    const r=departmentRank(a)-departmentRank(b);
    return r||a.localeCompare(b,"ja");
  });
}

/* ---------- 日付 ---------- */
function currentDate(){return $("#dailyDate").value}
function parseLocalDate(s){
  const [y,m,d]=s.split("-").map(Number);
  return new Date(y,m-1,d);
}
function isoLocal(date){
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function dayNameForDate(dateStr){
  if(!dateStr)return null;
  const dow=parseLocalDate(dateStr).getDay();
  return ({1:"月",2:"火",3:"水",4:"木",5:"金"})[dow]||null;
}
function weekDates(dateStr){
  const d=parseLocalDate(dateStr),dow=d.getDay();
  const shift=dow===0?-6:1-dow;
  const mon=new Date(d);mon.setDate(d.getDate()+shift);
  const out={};
  DAYS.forEach((day,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);out[day]=isoLocal(x)});
  return out;
}

/* ---------- タブ・基本UI ---------- */
function setupTabs(){
  $$(".tabs button").forEach(b=>b.onclick=()=>{
    $$(".tabs button,.tab").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");$("#"+b.dataset.tab).classList.add("active");
    renderAll();
  });
}
function fillClassSelects(){
  ["baseClass","dailyClass"].forEach(id=>{
    const el=$("#"+id);if(!el)return;
    const old=el.value;
    el.innerHTML=state.classes.map(c=>`<option>${esc(c)}</option>`).join("");
    if(state.classes.includes(old))el.value=old;
  });
}
function setupModeButtons(){
  $("#dailyModeDay").onclick=()=>{ui.dailyMode="day";renderDaily()};
  $("#dailyModeClass").onclick=()=>{ui.dailyMode="class";renderDaily()};
  $("#baseModeClass").onclick=()=>{ui.baseMode="class";renderBase()};
  $("#baseModeDay").onclick=()=>{ui.baseMode="day";renderBase()};
}
function setModeButton(a,b,mode){
  $(a).classList.toggle("active",mode==="day");
  $(b).classList.toggle("active",mode==="class");
}

/* ---------- セル表示・自動縮小 ---------- */
function cellHtml(l){
  if(!l)return `<div class="cell-content"><div class="empty">空き</div></div>`;
  const parts=[];
  parts.push(`<div class="cell-line cell-subject" title="${esc(l.subject)}">${esc(l.subject)}</div>`);
  if((l.participants||[]).length>1)parts.push(`<div class="cell-line cell-participants" title="${esc(participantsText(l))}">合同：${esc(participantsText(l))}</div>`);
  if(teachersText(l))parts.push(`<div class="cell-line cell-teachers" title="${esc(teachersText(l))}">${esc(teachersText(l))}</div>`);
  if(roomsText(l))parts.push(`<div class="cell-line cell-rooms" title="${esc(roomsText(l))}">${esc(roomsText(l))}</div>`);
  return `<div class="cell-content">${parts.join("")}</div>`;
}
function shrinkLine(el,minPx){
  let size=parseFloat(getComputedStyle(el).fontSize);
  const maxWidth=el.clientWidth-2;
  while(size>minPx && el.scrollWidth>maxWidth){
    size-=0.5;el.style.fontSize=size+"px";
  }
}
function fitTimetableCells(root=document){
  requestAnimationFrame(()=>{
    root.querySelectorAll(".cell-subject").forEach(e=>shrinkLine(e,9));
    root.querySelectorAll(".cell-teachers").forEach(e=>shrinkLine(e,8));
    root.querySelectorAll(".cell-participants,.cell-rooms").forEach(e=>shrinkLine(e,7));
    root.querySelectorAll(".cell-content").forEach(box=>{
      let guard=0;
      while(box.scrollHeight>box.clientHeight && guard<12){
        box.querySelectorAll(".cell-line").forEach(e=>{
          let s=parseFloat(getComputedStyle(e).fontSize);
          const min=e.classList.contains("cell-subject")?8:7;
          if(s>min)e.style.fontSize=(s-0.5)+"px";
        });
        guard++;
      }
    });
  });
}

/* ---------- 重複・勤務時間外 ---------- */
function conflictEntries(date){
  const teacherMap={},roomMap={},availability=[],seen=new Set();
  state.classes.forEach(cls=>DAYS.forEach(day=>periodsForClass(cls).forEach(p=>{
    const l=getDaily(cls,date,day,p);if(!l)return;
    const gid=l.groupId||`${cls}-${day}-${p}`;
    const once=`${day}-${p}-${gid}`;if(seen.has(once))return;seen.add(once);
    activeTeachers(l).forEach(t=>{
      const k=`${day}-${p}-${t}`;(teacherMap[k]??=[]).push({groupId:gid,cls,day,p,teacher:t});
      if(!teacherAvailable(t,day,p))availability.push({groupId:gid,cls,day,p,teacher:t});
    });
    (l.rooms||[]).forEach(r=>{
      const k=`${day}-${p}-${r}`;(roomMap[k]??=[]).push({groupId:gid,cls,day,p,room:r});
    });
  })));
  return {
    teacher:Object.values(teacherMap).filter(a=>new Set(a.map(x=>x.groupId)).size>1).flat(),
    room:Object.values(roomMap).filter(a=>new Set(a.map(x=>x.groupId)).size>1).flat(),
    availability
  };
}
function hasConflict(cls,date,day,p){
  const l=getDaily(cls,date,day,p);if(!l)return false;
  const c=conflictEntries(date),gid=l.groupId;
  return c.teacher.some(x=>x.groupId===gid)||c.room.some(x=>x.groupId===gid)||c.availability.some(x=>x.groupId===gid);
}

/* ---------- 通常時間割 ---------- */
function renderBase(){
  fillClassSelects();
  $("#baseModeClass").classList.toggle("active",ui.baseMode==="class");
  $("#baseModeDay").classList.toggle("active",ui.baseMode==="day");
  $("#baseClassWrap").classList.toggle("hidden",ui.baseMode!=="class");
  $("#baseDayWrap").classList.toggle("hidden",ui.baseMode!=="day");
  $("#zeroPeriodBtn").classList.toggle("hidden",ui.baseMode!=="class");

  if(ui.baseMode==="class")renderBaseClass();
  else renderBaseDay();
  updateZeroPeriodButton();
}
function renderBaseClass(){
  const cls=$("#baseClass").value;if(!cls)return;
  $("#baseViewTitle").textContent=`通常時間割：${cls}`;
  let h=`<tr><th class="period-head sticky-first">校時</th>${DAYS.map(d=>`<th class="day-head">${d}曜日</th>`).join("")}</tr>`;
  periodsForClass(cls).forEach(p=>{
    h+=`<tr><th class="period-head sticky-first">${p}限</th>`;
    DAYS.forEach(d=>{
      const l=getBase(cls,d,p);
      h+=`<td class="slot" data-class="${esc(cls)}" data-day="${d}" data-period="${p}">${cellHtml(l)}</td>`;
    });
    h+="</tr>";
  });
  $("#baseTable").innerHTML=h;
  $("#baseTable").querySelectorAll("td.slot").forEach(td=>td.onclick=()=>openEditor(true,td.dataset.class,"",td.dataset.day,+td.dataset.period));
  fitTimetableCells($("#baseTable"));
}
function renderBaseDay(){
  const day=$("#baseDay").value||"月";
  $("#baseViewTitle").textContent=`通常時間割：${day}曜日（全クラス）`;
  let h=`<tr><th class="period-head sticky-first">校時</th>${state.classes.map(c=>`<th class="class-head">${esc(c)}</th>`).join("")}</tr>`;
  allPeriodsForSchool().forEach(p=>{
    h+=`<tr><th class="period-head sticky-first">${p}限</th>`;
    state.classes.forEach(cls=>{
      if(!periodsForClass(cls).includes(p)){h+=`<td class="not-applicable">—</td>`;return}
      const l=getBase(cls,day,p);
      h+=`<td class="slot" data-class="${esc(cls)}" data-day="${day}" data-period="${p}">${cellHtml(l)}</td>`;
    });
    h+="</tr>";
  });
  $("#baseTable").innerHTML=h;
  $("#baseTable").querySelectorAll("td.slot").forEach(td=>td.onclick=()=>openEditor(true,td.dataset.class,"",td.dataset.day,+td.dataset.period));
  fitTimetableCells($("#baseTable"));
}
function updateZeroPeriodButton(){
  const cls=$("#baseClass").value;if(!cls)return;
  $("#zeroPeriodBtn").textContent=state.classSettings?.[cls]?.zeroPeriod?"0校時あり ✓":"0校時を追加";
}
function toggleZeroPeriod(){
  const cls=$("#baseClass").value;if(!cls)return;
  const now=!!state.classSettings[cls]?.zeroPeriod;
  if(now&&DAYS.some(d=>getBase(cls,d,0))&&!confirm("0校時に授業が登録されています。0校時を非表示にしますか？（データは保持します）"))return;
  state.classSettings[cls].zeroPeriod=!now;
  addHistory("クラス設定",`${cls}：0校時 ${!now?"あり":"なし"}`);save();renderAll();
}

/* ---------- 日々の変更 ---------- */
function renderDaily(){
  fillClassSelects();
  $("#dailyModeDay").classList.toggle("active",ui.dailyMode==="day");
  $("#dailyModeClass").classList.toggle("active",ui.dailyMode==="class");
  $("#dailyClassWrap").classList.toggle("hidden",ui.dailyMode!=="class");

  const date=currentDate();
  const day=dayNameForDate(date);
  $("#selectedWeekday").textContent=day?`${day}曜日`:"土日";

  if(ui.dailyMode==="day"){
    $("#dailyViewTitle").textContent="全クラスの日別時間割";
    $("#dailyViewHelp").textContent="指定した日の全学年・全クラスを一覧表示します。";
    renderDailyDay(date,day);
  }else{
    $("#dailyViewTitle").textContent=`クラス別 週間表示：${$("#dailyClass").value||""}`;
    $("#dailyViewHelp").textContent="基準日を含む週（月〜金）の変更後時間割を表示します。";
    renderDailyClassWeek(date);
  }
  renderTeacherDayTable(date,day);
  renderDailyChanges();
}
function renderDailyDay(date,day){
  if(!day){
    $("#dailyTable").innerHTML="";
    $("#dailyStatus").innerHTML=`<div class="status warn">土日は通常時間割の対象外です。</div>`;
    return;
  }
  let h=`<tr><th class="period-head sticky-first">校時</th>${state.classes.map(c=>`<th class="class-head">${esc(c)}</th>`).join("")}</tr>`;
  allPeriodsForSchool().forEach(p=>{
    h+=`<tr><th class="period-head sticky-first">${p}限</th>`;
    state.classes.forEach(cls=>{
      if(!periodsForClass(cls).includes(p)){h+=`<td class="not-applicable">—</td>`;return}
      const l=getDaily(cls,date,day,p),changed=isChanged(cls,date,day,p),conflict=hasConflict(cls,date,day,p);
      h+=`<td class="slot ${changed?"changed-cell":""} ${conflict?"conflict-cell":""}" data-class="${esc(cls)}" data-date="${date}" data-day="${day}" data-period="${p}">${cellHtml(l)}</td>`;
    });
    h+="</tr>";
  });
  $("#dailyTable").innerHTML=h;
  $("#dailyTable").querySelectorAll("td.slot").forEach(td=>td.onclick=()=>openEditor(false,td.dataset.class,td.dataset.date,td.dataset.day,+td.dataset.period));
  fitTimetableCells($("#dailyTable"));
  renderDayStatus(date,day);
}
function renderDailyClassWeek(date){
  const cls=$("#dailyClass").value;if(!cls)return;
  const wd=weekDates(date);
  let h=`<tr><th class="period-head sticky-first">校時</th>${DAYS.map(d=>`<th class="day-head">${d}曜日<div class="small">${wd[d].slice(5).replace("-","/")}</div></th>`).join("")}</tr>`;
  periodsForClass(cls).forEach(p=>{
    h+=`<tr><th class="period-head sticky-first">${p}限</th>`;
    DAYS.forEach(day=>{
      const actual=wd[day],l=getDaily(cls,actual,day,p),changed=isChanged(cls,actual,day,p),conflict=hasConflict(cls,actual,day,p);
      h+=`<td class="slot ${changed?"changed-cell":""} ${conflict?"conflict-cell":""}" data-class="${esc(cls)}" data-date="${actual}" data-day="${day}" data-period="${p}">${cellHtml(l)}</td>`;
    });
    h+="</tr>";
  });
  $("#dailyTable").innerHTML=h;
  $("#dailyTable").querySelectorAll("td.slot").forEach(td=>td.onclick=()=>openEditor(false,td.dataset.class,td.dataset.date,td.dataset.day,+td.dataset.period));
  fitTimetableCells($("#dailyTable"));
  $("#dailyStatus").innerHTML=`<div class="status ok">基準日を含む1週間を表示しています。赤色は重複または勤務時間外です。</div>`;
}
function renderDayStatus(date,day){
  const c=conflictEntries(date);
  const t=c.teacher.filter(x=>x.day===day),r=c.room.filter(x=>x.day===day),a=c.availability.filter(x=>x.day===day);
  $("#dailyStatus").innerHTML=(t.length||r.length||a.length)
    ?`<div class="status bad">この日の確認事項：教員重複 ${t.length}件 / 教室重複 ${r.length}件 / 勤務時間外 ${a.length}件</div>`
    :`<div class="status ok">この日の教員・教室・勤務時間の問題はありません。</div>`;
}
function uniqueLessonsForSlot(date,day,p){
  const map=new Map();
  state.classes.forEach(cls=>{
    if(!periodsForClass(cls).includes(p))return;
    const l=getDaily(cls,date,day,p);if(!l)return;
    const gid=l.groupId||`${cls}-${day}-${p}-${l.subject}`;
    if(!map.has(gid))map.set(gid,l);
  });
  return [...map.values()];
}
function teacherEntriesForPeriod(name,date,day,p){
  if(!day)return[];
  const entries=[];
  uniqueLessonsForSlot(date,day,p).forEach(l=>{
    if((l.teachers||[]).includes(name)){
      entries.push({subject:l.subject,classes:participantsText(l),rooms:roomsText(l),status:(l.absent||[]).includes(name)?"欠":""});
    }
    if(l.substitute===name)entries.push({subject:l.subject,classes:participantsText(l),rooms:roomsText(l),status:"代講"});
  });
  return entries;
}
function renderTeacherDayTable(date,day){
  if(!day){$("#teacherDayTable").innerHTML="";return}
  let h=`<tr><th class="teacher-name-head sticky-first">教員</th>${allPeriodsForSchool().map(p=>`<th>${p}限</th>`).join("")}</tr>`;
  sortedTeachers().forEach(name=>{
    const pr=profileOf(name);
    h+=`<tr><th class="teacher-name-cell sticky-first"><strong>${esc(name)}</strong><div class="small">${esc(pr.department||"教科未設定")}・${esc(pr.employment)}</div></th>`;
    allPeriodsForSchool().forEach(p=>{
      if(!teacherAvailable(name,day,p)){
        const entries=teacherEntriesForPeriod(name,date,day,p);
        h+=`<td class="${entries.length?"teacher-conflict":"outside-work"}">${entries.length?teacherEntryHtml(entries):"勤務外"}</td>`;
      }else{
        const entries=teacherEntriesForPeriod(name,date,day,p);
        h+=`<td class="${entries.length>1?"teacher-conflict":""}">${entries.length?teacherEntryHtml(entries):'<div class="empty">—</div>'}</td>`;
      }
    });
    h+="</tr>";
  });
  $("#teacherDayTable").innerHTML=h;
}
function teacherEntryHtml(entries){
  return entries.map(e=>{
    const st=e.status?`<span class="teacher-status ${e.status==="欠"?"absent-status":"sub-status"}">${esc(e.status)}</span>`:"";
    return `<div class="teacher-entry" title="${esc(`${e.classes} ${e.subject} ${e.rooms}`)}"><strong>${esc(e.classes)}</strong> ${esc(e.subject)} ${st}${e.rooms?` / ${esc(e.rooms)}`:""}</div>`;
  }).join("");
}
function renderDailyChanges(){
  const date=currentDate(),day=dayNameForDate(date);
  if(!day){$("#dailyChanges").innerHTML=`<p class="muted">変更はありません。</p>`;return}
  const seen=new Set(),items=[];
  state.classes.forEach(cls=>{
    Object.entries(state.daily[dayKey(date,cls)]||{}).forEach(([k,v])=>{
      const [d,ps]=k.split("-");if(d!==day)return;
      const p=+ps,after=v===null?null:normalizeLesson(v,cls);
      const id=`${k}-${after?.groupId||cls+"-deleted"}`;if(seen.has(id))return;seen.add(id);
      const before=getBase(cls,d,p);
      items.push({p,classes:after?.participants?.length?participantsText(after):cls,before:before?`${before.subject} / ${teachersText(before)}`:"空き",after:after?`${after.subject} / ${teachersText(after)}`:"空き"});
    });
  });
  items.sort((a,b)=>a.p-b.p||a.classes.localeCompare(b.classes,"ja"));
  $("#dailyChanges").innerHTML=items.length?items.map(x=>`<div class="change-item"><strong>${x.p}限　${esc(x.classes)}</strong><div class="small">通常：${esc(x.before)}</div><div class="small">変更：${esc(x.after)}</div></div>`).join(""):`<p class="muted">この日の変更はありません。</p>`;
}

/* ---------- 教員設定 ---------- */
function renderTeachers(){
  // 時間割から新規に見つかった教員を補完
  const found=new Set(state.teachers);
  Object.values(state.base).forEach(g=>Object.values(g).forEach(l=>(l?.teachers||[]).forEach(t=>found.add(t))));
  state.teachers=[...found].filter(Boolean);
  state.teachers.forEach(t=>{state.teacherProfiles[t]=normalizeProfile(state.teacherProfiles[t]||{})});

  $("#teacherCards").innerHTML=sortedTeachers().map(name=>teacherCardHtml(name)).join("");
  bindTeacherCardEvents();
}
function departmentOptions(selected){
  return `<option value="">未設定</option>`+DEPARTMENTS.map(d=>`<option value="${d}" ${d===selected?"selected":""}>${d}</option>`).join("");
}
function teacherCardHtml(name){
  const p=profileOf(name);
  let table=`<table class="availability-table"><tr><th>曜日</th>${ALL_PERIODS.map(x=>`<th>${x}限</th>`).join("")}</tr>`;
  DAYS.forEach(day=>{
    table+=`<tr><th>${day}</th>${ALL_PERIODS.map(per=>`<td><input class="availability-check" type="checkbox" data-teacher="${esc(name)}" data-day="${day}" data-period="${per}" ${p.availability[day][per]?"checked":""}></td>`).join("")}</tr>`;
  });table+="</table>";
  return `<div class="teacher-card" data-teacher="${esc(name)}">
    <div class="teacher-card-head">
      <div class="teacher-name-title">${esc(name)}</div>
      <div><label>担当教科</label><select class="mini-select department-select" data-teacher="${esc(name)}">${departmentOptions(p.department)}</select></div>
      <div><label>勤務形態</label><select class="mini-select employment-select" data-teacher="${esc(name)}"><option ${p.employment==="常勤"?"selected":""}>常勤</option><option ${p.employment==="非常勤"?"selected":""}>非常勤</option></select></div>
      <button class="danger-outline delete-teacher" type="button" data-teacher="${esc(name)}">削除</button>
    </div>
    <div class="availability-wrap">${table}</div>
    <div class="availability-actions">
      <button class="sub all-on" type="button" data-teacher="${esc(name)}">全校時ON</button>
      <button class="sub all-off" type="button" data-teacher="${esc(name)}">全校時OFF</button>
    </div>
  </div>`;
}
function bindTeacherCardEvents(){
  $$(".department-select").forEach(el=>el.onchange=()=>{
    const t=el.dataset.teacher;profileOf(t).department=el.value;addHistory("教員設定",`${t}：担当教科 ${el.value||"未設定"}`);save();renderAll();
  });
  $$(".employment-select").forEach(el=>el.onchange=()=>{
    const t=el.dataset.teacher,p=profileOf(t),old=p.employment;p.employment=el.value;
    // 常勤へ変更時のみ全ONを提案として自動適用
    if(old!=="常勤"&&p.employment==="常勤")p.availability=defaultAvailability(true);
    addHistory("教員設定",`${t}：勤務形態 ${p.employment}`);save();renderAll();
  });
  $$(".availability-check").forEach(el=>el.onchange=()=>{
    const t=el.dataset.teacher,day=el.dataset.day,per=+el.dataset.period;
    profileOf(t).availability[day][per]=el.checked;save();renderDaily();
  });
  $$(".all-on").forEach(b=>b.onclick=()=>{profileOf(b.dataset.teacher).availability=defaultAvailability(true);save();renderTeachers();renderDaily()});
  $$(".all-off").forEach(b=>b.onclick=()=>{profileOf(b.dataset.teacher).availability=defaultAvailability(false);save();renderTeachers();renderDaily()});
  $$(".delete-teacher").forEach(b=>b.onclick=()=>{
    const t=b.dataset.teacher;
    if(!confirm(`${t}先生を教員設定から削除しますか？\n時間割内の名前は残ります。`))return;
    state.teachers=state.teachers.filter(x=>x!==t);delete state.teacherProfiles[t];save();renderAll();
  });
}
function addTeacher(){
  const name=$("#teacherName").value.trim(),department=$("#teacherDepartment").value,employment=$("#teacherEmployment").value;
  if(!name){alert("教員名を入力してください。");return}
  if(!department){alert("担当教科を選択してください。");return}
  if(state.teachers.includes(name)){alert("同じ教員名がすでに登録されています。");return}
  state.teachers.push(name);
  state.teacherProfiles[name]={department,employment,availability:defaultAvailability(employment==="常勤")};
  $("#teacherName").value="";
  addHistory("教員追加",`${name}（${department}・${employment}）`);save();renderAll();
}

/* ---------- 授業編集 ---------- */
function renderParticipantChecks(selected){
  const set=new Set(selected||[]);
  $("#participantChecks").innerHTML=state.classes.map(c=>`<label><input type="checkbox" value="${esc(c)}" ${set.has(c)?"checked":""}>${esc(c)}</label>`).join("");
}
function renderTeacherChecks(selected){
  const set=new Set(selected||[]);
  const registered=new Set(state.teachers);
  const unknown=[...set].filter(t=>!registered.has(t));
  $("#teacherChecks").innerHTML=sortedTeachers().map(t=>{
    const p=profileOf(t);
    return `<label title="${esc(p.department||"教科未設定")}"><input type="checkbox" value="${esc(t)}" ${set.has(t)?"checked":""}>${esc(t)}${p.department?`（${esc(p.department)}）`:""}</label>`;
  }).join("");
  $("#teacherUnregisteredNote").textContent=unknown.length?`旧データの未登録教員：${unknown.join("・")}（保存すると選択から外れます）`:"";
}
function renderAbsentChecks(selectedTeachers,absent){
  const set=new Set(absent||[]);
  $("#absentChecks").innerHTML=(selectedTeachers||[]).map(t=>`<label><input type="checkbox" value="${esc(t)}" ${set.has(t)?"checked":""}>${esc(t)}</label>`).join("")||`<span class="small">担当教員を選択すると表示されます。</span>`;
}
function refreshSubstitute(selected=""){
  $("#editSubstitute").innerHTML=`<option value="">なし</option>`+sortedTeachers().map(t=>`<option value="${esc(t)}" ${t===selected?"selected":""}>${esc(t)}（${esc(profileOf(t).department||"未設定")}）</option>`).join("");
}
function selectedValues(root){
  return [...$(root).querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
}
function openEditor(isBase,cls,date,day,p){
  editing={isBase,cls,date,day,p};
  const l=isBase?getBase(cls,day,p):getDaily(cls,date,day,p);
  $("#dialogTitle").textContent=isBase?"通常授業の編集":"変更後授業の編集";
  $("#editDay").value=day;$("#editPeriod").value=p;
  $("#editSubject").value=l?.subject||"";
  $("#editRooms").value=(l?.rooms||[]).join(",");
  renderParticipantChecks(l?.participants?.length?l.participants:[cls]);
  renderTeacherChecks(l?.teachers||[]);
  renderAbsentChecks(l?.teachers||[],l?.absent||[]);
  refreshSubstitute(l?.substitute||"");
  $("#editDay").disabled=isBase;
  $("#editPeriod").disabled=isBase;
  $("#copyLessonBtn").style.display=isBase?"inline-block":"none";
  $("#pasteLessonBtn").style.display=isBase?"inline-block":"none";
  $("#pasteLessonBtn").disabled=!copiedLesson;
  $("#editorWarnings").innerHTML="";
  $("#teacherChecks").querySelectorAll("input").forEach(x=>x.onchange=()=>renderAbsentChecks(selectedValues("#teacherChecks"),selectedValues("#absentChecks")));
  $("#lessonDialog").showModal();
}
function lessonFromForm(existing=null){
  let participants=selectedValues("#participantChecks");
  if(!participants.includes(editing.cls))participants.unshift(editing.cls);
  const teachers=selectedValues("#teacherChecks");
  return normalizeLesson({
    subject:$("#editSubject").value.trim(),
    teachers,
    absent:selectedValues("#absentChecks").filter(t=>teachers.includes(t)),
    substitute:$("#editSubstitute").value,
    rooms:$("#editRooms").value.split(",").map(s=>s.trim()).filter(Boolean),
    participants:[...new Set(participants)],
    groupId:existing?.groupId||uniqueId()
  },editing.cls);
}
function lessonAvailabilityWarnings(l,day,p){
  const bad=activeTeachers(l).filter(t=>!teacherAvailable(t,day,p));
  return bad.length?`${bad.join("・")}先生は${day}曜日${p}限が勤務可能時間外です。`:"";
}
function removeBaseGroup(day,p,l){
  if(!l)return;
  (l.participants||[editing.cls]).forEach(c=>{
    const cur=getBase(c,day,p);if(cur?.groupId===l.groupId)delete state.base[c][cellKey(day,p)];
  });
}
function writeBaseGroup(day,p,l){
  l.participants.forEach(c=>{
    if(!state.classes.includes(c))return;
    if(p===0)state.classSettings[c].zeroPeriod=true;
    state.base[c][cellKey(day,p)]=clone(l);
  });
}
function removeDailyGroup(date,day,p,l){
  if(!l)return;
  (l.participants||[editing.cls]).forEach(c=>{
    const cur=getDaily(c,date,day,p);if(cur?.groupId===l.groupId)setDaily(c,date,day,p,null);
  });
}
function writeDailyGroup(date,day,p,l){
  l.participants.forEach(c=>{
    if(p===0)state.classSettings[c].zeroPeriod=true;
    setDaily(c,date,day,p,clone(l));
  });
}
function saveEditor(){
  const existing=editing.isBase?getBase(editing.cls,editing.day,editing.p):getDaily(editing.cls,editing.date,editing.day,editing.p);
  const l=lessonFromForm(existing);
  if(!l.subject){alert("科目名を入力してください。");return}
  if(!l.teachers.length && !confirm("担当教員が未設定です。このまま保存しますか？"))return;
  const nd=$("#editDay").value,np=+$("#editPeriod").value;
  const warning=lessonAvailabilityWarnings(l,nd,np);
  if(warning&&!confirm(warning+"\nそれでも保存しますか？"))return;

  if(editing.isBase){
    const occupied=l.participants.filter(c=>{const t=getBase(c,editing.day,editing.p);return t&&t.groupId!==existing?.groupId});
    if(occupied.length&&!confirm(`${occupied.join("・")}の同じ時間に別授業があります。上書きしますか？`))return;
    removeBaseGroup(editing.day,editing.p,existing);writeBaseGroup(editing.day,editing.p,l);
    addHistory("通常時間割編集",`${participantsText(l)} ${editing.day}${editing.p}限 ${l.subject}`);
  }else{
    if(nd===editing.day&&np===editing.p){
      removeDailyGroup(editing.date,editing.day,editing.p,existing);writeDailyGroup(editing.date,nd,np,l);
      addHistory("手動変更",`${participantsText(l)} ${nd}${np}限 ${l.subject}`);
    }else{
      const targets=[];
      l.participants.forEach(c=>{const t=getDaily(c,editing.date,nd,np);if(t&&t.groupId!==existing?.groupId)targets.push(t)});
      if(targets.length&&!confirm("移動先の一部クラスに別授業があります。上書きしますか？"))return;
      removeDailyGroup(editing.date,editing.day,editing.p,existing);writeDailyGroup(editing.date,nd,np,l);
      addHistory("手動移動",`${participantsText(l)} ${editing.day}${editing.p}限 → ${nd}${np}限 ${l.subject}`);
    }
  }
  save();$("#lessonDialog").close();renderAll();
}
function deleteEditor(){
  const l=editing.isBase?getBase(editing.cls,editing.day,editing.p):getDaily(editing.cls,editing.date,editing.day,editing.p);
  if(editing.isBase)removeBaseGroup(editing.day,editing.p,l);
  else removeDailyGroup(editing.date,editing.day,editing.p,l);
  addHistory(editing.isBase?"通常授業削除":"手動削除",`${editing.cls} ${editing.day}${editing.p}限`);
  save();$("#lessonDialog").close();renderAll();
}
function copyCurrentBaseCell(){
  if(!editing?.isBase)return;
  const l=getBase(editing.cls,editing.day,editing.p);
  if(!l){alert("空きセルはコピーできません。");return}
  copiedLesson=clone(l);$("#pasteLessonBtn").disabled=false;alert(`${l.subject}をコピーしました。`);
}
function pasteToCurrentBaseCell(){
  if(!editing?.isBase||!copiedLesson)return;
  const old=getBase(editing.cls,editing.day,editing.p);
  if(old&&!confirm("貼り付け先の授業を上書きしますか？"))return;
  removeBaseGroup(editing.day,editing.p,old);
  const l=clone(copiedLesson);l.groupId=uniqueId();
  if(!l.participants.includes(editing.cls))l.participants=[editing.cls];
  writeBaseGroup(editing.day,editing.p,l);
  addHistory("通常時間割コピー",`${editing.cls} ${editing.day}${editing.p}限 ← ${l.subject}`);
  save();$("#lessonDialog").close();renderAll();
}

/* ---------- 条件一括入力 ---------- */
function parsePeriods(s){
  if(s==="終日")return ALL_PERIODS;
  const m=s.match(/^(\d+)-(\d+)$/);
  if(m){const a=+m[1],b=+m[2];return ALL_PERIODS.filter(p=>p>=a&&p<=b)}
  const n=+s;return ALL_PERIODS.includes(n)?[n]:[];
}
function parseConditions(){
  const arr=[];
  $("#conditionText").value.split(/\n/).map(x=>x.trim()).filter(Boolean).forEach((line,i)=>{
    const p=line.split(",").map(x=>x.trim());
    if(p.length<4){arr.push({error:`${i+1}行目：形式が正しくありません`});return}
    const [target,type,day,ps]=p,periods=parsePeriods(ps);
    if(!DAYS.includes(day)){arr.push({error:`${i+1}行目：曜日が不正です`});return}
    if(!periods.length){arr.push({error:`${i+1}行目：校時が不正です`});return}
    arr.push({target,type,day,periods,raw:line});
  });
  conditionCache=arr;return arr;
}
function analyzeConditions(){
  const arr=parseConditions(),date=currentDate(),issues=[],safe=[],seen=new Set();
  arr.forEach(c=>{
    if(c.error){issues.push(c.error);return}
    if(c.type==="不在"){
      state.classes.forEach(cls=>c.periods.filter(p=>periodsForClass(cls).includes(p)).forEach(p=>{
        const l=getDaily(cls,date,c.day,p);if(!l||!(l.teachers||[]).includes(c.target))return;
        const k=`${l.groupId}-${c.day}-${p}-${c.target}`;if(seen.has(k))return;seen.add(k);
        if(l.teachers.length>=2)safe.push({lesson:l,day:c.day,p,teacher:c.target});
        else issues.push(`${participantsText(l)} ${c.day}${p}限 ${l.subject}：${c.target}先生が単独担当`);
      }));
    }else if(c.type==="使用不可"){
      state.classes.forEach(cls=>c.periods.filter(p=>periodsForClass(cls).includes(p)).forEach(p=>{
        const l=getDaily(cls,date,c.day,p);if(!l||!(l.rooms||[]).includes(c.target))return;
        const k=`room-${l.groupId}-${c.day}-${p}`;if(seen.has(k))return;seen.add(k);
        issues.push(`${participantsText(l)} ${c.day}${p}限 ${l.subject}：${c.target}使用不可`);
      }));
    }else issues.push(`未対応条件：${c.raw}`);
  });
  $("#conditionResult").innerHTML=`<div class="status ${issues.length?"warn":"ok"}">自動反映可能 ${safe.length}件 / 要確認 ${issues.length}件</div>`+
    safe.map(x=>`<div class="condition-item">${participantsText(x.lesson)} ${x.day}${x.p}限：${x.teacher} → （${x.teacher}）</div>`).join("")+
    issues.map(x=>`<div class="condition-item">${esc(x)}</div>`).join("");
  conditionCache.safe=safe;
}
function applyConditions(){
  analyzeConditions();
  const date=currentDate(),safe=conditionCache.safe||[];
  safe.forEach(x=>{
    const l=clone(x.lesson);if(!l.absent.includes(x.teacher))l.absent.push(x.teacher);
    writeDailyGroup(date,x.day,x.p,l);
    addHistory("条件自動反映",`${participantsText(l)} ${x.day}${x.p}限 ${x.teacher}欠員`);
  });
  save();renderAll();alert(`${safe.length}件を反映しました。`);
}

/* ---------- 履歴・バックアップ ---------- */
function renderHistory(){
  $("#historyList").innerHTML=state.history.length?state.history.map(h=>`<div class="history-item"><strong>${esc(h.type)}</strong><div>${esc(h.detail)}</div><div class="small">${new Date(h.ts).toLocaleString("ja-JP")}</div></div>`).join(""):`<p class="muted">履歴はありません。</p>`;
}
function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`timetable-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);
}
function importData(file){
  const r=new FileReader();
  r.onload=()=>{try{state=migrate(JSON.parse(r.result));save();renderAll();alert("読み込みました。")}catch(e){alert("読み込みに失敗しました。")}};
  r.readAsText(file);
}

/* ---------- クラス管理 ---------- */
function addClass(){
  const n=prompt("追加するクラス名");if(!n||state.classes.includes(n))return;
  state.classes.push(n);state.base[n]={};state.classSettings[n]={zeroPeriod:false};save();renderAll();
}
function renameClass(){
  const old=$("#baseClass").value,n=prompt("新しいクラス名",old);
  if(!n||n===old||state.classes.includes(n))return;
  state.base[n]=state.base[old]||{};delete state.base[old];
  state.classSettings[n]=state.classSettings[old]||{zeroPeriod:false};delete state.classSettings[old];
  state.classes=state.classes.map(c=>c===old?n:c);
  Object.values(state.base).forEach(g=>Object.values(g).forEach(l=>{if(l?.participants)l.participants=l.participants.map(c=>c===old?n:c)}));
  Object.keys(state.daily).forEach(k=>{if(k.endsWith("__"+old)){state.daily[k.replace("__"+old,"__"+n)]=state.daily[k];delete state.daily[k]}});
  Object.values(state.daily).forEach(g=>Object.values(g).forEach(l=>{if(l?.participants)l.participants=l.participants.map(c=>c===old?n:c)}));
  save();renderAll();
}
function deleteClass(){
  const c=$("#baseClass").value;if(!c||!confirm(`${c}を削除しますか？`))return;
  state.classes=state.classes.filter(x=>x!==c);delete state.base[c];delete state.classSettings[c];
  Object.values(state.base).forEach(g=>Object.values(g).forEach(l=>{if(l?.participants)l.participants=l.participants.filter(x=>x!==c)}));
  Object.values(state.daily).forEach(g=>Object.values(g).forEach(l=>{if(l?.participants)l.participants=l.participants.filter(x=>x!==c)}));
  save();renderAll();
}

function renderAll(){
  fillClassSelects();
  renderBase();
  renderDaily();
  renderTeachers();
  renderHistory();
}

function init(){
  load();setupTabs();setupModeButtons();

  $("#baseDay").innerHTML=DAYS.map(d=>`<option value="${d}">${d}曜日</option>`).join("");
  $("#editDay").innerHTML=DAYS.map(d=>`<option value="${d}">${d}曜日</option>`).join("");
  $("#editPeriod").innerHTML=ALL_PERIODS.map(p=>`<option value="${p}">${p}限</option>`).join("");
  $("#teacherDepartment").innerHTML=`<option value="">選択してください</option>`+DEPARTMENTS.map(d=>`<option value="${d}">${d}</option>`).join("");

  const now=new Date(),local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
  $("#dailyDate").value=local;

  $("#baseClass").onchange=()=>{renderBase();updateZeroPeriodButton()};
  $("#baseDay").onchange=renderBase;
  $("#dailyClass").onchange=renderDaily;
  $("#dailyDate").onchange=renderDaily;
  $("#zeroPeriodBtn").onclick=toggleZeroPeriod;
  $("#addClassBtn").onclick=addClass;$("#renameClassBtn").onclick=renameClass;$("#deleteClassBtn").onclick=deleteClass;

  $("#addTeacherBtn").onclick=addTeacher;
  $("#saveLessonBtn").onclick=saveEditor;$("#deleteLessonBtn").onclick=deleteEditor;
  $("#copyLessonBtn").onclick=copyCurrentBaseCell;$("#pasteLessonBtn").onclick=pasteToCurrentBaseCell;
  $("#analyzeConditionsBtn").onclick=analyzeConditions;$("#applyConditionsBtn").onclick=applyConditions;

  $("#resetDayBtn").onclick=()=>{
    const date=currentDate();
    if(!confirm(`${date}の全クラスの変更をすべて解除しますか？`))return;
    state.classes.forEach(c=>delete state.daily[dayKey(date,c)]);
    addHistory("日別変更解除",`${date} 全クラス`);save();renderAll();
  };

  $("#exportBtn").onclick=exportData;
  $("#importInput").onchange=e=>{if(e.target.files[0])importData(e.target.files[0])};
  $("#clearAllBtn").onclick=()=>{if(confirm("全データを初期化します。元に戻せません。")){localStorage.removeItem(APP_KEY);location.reload()}};

  renderAll();
}
init();
