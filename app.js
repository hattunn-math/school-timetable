
const APP_KEY="school-timetable-app-data";
const SCHEMA_VERSION=2;
const DAYS=["月","火","水","木","金"];
const PERIODS=[1,2,3,4,5,6];

let state={schemaVersion:SCHEMA_VERSION,classes:["1年1組","1年2組"],teachers:[],base:{},daily:{},history:[]};
let editing=null;
let copiedLesson=null;
let conditionCache=[];

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const cellKey=(d,p)=>`${d}-${p}`;
const dayKey=(date,cls)=>`${date}__${cls}`;

function normalizeLesson(l){
  if(!l)return null;
  return {subject:l.subject||"",teachers:Array.isArray(l.teachers)?l.teachers:(l.teacher?[l.teacher]:[]),absent:Array.isArray(l.absent)?l.absent:[],substitute:l.substitute||"",room:l.room||""};
}
function migrate(data){
  if(!data)return state;
  data.schemaVersion=data.schemaVersion||1; data.classes=data.classes||["1年1組"]; data.teachers=data.teachers||[]; data.base=data.base||{}; data.daily=data.daily||data.overrides||{}; data.history=data.history||[];
  Object.keys(data.base).forEach(c=>Object.keys(data.base[c]||{}).forEach(k=>data.base[c][k]=normalizeLesson(data.base[c][k])));
  Object.keys(data.daily).forEach(k=>Object.keys(data.daily[k]||{}).forEach(c=>{if(data.daily[k][c]!==null)data.daily[k][c]=normalizeLesson(data.daily[k][c])}));
  data.schemaVersion=SCHEMA_VERSION; return data;
}
function load(){const raw=localStorage.getItem(APP_KEY);if(raw){try{state=migrate(JSON.parse(raw))}catch(e){}}ensureClasses()}
function save(){localStorage.setItem(APP_KEY,JSON.stringify(state))}
function ensureClasses(){state.classes.forEach(c=>{if(!state.base[c])state.base[c]={}})}
function getBase(cls,d,p){return state.base[cls]?.[cellKey(d,p)]||null}
function getDaily(cls,date,d,p){const dk=dayKey(date,cls),v=state.daily[dk]?.[cellKey(d,p)];if(v===null)return null;if(v!==undefined)return normalizeLesson(v);return getBase(cls,d,p)}
function isChanged(cls,date,d,p){return state.daily[dayKey(date,cls)]?.[cellKey(d,p)]!==undefined}
function setDaily(cls,date,d,p,val){const dk=dayKey(date,cls);if(!state.daily[dk])state.daily[dk]={};state.daily[dk][cellKey(d,p)]=val===null?null:normalizeLesson(val)}
function currentDate(){return $("#dailyDate").value}
function addHistory(type,detail){state.history.unshift({ts:new Date().toISOString(),type,detail});state.history=state.history.slice(0,300)}
function teachersText(l){if(!l)return"";const active=l.teachers.filter(t=>!l.absent.includes(t));if(l.substitute)active.push(l.substitute);return [...active,...l.absent.map(t=>`（${t}）`)].join("・")}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

function setupTabs(){$$(".tabs button").forEach(b=>b.onclick=()=>{$$(".tabs button,.tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#"+b.dataset.tab).classList.add("active");renderAll()})}
function fillSelects(){["dailyClass","baseClass"].forEach(id=>{const old=$("#"+id).value;$("#"+id).innerHTML=state.classes.map(c=>`<option>${esc(c)}</option>`).join("");if(state.classes.includes(old))$("#"+id).value=old})}

