(() => {
  state.moveRecords = Array.isArray(state.moveRecords) ? state.moveRecords : [];
  let searchQuery = "";
  let focusedCell = null;
  const originalOpenEditor = openEditor;
  const originalSaveEditor = saveEditor;
  const originalDeleteEditor = deleteEditor;
  const originalRenderAll = renderAll;

  function addDays(s,n){const d=parseLocalDate(s);d.setDate(d.getDate()+n);return isoLocal(d)}
  function twoWeekdays(s){if(!s)return[];const w1=weekDates(s),w2=weekDates(addDays(w1["月"],7));return [...DAYS.map(day=>({date:w1[day],day})),...DAYS.map(day=>({date:w2[day],day}))]}
  function fmtDate(s){if(!s)return"";const d=parseLocalDate(s);return `${d.getMonth()+1}/${d.getDate()}`}
  function lessonMatches(l,q){return !!(l?.subject&&l.subject.toLocaleLowerCase("ja").includes(q.toLocaleLowerCase("ja")))}
  function lessonSummary(l){if(!l)return"空き";return [l.subject,teachersText(l),roomsText(l)].filter(Boolean).join(" / ")}
  function recordMatchesSlot(r,cls,date,day,p){return !!r&&(r.participants||[]).includes(cls)&&((r.fromDate===date&&r.fromDay===day&&+r.fromPeriod===+p)||(r.toDate===date&&r.toDay===day&&+r.toPeriod===+p))}
  function moveTypeForSlot(cls,date,day,p){const r=[...state.moveRecords].reverse().find(x=>recordMatchesSlot(x,cls,date,day,p));return !r?"":r.fromDate===r.toDate?"same-day":"cross-day"}
  function movementClass(cls,date,day,p){const t=moveTypeForSlot(cls,date,day,p);return t==="same-day"?"same-day-change":t==="cross-day"?"cross-day-change":""}
  function searchHitDaily(cls,date,day,p){return !!searchQuery&&(lessonMatches(getBase(cls,day,p),searchQuery)||lessonMatches(getDaily(cls,date,day,p),searchQuery))}
  function searchHitBase(cls,day,p){return !!searchQuery&&lessonMatches(getBase(cls,day,p),searchQuery)}
  function focusClassFor(cls,date,day,p){return focusedCell&&focusedCell.cls===cls&&focusedCell.date===date&&focusedCell.day===day&&+focusedCell.p===+p?"focused-search-cell":""}

  function injectSearchUi(){
    if($("#subjectSearchBar"))return;
    const wrap=document.createElement("section");wrap.id="subjectSearchBar";wrap.className="global-search card";
    wrap.innerHTML=`<div class="global-search-row"><div class="global-search-input-wrap"><label>科目検索（部分一致）</label><input id="subjectSearchInput" type="search" placeholder="例：数学 / 数学Ⅱ / LHR"></div><button id="subjectSearchBtn" class="primary" type="button">検索</button><button id="subjectSearchClear" class="sub" type="button">クリア</button><div class="small search-period-note">日々の変更：選択日を含む週＋翌週（月〜金）</div></div><div id="subjectSearchResults" class="search-results hidden"></div>`;
    document.querySelector(".tabs").insertAdjacentElement("afterend",wrap);
    $("#subjectSearchBtn").onclick=runSubjectSearch;$("#subjectSearchClear").onclick=clearSubjectSearch;$("#subjectSearchInput").addEventListener("keydown",e=>{if(e.key==="Enter")runSubjectSearch()});
  }
  function injectTargetDate(){
    if($("#dailyTargetDateWrap"))return;
    const periodWrap=$("#editPeriod")?.parentElement;if(!periodWrap)return;
    const div=document.createElement("div");div.id="dailyTargetDateWrap";div.className="hidden";div.innerHTML=`<label>変更先日付</label><input id="editTargetDate" type="date">`;periodWrap.insertAdjacentElement("afterend",div);
    $("#editTargetDate").addEventListener("change",()=>{const d=dayNameForDate($("#editTargetDate").value);if(d)$("#editDay").value=d});
  }

  openEditor=function(isBase,cls,date,day,p){
    originalOpenEditor(isBase,cls,date,day,p);injectTargetDate();$("#dailyTargetDateWrap").classList.toggle("hidden",isBase);
    if(isBase){$("#editDay").disabled=true;$("#editPeriod").disabled=true}else{$("#editTargetDate").value=date;$("#editDay").value=day;$("#editDay").disabled=true;$("#editPeriod").disabled=false}
  };

  saveEditor=function(){
    if(editing?.isBase){originalSaveEditor();return}
    const existing=getDaily(editing.cls,editing.date,editing.day,editing.p),l=lessonFromForm(existing);
    if(!l.subject){alert("科目名を入力してください。");return}if(!l.teachers.length&&!confirm("担当教員が未設定です。このまま保存しますか？"))return;
    const targetDate=$("#editTargetDate")?.value||editing.date,targetDay=dayNameForDate(targetDate),np=+$("#editPeriod").value;
    if(!targetDay){alert("変更先は月〜金の日付を選択してください。");return}$("#editDay").value=targetDay;
    const warning=lessonAvailabilityWarnings(l,targetDay,np);if(warning&&!confirm(warning+"\nそれでも保存しますか？"))return;
    const sameSlot=targetDate===editing.date&&targetDay===editing.day&&np===editing.p;
    if(sameSlot){removeDailyGroup(editing.date,editing.day,editing.p,existing);writeDailyGroup(editing.date,editing.day,editing.p,l);addHistory("手動変更",`${participantsText(l)} ${fmtDate(editing.date)} ${editing.day}${editing.p}限 ${l.subject}`)}
    else{
      const targets=[];l.participants.forEach(c=>{const t=getDaily(c,targetDate,targetDay,np);if(t&&t.groupId!==existing?.groupId)targets.push(t)});if(targets.length&&!confirm("移動先の一部クラスに別授業があります。上書きしますか？"))return;
      removeDailyGroup(editing.date,editing.day,editing.p,existing);writeDailyGroup(targetDate,targetDay,np,l);
      state.moveRecords.push({id:uniqueId(),groupId:l.groupId,fromDate:editing.date,fromDay:editing.day,fromPeriod:+editing.p,toDate:targetDate,toDay:targetDay,toPeriod:np,participants:[...(l.participants||[])],subject:l.subject,ts:new Date().toISOString()});state.moveRecords=state.moveRecords.slice(-600);
      const kind=targetDate===editing.date?"同日移動":"日またぎ移動";addHistory(kind,`${participantsText(l)} ${fmtDate(editing.date)} ${editing.day}${editing.p}限 → ${fmtDate(targetDate)} ${targetDay}${np}限 ${l.subject}`)
    }
    save();$("#lessonDialog").close();renderAll();if(searchQuery)renderSearchResults();
  };

  deleteEditor=function(){
    if(editing?.isBase){originalDeleteEditor();return}
    const l=getDaily(editing.cls,editing.date,editing.day,editing.p);removeDailyGroup(editing.date,editing.day,editing.p,l);state.moveRecords=state.moveRecords.filter(r=>!recordMatchesSlot(r,editing.cls,editing.date,editing.day,editing.p));addHistory("手動削除",`${editing.cls} ${fmtDate(editing.date)} ${editing.day}${editing.p}限`);save();$("#lessonDialog").close();renderAll();if(searchQuery)renderSearchResults();
  };

  renderBaseClass=function(){
    const cls=$("#baseClass").value;if(!cls)return;$("#baseViewTitle").textContent=`通常時間割：${cls}`;let h=`<tr><th class="period-head sticky-first">校時</th>${DAYS.map(d=>`<th class="day-head">${d}曜日</th>`).join("")}</tr>`;
    periodsForClass(cls).forEach(p=>{h+=`<tr><th class="period-head sticky-first">${p}限</th>`;DAYS.forEach(d=>{const l=getBase(cls,d,p),hit=searchHitBase(cls,d,p),focus=focusedCell?.kind==="base"?focusClassFor(cls,"",d,p):"";h+=`<td class="slot ${hit?"search-hit":""} ${focus}" data-class="${esc(cls)}" data-day="${d}" data-period="${p}">${cellHtml(l)}</td>`});h+="</tr>"});
    $("#baseTable").innerHTML=h;$("#baseTable").querySelectorAll("td.slot").forEach(td=>td.onclick=()=>openEditor(true,td.dataset.class,"",td.dataset.day,+td.dataset.period));fitTimetableCells($("#baseTable"));
  };
  renderBaseDay=function(){
    const day=$("#baseDay").value||"月";$("#baseViewTitle").textContent=`通常時間割：${day}曜日（全クラス）`;let h=`<tr><th class="period-head sticky-first">校時</th>${state.classes.map(c=>`<th class="class-head">${esc(c)}</th>`).join("")}</tr>`;
    allPeriodsForSchool().forEach(p=>{h+=`<tr><th class="period-head sticky-first">${p}限</th>`;state.classes.forEach(cls=>{if(!periodsForClass(cls).includes(p)){h+=`<td class="not-applicable">—</td>`;return}const l=getBase(cls,day,p),hit=searchHitBase(cls,day,p),focus=focusedCell?.kind==="base"?focusClassFor(cls,"",day,p):"";h+=`<td class="slot ${hit?"search-hit":""} ${focus}" data-class="${esc(cls)}" data-day="${day}" data-period="${p}">${cellHtml(l)}</td>`});h+="</tr>"});
    $("#baseTable").innerHTML=h;$("#baseTable").querySelectorAll("td.slot").forEach(td=>td.onclick=()=>openEditor(true,td.dataset.class,"",td.dataset.day,+td.dataset.period));fitTimetableCells($("#baseTable"));
  };

  renderDailyDay=function(date,day){
    if(!day){$("#dailyTable").innerHTML="";$("#dailyStatus").innerHTML=`<div class="status warn">土日は通常時間割の対象外です。</div>`;return}
    let h=`<tr><th class="period-head sticky-first">校時</th>${state.classes.map(c=>`<th class="class-head">${esc(c)}</th>`).join("")}</tr>`;
    allPeriodsForSchool().forEach(p=>{h+=`<tr><th class="period-head sticky-first">${p}限</th>`;state.classes.forEach(cls=>{if(!periodsForClass(cls).includes(p)){h+=`<td class="not-applicable">—</td>`;return}const l=getDaily(cls,date,day,p),changed=isChanged(cls,date,day,p),conflict=hasConflict(cls,date,day,p),moveClass=movementClass(cls,date,day,p),hit=searchHitDaily(cls,date,day,p),focus=focusClassFor(cls,date,day,p);h+=`<td class="slot ${changed?"changed-cell":""} ${moveClass} ${hit?"search-hit":""} ${focus} ${conflict?"conflict-cell":""}" data-class="${esc(cls)}" data-date="${date}" data-day="${day}" data-period="${p}">${cellHtml(l)}</td>`});h+="</tr>"});
    $("#dailyTable").innerHTML=h;$("#dailyTable").querySelectorAll("td.slot").forEach(td=>td.onclick=()=>openEditor(false,td.dataset.class,td.dataset.date,td.dataset.day,+td.dataset.period));fitTimetableCells($("#dailyTable"));renderDayStatus(date,day);
  };
  renderDailyClassWeek=function(date){
    const cls=$("#dailyClass").value;if(!cls)return;const wd=weekDates(date);let h=`<tr><th class="period-head sticky-first">校時</th>${DAYS.map(d=>`<th class="day-head">${d}曜日<div class="small">${wd[d].slice(5).replace("-","/")}</div></th>`).join("")}</tr>`;
    periodsForClass(cls).forEach(p=>{h+=`<tr><th class="period-head sticky-first">${p}限</th>`;DAYS.forEach(day=>{const actual=wd[day],l=getDaily(cls,actual,day,p),changed=isChanged(cls,actual,day,p),conflict=hasConflict(cls,actual,day,p),moveClass=movementClass(cls,actual,day,p),hit=searchHitDaily(cls,actual,day,p),focus=focusClassFor(cls,actual,day,p);h+=`<td class="slot ${changed?"changed-cell":""} ${moveClass} ${hit?"search-hit":""} ${focus} ${conflict?"conflict-cell":""}" data-class="${esc(cls)}" data-date="${actual}" data-day="${day}" data-period="${p}">${cellHtml(l)}</td>`});h+="</tr>"});
    $("#dailyTable").innerHTML=h;$("#dailyTable").querySelectorAll("td.slot").forEach(td=>td.onclick=()=>openEditor(false,td.dataset.class,td.dataset.date,td.dataset.day,+td.dataset.period));fitTimetableCells($("#dailyTable"));$("#dailyStatus").innerHTML=`<div class="status ok">基準日を含む1週間を表示しています。オレンジ＝同日移動、青＝日またぎ移動、赤＝重複または勤務時間外です。</div>`;
  };

  function collectSearchResults(q){
    const out=[],seenBase=new Set();
    state.classes.forEach(cls=>DAYS.forEach(day=>periodsForClass(cls).forEach(p=>{const l=getBase(cls,day,p);if(!lessonMatches(l,q))return;const key=`${l.groupId||cls}-${day}-${p}`;if(seenBase.has(key))return;seenBase.add(key);out.push({kind:"base",label:"通常",date:"",day,p,cls:(l.participants||[cls]).join("・"),jumpCls:cls,subject:l.subject,teachers:teachersText(l),rooms:roomsText(l),before:l,after:l,changed:false})})));
    const seenDaily=new Set();twoWeekdays(currentDate()).forEach(({date,day})=>{state.classes.forEach(cls=>periodsForClass(cls).forEach(p=>{const before=getBase(cls,day,p),after=getDaily(cls,date,day,p);if(!lessonMatches(before,q)&&!lessonMatches(after,q))return;const gid=after?.groupId||before?.groupId||`${cls}-${date}-${day}-${p}`,key=`${date}-${day}-${p}-${gid}`;if(seenDaily.has(key))return;seenDaily.add(key);const parts=after?.participants?.length?after.participants:before?.participants?.length?before.participants:[cls];out.push({kind:"daily",label:"日々",date,day,p,cls:parts.join("・"),jumpCls:parts[0]||cls,subject:after?.subject||"空き",teachers:teachersText(after),rooms:roomsText(after),before,after,changed:isChanged(cls,date,day,p),moveType:moveTypeForSlot(cls,date,day,p)})}))});return out;
  }
  function resultChangeText(r){if(r.kind==="base")return"—";const b=lessonSummary(r.before),a=lessonSummary(r.after);if(!r.changed&&b===a)return"変更なし";const k=r.moveType==="same-day"?"同日移動：":r.moveType==="cross-day"?"日またぎ：":"";return `${k}${b} → ${a}`}
  function renderSearchResults(){
    const box=$("#subjectSearchResults");if(!box)return;if(!searchQuery){box.classList.add("hidden");box.innerHTML="";renderBase();renderDaily();return}
    const results=collectSearchResults(searchQuery);box.classList.remove("hidden");box.innerHTML=`<div class="search-summary"><strong>「${esc(searchQuery)}」</strong>：${results.length}件</div>`+(results.length?`<div class="search-table-wrap"><table class="search-table"><tr><th>区分</th><th>日付/曜日</th><th>クラス</th><th>校時</th><th>科目</th><th>担当教員</th><th>教室</th><th>変更前 → 変更後</th></tr>${results.map((r,i)=>`<tr class="search-result-row" data-index="${i}"><td>${r.label}</td><td>${r.kind==="base"?`${r.day}曜日`:`${fmtDate(r.date)}（${r.day}）`}</td><td>${esc(r.cls)}</td><td>${r.p}限</td><td>${esc(r.subject)}</td><td>${esc(r.teachers||"—")}</td><td>${esc(r.rooms||"—")}</td><td>${esc(resultChangeText(r))}</td></tr>`).join("")}</table></div>`:`<p class="muted">該当する科目はありません。</p>`);box.querySelectorAll(".search-result-row").forEach(row=>row.onclick=()=>jumpToResult(results[+row.dataset.index]));renderBase();renderDaily();
  }
  function activateTab(id){$$(".tabs button,.tab").forEach(x=>x.classList.remove("active"));document.querySelector(`.tabs button[data-tab="${id}"]`)?.classList.add("active");$("#"+id)?.classList.add("active")}
  function jumpToResult(r){if(r.kind==="base"){focusedCell={kind:"base",cls:r.jumpCls,date:"",day:r.day,p:r.p};ui.baseMode="class";activateTab("base");fillClassSelects();$("#baseClass").value=r.jumpCls;renderBase()}else{focusedCell={kind:"daily",cls:r.jumpCls,date:r.date,day:r.day,p:r.p};activateTab("daily");$("#dailyDate").value=r.date;ui.dailyMode="day";renderDaily()}setTimeout(()=>document.querySelector(".focused-search-cell")?.scrollIntoView({behavior:"smooth",block:"center",inline:"center"}),50)}
  function runSubjectSearch(){searchQuery=$("#subjectSearchInput").value.trim();focusedCell=null;renderSearchResults()}
  function clearSubjectSearch(){searchQuery="";focusedCell=null;if($("#subjectSearchInput"))$("#subjectSearchInput").value="";renderSearchResults()}

  renderAll=function(){originalRenderAll();if(searchQuery){renderBase();renderDaily()}const legend=document.querySelector("#daily .legend");if(legend&&!legend.querySelector(".legend-same-day"))legend.insertAdjacentHTML("afterbegin",`<span class="legend-same-day"><i class="dot same-day-dot"></i>同日移動</span><span><i class="dot cross-day-dot"></i>日またぎ</span>`)};

  injectSearchUi();injectTargetDate();
  const style=document.createElement("style");style.textContent=`.global-search{margin:12px auto 0;max-width:1600px}.global-search-row{display:flex;gap:9px;align-items:end;flex-wrap:wrap}.global-search-input-wrap{flex:1;min-width:240px}.global-search-input-wrap input{width:100%}.search-period-note{padding:9px 0}.search-results{margin-top:12px}.search-summary{margin-bottom:8px}.search-table-wrap{overflow:auto}.search-table{width:max-content;min-width:100%;border-collapse:collapse}.search-table th,.search-table td{padding:7px 9px;white-space:nowrap;font-size:12px}.search-result-row{cursor:pointer}.search-result-row:hover td{background:#f0f5ff}td.same-day-change{background:#fff0d8!important}td.cross-day-change{background:#e6f1ff!important}td.conflict-cell{background:#ffeaea!important}td.search-hit{box-shadow:inset 0 0 0 3px #7557d3}td.focused-search-cell{outline:4px solid #4c2bbd!important;outline-offset:-4px;animation:searchPulse .9s ease-in-out 2}@keyframes searchPulse{50%{filter:brightness(.88)}}.same-day-dot{background:#e8a13a}.cross-day-dot{background:#4d8fd9}`;document.head.appendChild(style);
  save();renderAll();
})();