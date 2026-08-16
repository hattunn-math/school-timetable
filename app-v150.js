
const APP_KEY="school-timetable-app-data";
const SCHEMA_VERSION=4;
const DAYS=["月","火","水","木","金"];
const PERIODS=[1,2,3,4,5,6];
const ALL_PERIODS=[0,1,2,3,4,5,6];

let state={schemaVersion:SCHEMA_VERSION,classes:["1年1組","1年2組"],teachers:[],base:{},daily:{},history:[],classSettings:{},subjectOrder:[]};
let editing=null;
let copiedLesson=null;
let conditionCache=[];

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const cellKey=(d,p)=>`${d}-${p}`;
const dayKey=(date,cls)=>`${date}__${cls}`;

function uniqueId(){
  if(window.crypto?.randomUUID)return crypto.randomUUID();
  return "g-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
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
    rooms:rooms.filter(Boolean),
    participants:[...new Set(participants.filter(Boolean))],
    groupId:l.groupId||fallbackGroup||uniqueId()
  };
}
function migrate(data){
  if(!data)return state;
  data.schemaVersion=data.schemaVersion||1; data.classes=data.classes||["1年1組"]; data.teachers=data.teachers||[]; data.base=data.base||{}; data.daily=data.daily||data.overrides||{}; data.history=data.history||[]; data.classSettings=data.classSettings||{}; data.subjectOrder=data.subjectOrder||[];
  Object.keys(data.base).forEach(c=>Object.keys(data.base[c]||{}).forEach(k=>data.base[c][k]=normalizeLesson(data.base[c][k],c,`base-${c}-${k}`)));
  Object.keys(data.daily).forEach(dk=>{
    const cls=dk.split("__").slice(1).join("__");
    Object.keys(data.daily[dk]||{}).forEach(k=>{
      if(data.daily[dk][k]!==null)data.daily[dk][k]=normalizeLesson(data.daily[dk][k],cls,`daily-${dk}-${k}`);
    });
  });
  data.schemaVersion=SCHEMA_VERSION; return data;
}
function load(){const raw=localStorage.getItem(APP_KEY);if(raw){try{state=migrate(JSON.parse(raw))}catch(e){}}ensureClasses()}
function save(){localStorage.setItem(APP_KEY,JSON.stringify(state))}
function ensureClasses(){
  state.classes.forEach(c=>{
    if(!state.base[c])state.base[c]={};
    if(!state.classSettings[c])state.classSettings[c]={zeroPeriod:false};
    if(typeof state.classSettings[c].zeroPeriod!=="boolean")state.classSettings[c].zeroPeriod=false;
  });
}
function periodsForClass(cls){return state.classSettings?.[cls]?.zeroPeriod?[0,1,2,3,4,5,6]:[1,2,3,4,5,6]}
function getBase(cls,d,p){return state.base[cls]?.[cellKey(d,p)]||null}
function getDaily(cls,date,d,p){const dk=dayKey(date,cls),v=state.daily[dk]?.[cellKey(d,p)];if(v===null)return null;if(v!==undefined)return normalizeLesson(v,cls);return getBase(cls,d,p)}
function isChanged(cls,date,d,p){return state.daily[dayKey(date,cls)]?.[cellKey(d,p)]!==undefined}
function setDaily(cls,date,d,p,val){const dk=dayKey(date,cls);if(!state.daily[dk])state.daily[dk]={};state.daily[dk][cellKey(d,p)]=val===null?null:normalizeLesson(val,cls)}
function currentDate(){return $("#dailyDate").value}
function addHistory(type,detail){state.history.unshift({ts:new Date().toISOString(),type,detail});state.history=state.history.slice(0,300)}
function teachersText(l){if(!l)return"";const active=l.teachers.filter(t=>!l.absent.includes(t));if(l.substitute)active.push(l.substitute);return [...active,...l.absent.map(t=>`（${t}）`)].join("・")}
function roomsText(l){return (l?.rooms||[]).join("・")}
function participantsText(l){return (l?.participants||[]).join("・")}
function cloneLesson(l){return l?JSON.parse(JSON.stringify(l)):null}
function lessonCellHtml(l){
  if(!l)return `<div class="empty">空き</div>`;
  const group=(l.participants||[]).length>1?`<div class="participants">合同：${esc(participantsText(l))}</div>`:"";
  const room=roomsText(l)?`<div class="room">${esc(roomsText(l))}</div>`:"";
  return `<div class="subject">${esc(l.subject)}</div>${group}<div class="teacher">${esc(teachersText(l))}</div>${room}`;
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

function setupTabs(){$$(".tabs button").forEach(b=>b.onclick=()=>{$$(".tabs button,.tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#"+b.dataset.tab).classList.add("active");renderAll()})}
function fillSelects(){
  const old=$("#baseClass")?.value;
  if($("#baseClass")){
    $("#baseClass").innerHTML=state.classes.map(c=>`<option>${esc(c)}</option>`).join("");
    if(state.classes.includes(old))$("#baseClass").value=old;
  }
}
function renderBase(){
  const cls=$("#baseClass").value;if(!cls)return;
  let h="<tr><th>校時</th>"+DAYS.map(d=>`<th>${d}曜日</th>`).join("")+"</tr>";
  periodsForClass(cls).forEach(p=>{h+=`<tr><th>${p}限</th>`;DAYS.forEach(d=>{const l=getBase(cls,d,p);h+=`<td class="slot" data-day="${d}" data-period="${p}">`;h+=lessonCellHtml(l);h+="</td>"});h+="</tr>"});
  $("#baseTable").innerHTML=h;$("#baseTable").querySelectorAll(".slot").forEach(td=>td.onclick=()=>openEditor(true,cls,"",td.dataset.day,+td.dataset.period))
}
function activeTeachers(l){if(!l)return[];return [...l.teachers.filter(t=>!l.absent.includes(t)),...(l.substitute?[l.substitute]:[])]}
function conflictEntries(date){
  const teacherMap={},roomMap={},seenAtSlot=new Set();
  state.classes.forEach(c=>DAYS.forEach(d=>periodsForClass(c).forEach(p=>{
    const l=getDaily(c,date,d,p);if(!l)return;
    const gid=l.groupId||`${c}-${d}-${p}`;
    const slotGroup=`${d}-${p}-${gid}`;
    if(seenAtSlot.has(slotGroup))return;
    seenAtSlot.add(slotGroup);

    activeTeachers(l).forEach(t=>{
      const k=`${d}-${p}-${t}`;
      (teacherMap[k]??=[]).push({groupId:gid,c,d,p,t});
    });
    (l.rooms||[]).forEach(room=>{
      const k=`${d}-${p}-${room}`;
      (roomMap[k]??=[]).push({groupId:gid,c,d,p,room});
    });
  })));
  return {
    teacher:Object.values(teacherMap).filter(a=>new Set(a.map(x=>x.groupId)).size>1).flat(),
    room:Object.values(roomMap).filter(a=>new Set(a.map(x=>x.groupId)).size>1).flat()
  };
}
function hasConflict(cls,date,d,p){
  const l=getDaily(cls,date,d,p);if(!l)return false;
  const c=conflictEntries(date);
  return c.teacher.some(x=>x.groupId===l.groupId)||c.room.some(x=>x.groupId===l.groupId);
}
function dayNameForDate(dateStr){
  if(!dateStr)return null;
  const parts=dateStr.split("-").map(Number);
  if(parts.length!==3)return null;
  const dow=new Date(parts[0],parts[1]-1,parts[2]).getDay();
  return ({1:"月",2:"火",3:"水",4:"木",5:"金"})[dow]||null;
}
function allPeriodsForSchool(){
  return state.classes.some(c=>state.classSettings?.[c]?.zeroPeriod)?ALL_PERIODS:PERIODS;
}
function renderDaily(){
  const date=currentDate();
  const day=dayNameForDate(date);
  $("#selectedWeekday").textContent=day?`${day}曜日`:"土日";
  if(!day){
    $("#dailyTable").innerHTML="";
    $("#teacherDayTable").innerHTML="";
    $("#dailyStatus").innerHTML=`<div class="status warn">土曜日・日曜日は通常時間割の対象外です。</div>`;
    $("#dailyChanges").innerHTML=`<p class="muted">表示対象の授業はありません。</p>`;
    return;
  }

  renderSchoolDayTable(date,day);
  renderTeacherDayTable(date,day);

  const c=conflictEntries(date);
  const dayTeacher=c.teacher.filter(x=>x.d===day);
  const dayRoom=c.room.filter(x=>x.d===day);
  $("#dailyStatus").innerHTML=(dayTeacher.length||dayRoom.length)
    ?`<div class="status bad">この日の重複：教員 ${dayTeacher.length}件 / 教室 ${dayRoom.length}件</div>`
    :`<div class="status ok">この日の教員・教室の重複はありません。</div>`;
  renderDailyChanges();
}
function renderSchoolDayTable(date,day){
  let h='<tr><th class="sticky-first">校時</th>'+state.classes.map(c=>`<th>${esc(c)}</th>`).join("")+"</tr>";
  allPeriodsForSchool().forEach(p=>{
    h+=`<tr><th class="sticky-first">${p}限</th>`;
    state.classes.forEach(cls=>{
      if(!periodsForClass(cls).includes(p)){
        h+=`<td class="not-applicable">—</td>`;
        return;
      }
      const l=getDaily(cls,date,day,p);
      const changed=isChanged(cls,date,day,p);
      const conflict=hasConflict(cls,date,day,p);
      h+=`<td class="slot ${changed?"changed-cell":""} ${conflict?"conflict-cell":""}" data-class="${esc(cls)}" data-day="${day}" data-period="${p}">${lessonCellHtml(l)}</td>`;
    });
    h+="</tr>";
  });
  $("#dailyTable").innerHTML=h;
  $("#dailyTable").querySelectorAll("td.slot").forEach(td=>{
    td.onclick=()=>openEditor(false,td.dataset.class,date,td.dataset.day,+td.dataset.period);
  });
}
function extractSubjects(){
  const set=new Set();
  state.classes.forEach(cls=>{
    Object.values(state.base[cls]||{}).forEach(l=>{
      if(l?.subject)set.add(l.subject);
    });
  });
  return [...set];
}
function syncSubjectOrder(){
  const subjects=extractSubjects();
  const current=(state.subjectOrder||[]).filter(s=>subjects.includes(s));
  subjects.forEach(s=>{if(!current.includes(s))current.push(s)});
  state.subjectOrder=current;
}
function teacherSubjects(teacher){
  const set=new Set();
  state.classes.forEach(cls=>{
    Object.values(state.base[cls]||{}).forEach(l=>{
      if(l?.teachers?.includes(teacher)&&l.subject)set.add(l.subject);
    });
  });
  return [...set];
}
function allTeacherNames(){
  const set=new Set(state.teachers||[]);
  state.classes.forEach(cls=>{
    Object.values(state.base[cls]||{}).forEach(l=>{
      (l?.teachers||[]).forEach(t=>set.add(t));
    });
  });
  Object.values(state.daily||{}).forEach(grid=>{
    Object.values(grid||{}).forEach(l=>{
      if(!l)return;
      (l.teachers||[]).forEach(t=>set.add(t));
      if(l.substitute)set.add(l.substitute);
    });
  });
  return [...set].filter(Boolean);
}
function teacherPrimarySubject(teacher){
  syncSubjectOrder();
  const subjects=teacherSubjects(teacher);
  if(!subjects.length)return "";
  const ranks=subjects.map(s=>({s,r:state.subjectOrder.indexOf(s)})).sort((a,b)=>{
    const ar=a.r<0?9999:a.r,br=b.r<0?9999:b.r;
    return ar-br||a.s.localeCompare(b.s,"ja");
  });
  return ranks[0]?.s||subjects[0];
}
function sortedTeachers(){
  syncSubjectOrder();
  const order=state.subjectOrder||[];
  return allTeacherNames().sort((a,b)=>{
    const sa=teacherPrimarySubject(a),sb=teacherPrimarySubject(b);
    const ra=sa?order.indexOf(sa):9999, rb=sb?order.indexOf(sb):9999;
    const aa=ra<0?9999:ra, bb=rb<0?9999:rb;
    return aa-bb || sa.localeCompare(sb,"ja") || a.localeCompare(b,"ja");
  });
}
function uniqueLessonsForSlot(date,day,p){
  const map=new Map();
  state.classes.forEach(cls=>{
    if(!periodsForClass(cls).includes(p))return;
    const l=getDaily(cls,date,day,p);
    if(!l)return;
    const gid=l.groupId||`${cls}-${day}-${p}-${l.subject}`;
    if(!map.has(gid))map.set(gid,l);
  });
  return [...map.values()];
}
function teacherEntriesForPeriod(teacher,date,day,p){
  const entries=[];
  uniqueLessonsForSlot(date,day,p).forEach(l=>{
    if((l.teachers||[]).includes(teacher)){
      entries.push({
        subject:l.subject,
        classes:participantsText(l),
        rooms:roomsText(l),
        status:(l.absent||[]).includes(teacher)?"欠":""
      });
    }
    if(l.substitute===teacher){
      entries.push({
        subject:l.subject,
        classes:participantsText(l),
        rooms:roomsText(l),
        status:"代講"
      });
    }
  });
  return entries;
}
function teacherCellHtml(entries){
  if(!entries.length)return `<div class="empty">—</div>`;
  return entries.map(e=>{
    const status=e.status?`<span class="teacher-status ${e.status==="欠"?"absent-status":"sub-status"}">${esc(e.status)}</span>`:"";
    const room=e.rooms?`<div class="room">${esc(e.rooms)}</div>`:"";
    return `<div class="teacher-entry"><div><strong>${esc(e.classes)}</strong>　${esc(e.subject)} ${status}</div>${room}</div>`;
  }).join("");
}
function renderTeacherDayTable(date,day){
  syncSubjectOrder();
  const teachers=sortedTeachers();
  let h='<tr><th class="sticky-first teacher-name-head">教員</th>'+allPeriodsForSchool().map(p=>`<th>${p}限</th>`).join("")+"</tr>";
  teachers.forEach(t=>{
    const main=teacherPrimarySubject(t);
    h+=`<tr><th class="sticky-first teacher-name-cell"><strong>${esc(t)}</strong>${main?`<div class="small">${esc(main)}</div>`:""}</th>`;
    allPeriodsForSchool().forEach(p=>{
      const entries=teacherEntriesForPeriod(t,date,day,p);
      h+=`<td class="${entries.length>1?"teacher-conflict":""}">${teacherCellHtml(entries)}</td>`;
    });
    h+="</tr>";
  });
  $("#teacherDayTable").innerHTML=h;
}
function renderDailyChanges(){
  const date=currentDate();
  const day=dayNameForDate(date);
  if(!day){$("#dailyChanges").innerHTML=`<p class="muted">変更はありません。</p>`;return}

  const seen=new Set(),items=[];
  state.classes.forEach(cls=>{
    const obj=state.daily[dayKey(date,cls)]||{};
    Object.entries(obj).forEach(([k,v])=>{
      const [d,pstr]=k.split("-");
      if(d!==day)return;
      const p=+pstr;
      const after=v===null?null:normalizeLesson(v,cls);
      const gid=after?.groupId||`${cls}-${k}-deleted`;
      const dedupe=`${k}-${gid}`;
      if(seen.has(dedupe))return;
      seen.add(dedupe);

      const before=getBase(cls,d,p);
      items.push({
        d,p,
        classes:after?.participants?.length?participantsText(after):cls,
        before:before?before.subject+" / "+teachersText(before):"空き",
        after:after?after.subject+" / "+teachersText(after):"空き"
      });
    });
  });

  items.sort((a,b)=>a.p-b.p||a.classes.localeCompare(b.classes,"ja"));
  $("#dailyChanges").innerHTML=items.length?items.map(x=>`
    <div class="change-item"><strong>${x.p}限　${esc(x.classes)}</strong>
      <div class="small">通常：${esc(x.before)}</div>
      <div class="small">変更：${esc(x.after)}</div>
    </div>`).join(""):`<p class="muted">この日の変更はありません。</p>`;
}
function renderTeachers(){
  const auto=new Set(state.teachers||[]);
  Object.values(state.base).forEach(grid=>Object.values(grid).forEach(l=>{
    (l?.teachers||[]).forEach(t=>auto.add(t));
  }));
  state.teachers=[...auto].filter(Boolean).sort((a,b)=>a.localeCompare(b,"ja"));
  $("#teacherList").innerHTML=state.teachers.map(t=>`<span class="chip">${esc(t)}</span>`).join("");
  renderSubjectOrder();
}
function renderSubjectOrder(){
  syncSubjectOrder();
  const list=$("#subjectOrderList");
  if(!list)return;
  if(!state.subjectOrder.length){
    list.innerHTML=`<p class="muted">通常時間割に科目を登録すると、ここに表示されます。</p>`;
    return;
  }
  list.innerHTML=state.subjectOrder.map((s,i)=>`
    <div class="subject-order-item">
      <span class="subject-order-number">${i+1}</span>
      <strong>${esc(s)}</strong>
      <div class="subject-order-actions">
        <button class="sub subject-up" data-index="${i}" ${i===0?"disabled":""}>↑</button>
        <button class="sub subject-down" data-index="${i}" ${i===state.subjectOrder.length-1?"disabled":""}>↓</button>
      </div>
    </div>
  `).join("");
  list.querySelectorAll(".subject-up").forEach(b=>b.onclick=()=>moveSubject(+b.dataset.index,-1));
  list.querySelectorAll(".subject-down").forEach(b=>b.onclick=()=>moveSubject(+b.dataset.index,1));
}
function moveSubject(index,delta){
  syncSubjectOrder();
  const target=index+delta;
  if(target<0||target>=state.subjectOrder.length)return;
  [state.subjectOrder[index],state.subjectOrder[target]]=[state.subjectOrder[target],state.subjectOrder[index]];
  addHistory("教科表示順変更",state.subjectOrder.join(" → "));
  save();
  renderSubjectOrder();
  renderDaily();
}
function renderHistory(){$("#historyList").innerHTML=state.history.length?state.history.map(h=>`<div class="history-item"><strong>${esc(h.type)}</strong><div>${esc(h.detail)}</div><div class="small">${new Date(h.ts).toLocaleString("ja-JP")}</div></div>`).join(""):`<p class="muted">履歴はありません。</p>`}
function renderAll(){fillSelects();ensureZeroPeriodButton();renderDaily();renderBase();renderTeachers();renderHistory();updateZeroPeriodButton()}

function renderParticipantChecks(selected){
  const set=new Set(selected||[]);
  $("#participantChecks").innerHTML=state.classes.map(c=>`
    <label><input type="checkbox" value="${esc(c)}" ${set.has(c)?"checked":""}> ${esc(c)}</label>
  `).join("");
}
function selectedParticipants(){
  return [...$("#participantChecks").querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
}
function openEditor(isBase,cls,date,d,p){
  editing={isBase,cls,date,d,p};
  const l=isBase?getBase(cls,d,p):getDaily(cls,date,d,p);
  $("#dialogTitle").textContent=isBase?"通常授業の編集":"変更後授業の編集";
  $("#editDay").value=d;$("#editPeriod").value=p;
  $("#editSubject").value=l?.subject||"";
  $("#editTeachers").value=(l?.teachers||[]).join(",");
  $("#editAbsent").value=(l?.absent||[]).join(",");
  $("#editSubstitute").value=l?.substitute||"";
  $("#editRooms").value=(l?.rooms||[]).join(",");
  renderParticipantChecks(l?.participants?.length?l.participants:[cls]);
  $("#editDay").disabled=isBase;$("#editPeriod").disabled=isBase;
  $("#copyLessonBtn").style.display=isBase?"inline-block":"none";
  $("#pasteLessonBtn").style.display=isBase?"inline-block":"none";
  $("#pasteLessonBtn").disabled=!copiedLesson;
  $("#candidateBox").innerHTML="";
  $("#lessonDialog").showModal();
}
function lessonFromForm(existing=null){
  let participants=selectedParticipants();
  if(!participants.includes(editing.cls))participants.unshift(editing.cls);
  participants=[...new Set(participants)];
  return normalizeLesson({
    subject:$("#editSubject").value.trim(),
    teachers:$("#editTeachers").value.split(",").map(s=>s.trim()).filter(Boolean),
    absent:$("#editAbsent").value.split(",").map(s=>s.trim()).filter(Boolean),
    substitute:$("#editSubstitute").value.trim(),
    rooms:$("#editRooms").value.split(",").map(s=>s.trim()).filter(Boolean),
    participants,
    groupId:existing?.groupId||uniqueId()
  },editing.cls);
}
function removeBaseGroupAt(day,period,l){
  if(!l)return;
  (l.participants||[editing.cls]).forEach(c=>{
    const cur=getBase(c,day,period);
    if(cur?.groupId===l.groupId)delete state.base[c][cellKey(day,period)];
  });
}
function writeBaseGroup(day,period,l){
  l.participants.forEach(c=>{
    if(!state.classes.includes(c))return;
    if(period===0){
      if(!state.classSettings[c])state.classSettings[c]={zeroPeriod:false};
      state.classSettings[c].zeroPeriod=true;
    }
    state.base[c][cellKey(day,period)]=cloneLesson(l);
  });
}
function removeDailyGroup(date,day,period,l){
  if(!l)return;
  (l.participants||[editing.cls]).forEach(c=>{
    const cur=getDaily(c,date,day,period);
    if(cur?.groupId===l.groupId)setDaily(c,date,day,period,null);
  });
}
function writeDailyGroup(date,day,period,l){
  l.participants.forEach(c=>{
    if(period===0){
      if(!state.classSettings[c])state.classSettings[c]={zeroPeriod:false};
      state.classSettings[c].zeroPeriod=true;
    }
    setDaily(c,date,day,period,cloneLesson(l));
  });
}
function conflictingTargetGroups(date,day,period,participants,ownGroupId){
  const groups=new Map();
  participants.forEach(c=>{
    const t=getDaily(c,date,day,period);
    if(t&&t.groupId!==ownGroupId)groups.set(t.groupId,t);
  });
  return [...groups.values()];
}
function copyCurrentBaseCell(){
  if(!editing?.isBase)return;
  const l=getBase(editing.cls,editing.d,editing.p);
  if(!l){alert("このセルは空きなのでコピーできません。");return}
  copiedLesson=cloneLesson(l);
  $("#pasteLessonBtn").disabled=false;
  alert(`${editing.d}曜${editing.p}限「${l.subject}」をコピーしました。`);
}
function pasteToCurrentBaseCell(){
  if(!editing?.isBase)return;
  if(!copiedLesson){alert("先にコピーするセルを選んでください。");return}
  const old=getBase(editing.cls,editing.d,editing.p);
  if(old&&!confirm("貼り付け先には授業があります。上書きしますか？"))return;
  removeBaseGroupAt(editing.d,editing.p,old);
  const l=cloneLesson(copiedLesson);
  l.groupId=uniqueId();
  if(!l.participants.includes(editing.cls))l.participants=[editing.cls];
  writeBaseGroup(editing.d,editing.p,l);
  addHistory("通常時間割コピー",`${participantsText(l)} ${editing.d}${editing.p}限 ← ${l.subject}`);
  save();$("#lessonDialog").close();renderAll();
}
function saveEditor(){
  const existing=editing.isBase?getBase(editing.cls,editing.d,editing.p):getDaily(editing.cls,editing.date,editing.d,editing.p);
  const l=lessonFromForm(existing);
  if(!l.subject){alert("科目を入力してください。");return}

  if(editing.isBase){
    const occupied=l.participants.filter(c=>{
      const t=getBase(c,editing.d,editing.p);
      return t&&t.groupId!==existing?.groupId;
    });
    if(occupied.length&&!confirm(`${occupied.join("・")} の同じ時間に別授業があります。上書きしますか？`))return;
    removeBaseGroupAt(editing.d,editing.p,existing);
    writeBaseGroup(editing.d,editing.p,l);
    addHistory("通常時間割編集",`${participantsText(l)} ${editing.d}${editing.p}限 ${l.subject}`);
  }else{
    const nd=$("#editDay").value,np=+$("#editPeriod").value;
    if(nd===editing.d&&np===editing.p){
      const targets=conflictingTargetGroups(editing.date,nd,np,l.participants,existing?.groupId);
      if(targets.length&&!confirm("追加した参加クラスの同じ時間に別授業があります。上書きしますか？"))return;
      removeDailyGroup(editing.date,editing.d,editing.p,existing);
      writeDailyGroup(editing.date,nd,np,l);
      addHistory("手動変更",`${participantsText(l)} ${nd}${np}限 ${l.subject}`);
    }else{
      const targets=conflictingTargetGroups(editing.date,nd,np,l.participants,existing?.groupId);
      if(l.participants.length>1&&targets.length){
        alert("合同授業の移動先に別授業があります。現在は空き時間への移動のみ対応しています。");
        return;
      }
      if(l.participants.length===1&&targets.length===1){
        const target=targets[0];
        removeDailyGroup(editing.date,editing.d,editing.p,existing);
        writeDailyGroup(editing.date,nd,np,l);
        writeDailyGroup(editing.date,editing.d,editing.p,target);
      }else{
        removeDailyGroup(editing.date,editing.d,editing.p,existing);
        writeDailyGroup(editing.date,nd,np,l);
      }
      addHistory("手動移動",`${participantsText(l)} ${editing.d}${editing.p}限 → ${nd}${np}限 ${l.subject}`);
    }
  }
  save();$("#lessonDialog").close();renderAll();
}
function deleteEditor(){
  const l=editing.isBase?getBase(editing.cls,editing.d,editing.p):getDaily(editing.cls,editing.date,editing.d,editing.p);
  if(editing.isBase)removeBaseGroupAt(editing.d,editing.p,l);
  else removeDailyGroup(editing.date,editing.d,editing.p,l);
  addHistory(editing.isBase?"通常授業削除":"手動削除",`${editing.cls} ${editing.d}${editing.p}限`);
  save();$("#lessonDialog").close();renderAll();
}

function parsePeriods(s){if(s==="終日")return ALL_PERIODS;const m=s.match(/^(\d+)-(\d+)$/);if(m){let a=+m[1],b=+m[2];return ALL_PERIODS.filter(p=>p>=a&&p<=b)}const n=+s;return ALL_PERIODS.includes(n)?[n]:[]}
function parseConditions(){const lines=$("#conditionText").value.split(/\n/).map(x=>x.trim()).filter(Boolean),arr=[];lines.forEach((line,i)=>{const p=line.split(",").map(x=>x.trim());if(p.length<4)return arr.push({error:`${i+1}行目：形式が正しくありません`,raw:line});const[target,type,day,periodStr]=p;if(!DAYS.includes(day))return arr.push({error:`${i+1}行目：曜日が不正です`,raw:line});const periods=parsePeriods(periodStr);if(!periods.length)return arr.push({error:`${i+1}行目：時限が不正です`,raw:line});arr.push({target,type,day,periods,raw:line})});conditionCache=arr;return arr}
function analyzeConditions(){
  const arr=parseConditions(),date=currentDate(),issues=[],safe=[],seen=new Set();
  arr.forEach(c=>{
    if(c.error){issues.push(c.error);return}
    if(c.type==="不在"){
      state.classes.forEach(cls=>c.periods.filter(p=>periodsForClass(cls).includes(p)).forEach(p=>{
        const l=getDaily(cls,date,c.day,p);
        if(!l||!l.teachers.includes(c.target))return;
        const sk=`${l.groupId}-${c.day}-${p}-${c.target}`;
        if(seen.has(sk))return;seen.add(sk);
        if(l.teachers.length>=2)safe.push({kind:"absence-mark",day:c.day,p,teacher:c.target,lesson:l});
        else issues.push(`${participantsText(l)} ${c.day}${p}限 ${l.subject}：${c.target}先生が単独担当のため、代講または授業移動が必要`);
      }));
    }else if(c.type==="使用不可"){
      state.classes.forEach(cls=>c.periods.filter(p=>periodsForClass(cls).includes(p)).forEach(p=>{
        const l=getDaily(cls,date,c.day,p);
        if(!l||!(l.rooms||[]).includes(c.target))return;
        const sk=`room-${l.groupId}-${c.day}-${p}-${c.target}`;
        if(seen.has(sk))return;seen.add(sk);
        issues.push(`${participantsText(l)} ${c.day}${p}限 ${l.subject}：${c.target}が使用不可`);
      }));
    }else issues.push(`未対応条件：${c.raw}`);
  });
  $("#conditionResult").innerHTML=`<div class="status ${issues.length?"warn":"ok"}">安全に自動反映できるもの：${safe.length}件 / 要確認：${issues.length}件</div>`+
    safe.map(x=>`<div class="condition-item">${participantsText(x.lesson)} ${x.day}${x.p}限 ${x.lesson.subject}：${x.teacher} → （${x.teacher}）表示</div>`).join("")+
    issues.map(x=>`<div class="condition-item">${esc(x)}</div>`).join("");
  conditionCache.safe=safe;
}
function applyConditions(){
  analyzeConditions();
  const safe=conditionCache.safe||[],date=currentDate();
  safe.forEach(x=>{
    const l=cloneLesson(x.lesson);
    if(!l.absent.includes(x.teacher))l.absent.push(x.teacher);
    writeDailyGroup(date,x.day,x.p,l);
    addHistory("条件自動反映",`${participantsText(l)} ${x.day}${x.p}限 ${l.subject}：${x.teacher}欠員表示`);
  });
  save();renderAll();alert(`${safe.length}件を自動反映しました。`);
}
function ensureZeroPeriodButton(){
  if($("#zeroPeriodBtn"))return;
  const baseToolbar=$("#base .toolbar");
  if(!baseToolbar)return;
  const btn=document.createElement("button");
  btn.id="zeroPeriodBtn";
  btn.className="sub";
  btn.type="button";
  baseToolbar.appendChild(btn);
  btn.onclick=toggleZeroPeriod;
}

function updateZeroPeriodButton(){
  const btn=$("#zeroPeriodBtn");
  const cls=$("#baseClass")?.value;
  if(!btn||!cls)return;
  const enabled=!!state.classSettings?.[cls]?.zeroPeriod;
  btn.textContent=enabled?"0校時あり ✓":"0校時を追加";
}
function toggleZeroPeriod(){
  const cls=$("#baseClass").value;
  if(!cls)return;
  if(!state.classSettings[cls])state.classSettings[cls]={zeroPeriod:false};
  const now=!!state.classSettings[cls].zeroPeriod;
  if(now){
    const existing=getBase(cls,"月",0)||getBase(cls,"火",0)||getBase(cls,"水",0)||getBase(cls,"木",0)||getBase(cls,"金",0);
    if(existing&&!confirm("0校時に登録済みの授業があります。0校時を非表示にしますか？（データ自体は保持されます）"))return;
  }
  state.classSettings[cls].zeroPeriod=!now;
  addHistory("クラス設定",`${cls}：0校時 ${state.classSettings[cls].zeroPeriod?"あり":"なし"}`);
  save();
  renderAll();
}

function init(){
  load();setupTabs();$("#editDay").innerHTML=DAYS.map(d=>`<option>${d}</option>`).join("");$("#editPeriod").innerHTML=ALL_PERIODS.map(p=>`<option value="${p}">${p}限</option>`).join("");
  const now=new Date(),local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);$("#dailyDate").value=local;
  $("#baseClass").onchange=()=>{renderBase();updateZeroPeriodButton()};$("#dailyDate").onchange=renderDaily;
  $("#saveLessonBtn").onclick=saveEditor;$("#deleteLessonBtn").onclick=deleteEditor;$("#copyLessonBtn").onclick=copyCurrentBaseCell;$("#pasteLessonBtn").onclick=pasteToCurrentBaseCell;
  $("#addClassBtn").onclick=()=>{const n=prompt("追加するクラス名");if(n&&!state.classes.includes(n)){state.classes.push(n);state.base[n]={};state.classSettings[n]={zeroPeriod:false};save();renderAll()}};
  $("#renameClassBtn").onclick=()=>{const old=$("#baseClass").value,n=prompt("新しいクラス名",old);if(n&&n!==old&&!state.classes.includes(n)){state.base[n]=state.base[old]||{};delete state.base[old];state.classSettings[n]=state.classSettings[old]||{zeroPeriod:false};delete state.classSettings[old];state.classes=state.classes.map(c=>c===old?n:c);Object.values(state.base).forEach(grid=>Object.values(grid).forEach(l=>{if(l?.participants)l.participants=l.participants.map(c=>c===old?n:c)}));Object.keys(state.daily).forEach(k=>{if(k.endsWith("__"+old)){state.daily[k.replace("__"+old,"__"+n)]=state.daily[k];delete state.daily[k]}});Object.values(state.daily).forEach(grid=>Object.values(grid).forEach(l=>{if(l?.participants)l.participants=l.participants.map(c=>c===old?n:c)}));save();renderAll()}};
  $("#deleteClassBtn").onclick=()=>{const c=$("#baseClass").value;if(confirm(`${c}を削除しますか？`)){state.classes=state.classes.filter(x=>x!==c);delete state.base[c];delete state.classSettings[c];Object.values(state.base).forEach(grid=>Object.values(grid).forEach(l=>{if(l?.participants)l.participants=l.participants.filter(x=>x!==c)}));Object.values(state.daily).forEach(grid=>Object.values(grid).forEach(l=>{if(l?.participants)l.participants=l.participants.filter(x=>x!==c)}));save();renderAll()}};
  $("#addTeacherBtn").onclick=()=>{const t=$("#teacherName").value.trim();if(t&&!state.teachers.includes(t)){state.teachers.push(t);$("#teacherName").value="";save();renderTeachers()}};
  $("#analyzeConditionsBtn").onclick=analyzeConditions;$("#applyConditionsBtn").onclick=applyConditions;
  $("#undoBtn").onclick=()=>alert("現在は履歴表示までです。個別の『1つ前に戻す』は次版で強化予定です。");
  $("#resetDayBtn").onclick=()=>{
    const date=currentDate();
    if(confirm(`${date} の全クラスの変更をすべて解除しますか？`)){
      state.classes.forEach(cls=>delete state.daily[dayKey(date,cls)]);
      addHistory("日別変更解除",`${date} 全クラス`);
      save();renderAll();
    }
  };
  $("#exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`timetable-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)};
  $("#importInput").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{state=migrate(JSON.parse(r.result));save();renderAll();alert("読み込みました。")}catch(err){alert("読み込みに失敗しました。")}};r.readAsText(f)};
  $("#clearAllBtn").onclick=()=>{if(confirm("全データを初期化します。元に戻せません。実行しますか？")){localStorage.removeItem(APP_KEY);location.reload()}};
  renderAll()
}
init();