function renderGrid(table,cls,date){
  let h="<tr><th>校時</th>"+DAYS.map(d=>`<th>${d}曜日</th>`).join("")+"</tr>";
  PERIODS.forEach(p=>{
    h+=`<tr><th>${p}限</th>`;
    DAYS.forEach(d=>{
      const l=getDaily(cls,date,d,p),changed=isChanged(cls,date,d,p),conflict=hasConflict(cls,date,d,p);
      h+=`<td class="slot ${changed?"changed-cell":""} ${conflict?"conflict-cell":""}" data-day="${d}" data-period="${p}">`;
      h+=l?`<div class="subject">${esc(l.subject)}</div><div class="teacher">${esc(teachersText(l))}</div>${l.room?`<div class="room">${esc(l.room)}</div>`:""}`:`<div class="empty">空き</div>`;
      h+="</td>";
    });
    h+="</tr>";
  });
  table.innerHTML=h;
  table.querySelectorAll(".slot").forEach(td=>td.onclick=()=>openEditor(false,cls,date,td.dataset.day,+td.dataset.period));
}
function renderBase(){
  const cls=$("#baseClass").value;if(!cls)return;
  let h="<tr><th>校時</th>"+DAYS.map(d=>`<th>${d}曜日</th>`).join("")+"</tr>";
  PERIODS.forEach(p=>{h+=`<tr><th>${p}限</th>`;DAYS.forEach(d=>{const l=getBase(cls,d,p);h+=`<td class="slot" data-day="${d}" data-period="${p}">`;h+=l?`<div class="subject">${esc(l.subject)}</div><div class="teacher">${esc(teachersText(l))}</div>${l.room?`<div class="room">${esc(l.room)}</div>`:""}`:`<div class="empty">空き</div>`;h+="</td>"});h+="</tr>"});
  $("#baseTable").innerHTML=h;$("#baseTable").querySelectorAll(".slot").forEach(td=>td.onclick=()=>openEditor(true,cls,"",td.dataset.day,+td.dataset.period))
}
function activeTeachers(l){if(!l)return[];return [...l.teachers.filter(t=>!l.absent.includes(t)),...(l.substitute?[l.substitute]:[])]}
function conflictEntries(date){
  const teacherMap={},roomMap={};
  state.classes.forEach(c=>DAYS.forEach(d=>PERIODS.forEach(p=>{const l=getDaily(c,date,d,p);if(!l)return;activeTeachers(l).forEach(t=>{const k=`${d}-${p}-${t}`;(teacherMap[k]??=[]).push({c,d,p,t})});if(l.room){const k=`${d}-${p}-${l.room}`;(roomMap[k]??=[]).push({c,d,p,room:l.room})}})));
  return {teacher:Object.values(teacherMap).filter(a=>a.length>1).flat(),room:Object.values(roomMap).filter(a=>a.length>1).flat()}
}
function hasConflict(cls,date,d,p){const c=conflictEntries(date);return c.teacher.some(x=>x.c===cls&&x.d===d&&x.p===p)||c.room.some(x=>x.c===cls&&x.d===d&&x.p===p)}
function renderDaily(){const cls=$("#dailyClass").value;if(!cls)return;renderGrid($("#dailyTable"),cls,currentDate());const c=conflictEntries(currentDate());$("#dailyStatus").innerHTML=(c.teacher.length||c.room.length)?`<div class="status bad">重複あり：教員 ${c.teacher.length}件 / 教室 ${c.room.length}件</div>`:`<div class="status ok">教員・教室の重複はありません。</div>`;renderDailyChanges()}
function renderDailyChanges(){const cls=$("#dailyClass").value,date=currentDate(),obj=state.daily[dayKey(date,cls)]||{},entries=Object.entries(obj);$("#dailyChanges").innerHTML=entries.length?entries.map(([k,v])=>{const[d,p]=k.split("-"),before=getBase(cls,d,+p),after=v===null?null:normalizeLesson(v);return `<div class="change-item"><strong>${d}曜 ${p}限</strong><div class="small">通常：${esc(before?before.subject+" / "+teachersText(before):"空き")}</div><div class="small">変更：${esc(after?after.subject+" / "+teachersText(after):"空き")}</div></div>`}).join(""):`<p class="muted">この日の変更はありません。</p>`}
function renderTeachers(){const auto=new Set(state.teachers);Object.values(state.base).forEach(grid=>Object.values(grid).forEach(l=>normalizeLesson(l)?.teachers.forEach(t=>auto.add(t))));state.teachers=[...auto].filter(Boolean).sort();$("#teacherList").innerHTML=state.teachers.map(t=>`<span class="chip">${esc(t)}</span>`).join("")}
function renderHistory(){$("#historyList").innerHTML=state.history.length?state.history.map(h=>`<div class="history-item"><strong>${esc(h.type)}</strong><div>${esc(h.detail)}</div><div class="small">${new Date(h.ts).toLocaleString("ja-JP")}</div></div>`).join(""):`<p class="muted">履歴はありません。</p>`}
function renderAll(){fillSelects();renderDaily();renderBase();renderTeachers();renderHistory()}

function openEditor(isBase,cls,date,d,p){
  editing={isBase,cls,date,d,p};const l=isBase?getBase(cls,d,p):getDaily(cls,date,d,p);
  $("#dialogTitle").textContent=isBase?"通常授業の編集":"変更後授業の編集";$("#editDay").value=d;$("#editPeriod").value=p;$("#editSubject").value=l?.subject||"";$("#editTeachers").value=(l?.teachers||[]).join(",");$("#editAbsent").value=(l?.absent||[]).join(",");$("#editSubstitute").value=l?.substitute||"";$("#editRoom").value=l?.room||cls;
  $("#editDay").disabled=isBase;$("#editPeriod").disabled=isBase;$("#copyLessonBtn").style.display=isBase?"inline-block":"none";$("#pasteLessonBtn").style.display=isBase?"inline-block":"none";$("#pasteLessonBtn").disabled=!copiedLesson;
  $("#candidateBox").innerHTML="";$("#lessonDialog").showModal()
}
function lessonFromForm(){return normalizeLesson({subject:$("#editSubject").value.trim(),teachers:$("#editTeachers").value.split(",").map(s=>s.trim()).filter(Boolean),absent:$("#editAbsent").value.split(",").map(s=>s.trim()).filter(Boolean),substitute:$("#editSubstitute").value.trim(),room:$("#editRoom").value.trim()})}
function copyCurrentBaseCell(){if(!editing?.isBase)return;const l=getBase(editing.cls,editing.d,editing.p);if(!l){alert("このセルは空きなのでコピーできません。");return}copiedLesson=JSON.parse(JSON.stringify(normalizeLesson(l)));$("#pasteLessonBtn").disabled=false;alert(`${editing.d}曜${editing.p}限「${l.subject}」をコピーしました。`)}
function pasteToCurrentBaseCell(){if(!editing?.isBase)return;if(!copiedLesson){alert("先にコピーするセルを選んでください。");return}const l=JSON.parse(JSON.stringify(copiedLesson));state.base[editing.cls][cellKey(editing.d,editing.p)]=l;addHistory("通常時間割コピー",`${editing.cls} ${editing.d}${editing.p}限 ← ${l.subject}`);save();$("#lessonDialog").close();renderAll()}
function saveEditor(){
  const l=lessonFromForm();if(!l.subject){alert("科目を入力してください。");return}
  if(editing.isBase){state.base[editing.cls][cellKey(editing.d,editing.p)]=l;addHistory("通常時間割編集",`${editing.cls} ${editing.d}${editing.p}限 ${l.subject}`)}
  else{const nd=$("#editDay").value,np=+$("#editPeriod").value;if(nd===editing.d&&np===editing.p){setDaily(editing.cls,editing.date,nd,np,l);addHistory("手動変更",`${editing.cls} ${nd}${np}限 ${l.subject}`)}else{const target=getDaily(editing.cls,editing.date,nd,np);setDaily(editing.cls,editing.date,nd,np,l);setDaily(editing.cls,editing.date,editing.d,editing.p,target||null);addHistory("手動移動/入替",`${editing.cls} ${editing.d}${editing.p}限 → ${nd}${np}限 ${l.subject}`)}}
  save();$("#lessonDialog").close();renderAll()
}
function deleteEditor(){if(editing.isBase)delete state.base[editing.cls][cellKey(editing.d,editing.p)];else setDaily(editing.cls,editing.date,editing.d,editing.p,null);addHistory(editing.isBase?"通常授業削除":"手動削除",`${editing.cls} ${editing.d}${editing.p}限`);save();$("#lessonDialog").close();renderAll()}

function parsePeriods(s){if(s==="終日")return PERIODS;const m=s.match(/^(\d+)-(\d+)$/);if(m){let a=+m[1],b=+m[2];return PERIODS.filter(p=>p>=a&&p<=b)}const n=+s;return PERIODS.includes(n)?[n]:[]}
function parseConditions(){const lines=$("#conditionText").value.split(/\n/).map(x=>x.trim()).filter(Boolean),arr=[];lines.forEach((line,i)=>{const p=line.split(",").map(x=>x.trim());if(p.length<4)return arr.push({error:`${i+1}行目：形式が正しくありません`,raw:line});const[target,type,day,periodStr]=p;if(!DAYS.includes(day))return arr.push({error:`${i+1}行目：曜日が不正です`,raw:line});const periods=parsePeriods(periodStr);if(!periods.length)return arr.push({error:`${i+1}行目：時限が不正です`,raw:line});arr.push({target,type,day,periods,raw:line})});conditionCache=arr;return arr}
function analyzeConditions(){const arr=parseConditions(),date=currentDate(),issues=[],safe=[];arr.forEach(c=>{if(c.error){issues.push(c.error);return}if(c.type==="不在"){state.classes.forEach(cls=>c.periods.forEach(p=>{const l=getDaily(cls,date,c.day,p);if(!l||!l.teachers.includes(c.target))return;if(l.teachers.length>=2)safe.push({kind:"absence-mark",cls,day:c.day,p,teacher:c.target,lesson:l});else issues.push(`${cls} ${c.day}${p}限 ${l.subject}：${c.target}先生が単独担当のため、代講または授業移動が必要`)}))}else if(c.type==="使用不可"){state.classes.forEach(cls=>c.periods.forEach(p=>{const l=getDaily(cls,date,c.day,p);if(l?.room===c.target)issues.push(`${cls} ${c.day}${p}限 ${l.subject}：${c.target}が使用不可`)}))}else issues.push(`未対応条件：${c.raw}`)});$("#conditionResult").innerHTML=`<div class="status ${issues.length?"warn":"ok"}">安全に自動反映できるもの：${safe.length}件 / 要確認：${issues.length}件</div>`+safe.map(x=>`<div class="condition-item">${x.cls} ${x.day}${x.p}限 ${x.lesson.subject}：${x.teacher} → （${x.teacher}）表示</div>`).join("")+issues.map(x=>`<div class="condition-item">${esc(x)}</div>`).join("");conditionCache.safe=safe}
function applyConditions(){analyzeConditions();const safe=conditionCache.safe||[],date=currentDate();safe.forEach(x=>{const l=normalizeLesson(getDaily(x.cls,date,x.day,x.p));if(!l.absent.includes(x.teacher))l.absent.push(x.teacher);setDaily(x.cls,date,x.day,x.p,l);addHistory("条件自動反映",`${x.cls} ${x.day}${x.p}限 ${x.lesson.subject}：${x.teacher}欠員表示`)});save();renderAll();alert(`${safe.length}件を自動反映しました。`)}

function init(){
  load();setupTabs();$("#editDay").innerHTML=DAYS.map(d=>`<option>${d}</option>`).join("");$("#editPeriod").innerHTML=PERIODS.map(p=>`<option value="${p}">${p}限</option>`).join("");
  const now=new Date(),local=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);$("#dailyDate").value=local;
  $("#dailyClass").onchange=renderDaily;$("#baseClass").onchange=renderBase;$("#dailyDate").onchange=renderDaily;
  $("#saveLessonBtn").onclick=saveEditor;$("#deleteLessonBtn").onclick=deleteEditor;$("#copyLessonBtn").onclick=copyCurrentBaseCell;$("#pasteLessonBtn").onclick=pasteToCurrentBaseCell;
  $("#addClassBtn").onclick=()=>{const n=prompt("追加するクラス名");if(n&&!state.classes.includes(n)){state.classes.push(n);state.base[n]={};save();renderAll()}};
  $("#renameClassBtn").onclick=()=>{const old=$("#baseClass").value,n=prompt("新しいクラス名",old);if(n&&n!==old&&!state.classes.includes(n)){state.base[n]=state.base[old]||{};delete state.base[old];state.classes=state.classes.map(c=>c===old?n:c);Object.keys(state.daily).forEach(k=>{if(k.endsWith("__"+old)){state.daily[k.replace("__"+old,"__"+n)]=state.daily[k];delete state.daily[k]}});save();renderAll()}};
  $("#deleteClassBtn").onclick=()=>{const c=$("#baseClass").value;if(confirm(`${c}を削除しますか？`)){state.classes=state.classes.filter(x=>x!==c);delete state.base[c];save();renderAll()}};
  $("#addTeacherBtn").onclick=()=>{const t=$("#teacherName").value.trim();if(t&&!state.teachers.includes(t)){state.teachers.push(t);$("#teacherName").value="";save();renderTeachers()}};
  $("#analyzeConditionsBtn").onclick=analyzeConditions;$("#applyConditionsBtn").onclick=applyConditions;
  $("#undoBtn").onclick=()=>alert("v1.1では履歴表示までです。個別の『1つ前に戻す』は次版で強化予定です。");
  $("#resetDayBtn").onclick=()=>{const k=dayKey(currentDate(),$("#dailyClass").value);if(confirm("この日の変更をすべて解除しますか？")){delete state.daily[k];addHistory("日別変更解除",k);save();renderAll()}};
  $("#exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`timetable-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)};
  $("#importInput").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{state=migrate(JSON.parse(r.result));save();renderAll();alert("読み込みました。")}catch(err){alert("読み込みに失敗しました。")}};r.readAsText(f)};
  $("#clearAllBtn").onclick=()=>{if(confirm("全データを初期化します。元に戻せません。実行しますか？")){localStorage.removeItem(APP_KEY);location.reload()}};
  renderAll()
}
init();
