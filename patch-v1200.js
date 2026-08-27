(() => {
  let v1200Candidates = [];
  let v1200SelectedId = "";

  function enabledConditionsForDate(date){
    return (state.structuredConditions||[]).filter(c=>c && c.enabled!==false && c.date===date && dayNameForDate(c.date));
  }
  function fixedAtV1200(classes,date,day,p){
    return (state.fixedSlots||[]).some(r=>r && r.date===date && r.day===day && +r.period===+p && (r.classes||[]).some(c=>classes.includes(c)));
  }
  function conditionBlocksV1200(lesson,date,p){
    return enabledConditionsForDate(date).some(c=>{
      if(!(c.periods||[]).map(Number).includes(+p)) return false;
      if(c.condition==="不在") return (lesson.teachers||[]).includes(c.target);
      if(c.condition==="使用不可") return (lesson.rooms||[]).includes(c.target);
      return false;
    });
  }
  function affectedLessonsForDate(date){
    const out=[],seen=new Set(),day=dayNameForDate(date);
    if(!day) return out;
    enabledConditionsForDate(date).forEach(c=>{
      (c.periods||[]).map(Number).forEach(p=>{
        state.classes.forEach(cls=>{
          if(!periodsForClass(cls).includes(p)) return;
          const l=getDaily(cls,date,day,p); if(!l) return;
          const hit=c.condition==="不在" ? (l.teachers||[]).includes(c.target) : c.condition==="使用不可" ? (l.rooms||[]).includes(c.target) : false;
          if(!hit) return;
          const key=`${date}|${p}|${l.groupId}`; if(seen.has(key)) return; seen.add(key);
          out.push({date,day,p,lesson:l,reason:`${c.target} ${c.condition}`,condition:c});
        });
      });
    });
    return out;
  }
  function activeLessonTeachers(l){ return activeTeachers(l); }
  function otherTeacherBusy(name,date,day,p,ignoreGroupIds=[]){
    const ignore=new Set(ignoreGroupIds.filter(Boolean));
    return uniqueLessonsForSlot(date,day,p).some(l=>{
      if(ignore.has(l.groupId)) return false;
      return activeLessonTeachers(l).includes(name);
    });
  }
  function roomBusy(room,date,day,p,ignoreGroupIds=[]){
    const ignore=new Set(ignoreGroupIds.filter(Boolean));
    return uniqueLessonsForSlot(date,day,p).some(l=>!ignore.has(l.groupId) && (l.rooms||[]).includes(room));
  }
  function lessonCanOccupy(item,targetP,ignoreGroupIds=[]){
    const {date,day,lesson}=item;
    const classes=(lesson.participants||[]).filter(c=>state.classes.includes(c));
    if(!classes.length || !classes.every(c=>periodsForClass(c).includes(targetP))) return {ok:false,reason:"対象クラスの校時外"};
    if(fixedAtV1200(classes,date,day,item.p) || fixedAtV1200(classes,date,day,targetP)) return {ok:false,reason:"時間固定"};
    if(conditionBlocksV1200(lesson,date,targetP)) return {ok:false,reason:"変更条件に抵触"};
    const teachers=activeLessonTeachers(lesson);
    if(teachers.some(t=>!teacherAvailable(t,day,targetP))) return {ok:false,reason:"担当教員が勤務時間外"};
    if(teachers.some(t=>otherTeacherBusy(t,date,day,targetP,[lesson.groupId,...ignoreGroupIds]))) return {ok:false,reason:"担当教員が別授業"};
    if((lesson.rooms||[]).some(r=>roomBusy(r,date,day,targetP,[lesson.groupId,...ignoreGroupIds]))) return {ok:false,reason:"教室が使用中"};
    return {ok:true,reason:""};
  }
  function emptyMoveCandidate(item,targetP){
    const l=item.lesson,classes=(l.participants||[]).filter(c=>state.classes.includes(c));
    if(targetP===item.p) return null;
    if(classes.some(c=>getDaily(c,item.date,item.day,targetP))) return null;
    const chk=lessonCanOccupy(item,targetP,[]); if(!chk.ok) return null;
    return {
      id:`move|${item.date}|${item.p}|${targetP}|${l.groupId}`,
      kind:"move",date:item.date,day:item.day,fromPeriod:+item.p,toPeriod:+targetP,
      groupId:l.groupId,subject:l.subject,participants:[...classes],teachers:[...(l.teachers||[])],rooms:[...(l.rooms||[])],reason:item.reason
    };
  }
  function swapCandidate(item,targetP){
    const a=item.lesson,aClasses=(a.participants||[]).filter(c=>state.classes.includes(c));
    if(targetP===item.p || aClasses.length!==1) return null;
    const cls=aClasses[0],b=getDaily(cls,item.date,item.day,targetP);
    if(!b || b.groupId===a.groupId) return null;
    const bClasses=(b.participants||[]).filter(c=>state.classes.includes(c));
    if(bClasses.length!==1 || bClasses[0]!==cls) return null;
    if(fixedAtV1200([cls],item.date,item.day,item.p) || fixedAtV1200([cls],item.date,item.day,targetP)) return null;
    const checkA=lessonCanOccupy(item,targetP,[b.groupId]); if(!checkA.ok) return null;
    const itemB={date:item.date,day:item.day,p:targetP,lesson:b};
    const checkB=lessonCanOccupy(itemB,item.p,[a.groupId]); if(!checkB.ok) return null;
    return {
      id:`swap|${item.date}|${item.p}|${targetP}|${a.groupId}|${b.groupId}`,
      kind:"swap",date:item.date,day:item.day,fromPeriod:+item.p,toPeriod:+targetP,
      groupId:a.groupId,swapGroupId:b.groupId,subject:a.subject,swapSubject:b.subject,
      participants:[cls],teachers:[...(a.teachers||[])],rooms:[...(a.rooms||[])],reason:item.reason
    };
  }
  function diagnose(item){
    const reasons=new Set();
    const all=allPeriodsForSchool().filter(p=>p!==item.p);
    const classes=(item.lesson.participants||[]).filter(c=>state.classes.includes(c));
    if(fixedAtV1200(classes,item.date,item.day,item.p)) reasons.add("移動元が時間固定されています");
    const c=item.condition;
    if(c?.condition==="不在"){
      const covered=new Set((c.periods||[]).map(Number));
      const usable=all.filter(p=>!covered.has(p));
      if(!usable.length) reasons.add(`${c.target}先生が終日不在のため、同じ日の移動だけでは解決できません`);
    }
    if(c?.condition==="使用不可"){
      const covered=new Set((c.periods||[]).map(Number));
      const usable=all.filter(p=>!covered.has(p));
      if(!usable.length) reasons.add(`${c.target}が終日使用不可のため、同じ日の移動だけでは解決できません`);
    }
    if(classes.length===1 && all.every(p=>!!getDaily(classes[0],item.date,item.day,p))) reasons.add("同じクラスに完全な空き校時がありません（入れ替え候補も確認します）");
    all.forEach(p=>{
      const chk=lessonCanOccupy(item,p,[]);
      if(!chk.ok) reasons.add(chk.reason);
    });
    return [...reasons].filter(Boolean);
  }
  function buildV1200(date){
    const affected=affectedLessonsForDate(date),out=[],diagnostics=[];
    affected.forEach(item=>{
      let found=0;
      allPeriodsForSchool().forEach(tp=>{
        const m=emptyMoveCandidate(item,tp); if(m){out.push(m);found++;}
        const s=swapCandidate(item,tp); if(s){out.push(s);found++;}
      });
      if(!found) diagnostics.push({item,reasons:diagnose(item)});
    });
    const seen=new Set();
    v1200Candidates=out.filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;});
    return {affected,candidates:v1200Candidates,diagnostics};
  }

  function conditionDates(){
    return [...new Set((state.structuredConditions||[]).filter(c=>c&&c.enabled!==false&&c.date&&dayNameForDate(c.date)).map(c=>c.date))].sort();
  }
  function defaultProposalDate(){
    const dates=conditionDates();
    if(dates.includes(currentDate())) return currentDate();
    return dates[0]||currentDate()||"";
  }
  function installV1200Ui(){
    const card=$("#moveProposalCard"); if(!card) return;
    if(card.dataset.v1200==="1") return;
    card.dataset.v1200="1";
    card.innerHTML=`
      <div class="heading-row"><div><h2>移動候補</h2><p class="muted">1日ずつ、登録した変更条件から同日内の移動・入れ替え候補を作成します。</p></div></div>
      <div class="proposal-date-row"><div><label>対象日</label><input id="proposalTargetDate" type="date"></div><div class="actions"><button id="createMoveProposalsBtn" type="button" class="primary">この日の移動候補を作成</button><button id="undoLastProposalBtn" type="button" class="sub">直前の候補反映を取り消す</button></div></div>
      <div id="moveProposalStatus"></div>
      <div class="move-proposal-layout"><div><h3>候補一覧</h3><div id="moveProposalList"></div></div><div id="moveProposalPreview"><p class="muted">候補を選択すると、その日の全体時間割と教員別時間割を確認できます。</p></div></div>`;
    $("#proposalTargetDate").value=defaultProposalDate();
    $("#createMoveProposalsBtn").onclick=createV1200Proposals;
    $("#undoLastProposalBtn").onclick=undoV1200;
    refreshUndoV1200();
  }
  function refreshUndoV1200(){
    const b=$("#undoLastProposalBtn"); if(b) b.disabled=!(state.proposalUndoStack||[]).length;
  }
  function createV1200Proposals(){
    const date=$("#proposalTargetDate")?.value||"";
    const st=$("#moveProposalStatus");
    if(!date || !dayNameForDate(date)){ if(st) st.innerHTML=`<div class="status warn">月〜金の日付を選択してください。</div>`; return; }
    const conds=enabledConditionsForDate(date);
    if(!conds.length){ if(st) st.innerHTML=`<div class="status warn">${esc(date)} に有効な変更条件が登録されていません。</div>`; v1200Candidates=[];renderV1200List();return; }
    const result=buildV1200(date); v1200SelectedId="";
    if(result.candidates.length){
      st.innerHTML=`<div class="status ok">${esc(date)} の安全な候補を ${result.candidates.length}件 作成しました（移動・入れ替え）。</div>`;
    }else if(!result.affected.length){
      st.innerHTML=`<div class="status warn">条件に該当する授業が見つかりませんでした。日付・教員・校時を確認してください。</div>`;
    }else{
      const details=result.diagnostics.map(d=>`<div class="condition-item"><strong>${esc((d.item.lesson.participants||[]).join("・"))} ${d.item.p}限 ${esc(d.item.lesson.subject)}</strong><div class="small">${(d.reasons.length?d.reasons:["安全な移動先を作れませんでした"]).map(esc).join(" / ")}</div></div>`).join("");
      st.innerHTML=`<div class="status warn">候補は0件でした。理由を確認してください。</div>${details}`;
    }
    renderV1200List();
    $("#moveProposalPreview").innerHTML=`<p class="muted">候補を選択すると確認画面を表示します。</p>`;
  }
  function renderV1200List(){
    const box=$("#moveProposalList"); if(!box)return;
    box.innerHTML=v1200Candidates.length?v1200Candidates.map(c=>`<button type="button" class="move-proposal-item ${c.id===v1200SelectedId?"selected":""}" data-v1200-id="${esc(c.id)}"><strong>${c.kind==="swap"?"入れ替え":"移動"}：${c.fromPeriod}限 → ${c.toPeriod}限</strong><span>${esc((c.participants||[]).join("・"))}　${esc(c.subject)}${c.kind==="swap"?` ⇄ ${esc(c.swapSubject)}`:""}</span><small>${esc(c.reason)}</small></button>`).join(""):`<p class="muted">「この日の移動候補を作成」を押してください。</p>`;
    box.querySelectorAll("[data-v1200-id]").forEach(b=>b.onclick=()=>{v1200SelectedId=b.dataset.v1200Id;renderV1200List();renderV1200Preview();});
  }
  function candidateV1200(){ return v1200Candidates.find(c=>c.id===v1200SelectedId)||null; }
  function schoolPreviewV1200(c){
    let h=`<table class="proposal-school-table"><tr><th>校時</th>${state.classes.map(cls=>`<th>${esc(cls)}</th>`).join("")}</tr>`;
    allPeriodsForSchool().forEach(p=>{h+=`<tr><th>${p}限</th>`;state.classes.forEach(cls=>{if(!periodsForClass(cls).includes(p)){h+=`<td>—</td>`;return;}const l=getDaily(cls,c.date,c.day,p),markFrom=(c.participants||[]).includes(cls)&&p===c.fromPeriod,markTo=(c.participants||[]).includes(cls)&&p===c.toPeriod;h+=`<td class="${markFrom?"proposal-from":""} ${markTo?"proposal-to":""}">${l?`<strong>${esc(l.subject)}</strong><div class="small">${esc(teachersText(l))}</div>`:'<span class="muted">空き</span>'}</td>`;});h+="</tr>";});return h+="</table>";
  }
  function teacherPreviewV1200(name,c){
    let h=`<table class="proposal-teacher-table"><tr><th>校時</th><th>${esc(name)}先生</th></tr>`;allPeriodsForSchool().forEach(p=>{const entries=teacherEntriesForPeriod(name,c.date,c.day,p),mark=p===c.fromPeriod?"proposal-from":p===c.toPeriod?"proposal-to":"";h+=`<tr><th>${p}限</th><td class="${mark}">${entries.length?entries.map(e=>`${esc(e.classes)} ${esc(e.subject)}${e.status?`（${esc(e.status)}）`:""}`).join("<br>"):'<span class="muted">空き</span>'}</td></tr>`;});return h+="</table>";
  }
  function relatedTeachersV1200(c){
    const set=new Set(c.teachers||[]);if(c.kind==="swap"){const cls=c.participants?.[0],b=cls?getDaily(cls,c.date,c.day,c.toPeriod):null;(b?.teachers||[]).forEach(t=>set.add(t));if(b?.substitute)set.add(b.substitute);}return [...set];
  }
  function renderV1200Preview(){
    const c=candidateV1200(),box=$("#moveProposalPreview"); if(!c||!box)return;const all=sortedTeachers(),related=relatedTeachersV1200(c),first=related[0]||all[0]||"";
    box.innerHTML=`<div class="proposal-summary"><strong>${esc(c.date)}　${c.kind==="swap"?"入れ替え":"移動"}：${c.fromPeriod}限 → ${c.toPeriod}限</strong><div>${esc((c.participants||[]).join("・"))}　${esc(c.subject)}${c.kind==="swap"?` ⇄ ${esc(c.swapSubject)}`:""}</div></div><div class="proposal-preview-section"><h3>その日の全体時間割</h3><div class="table-wrap">${schoolPreviewV1200(c)}</div></div><div class="proposal-preview-section"><div class="proposal-teacher-head"><h3>教員の個別時間割</h3><select id="proposalTeacherSelect">${all.map(t=>`<option value="${esc(t)}" ${t===first?"selected":""}>${esc(t)}${related.includes(t)?"（関係教員）":""}</option>`).join("")}</select></div><div id="proposalTeacherPreview">${first?teacherPreviewV1200(first,c):""}</div></div><div class="actions"><button id="applyV1200Btn" type="button" class="primary">この候補を反映</button></div>`;
    $("#proposalTeacherSelect")?.addEventListener("change",e=>{$("#proposalTeacherPreview").innerHTML=teacherPreviewV1200(e.target.value,c)});$("#applyV1200Btn").onclick=applyV1200;
  }
  function snapshotV1200(c){
    state.proposalUndoStack=Array.isArray(state.proposalUndoStack)?state.proposalUndoStack:[];state.proposalUndoStack.push({id:uniqueId(),ts:new Date().toISOString(),description:`${c.date} ${c.kind==="swap"?"入れ替え":"移動"} ${c.fromPeriod}限→${c.toPeriod}限 ${c.subject}`,daily:clone(state.daily),moveRecords:clone(state.moveRecords||[]),classSettings:clone(state.classSettings)});state.proposalUndoStack=state.proposalUndoStack.slice(-5);
  }
  function applyV1200(){
    const c=candidateV1200();if(!c)return;const cls=c.participants?.[0],a=cls?getDaily(cls,c.date,c.day,c.fromPeriod):null;if(!a||a.groupId!==c.groupId){alert("時間割が変わっています。候補を作り直してください。");return;}
    snapshotV1200(c);
    if(c.kind==="move"){
      const fresh=emptyMoveCandidate({date:c.date,day:c.day,p:c.fromPeriod,lesson:a,reason:c.reason},c.toPeriod);if(!fresh){state.proposalUndoStack.pop();alert("現在は安全に移動できません。候補を作り直してください。");return;}removeDailyGroup(c.date,c.day,c.fromPeriod,a);writeDailyGroup(c.date,c.day,c.toPeriod,clone(a));
    }else{
      const b=getDaily(cls,c.date,c.day,c.toPeriod);const fresh=swapCandidate({date:c.date,day:c.day,p:c.fromPeriod,lesson:a,reason:c.reason},c.toPeriod);if(!b||!fresh||b.groupId!==c.swapGroupId){state.proposalUndoStack.pop();alert("現在は安全に入れ替えできません。候補を作り直してください。");return;}removeDailyGroup(c.date,c.day,c.fromPeriod,a);removeDailyGroup(c.date,c.day,c.toPeriod,b);writeDailyGroup(c.date,c.day,c.toPeriod,clone(a));writeDailyGroup(c.date,c.day,c.fromPeriod,clone(b));
    }
    state.moveRecords=Array.isArray(state.moveRecords)?state.moveRecords:[];state.moveRecords.push({id:uniqueId(),groupId:a.groupId,fromDate:c.date,fromDay:c.day,fromPeriod:c.fromPeriod,toDate:c.date,toDay:c.day,toPeriod:c.toPeriod,participants:[...(a.participants||[])],subject:a.subject,ts:new Date().toISOString(),source:c.kind==="swap"?"入れ替え候補":"移動候補"});state.moveRecords=state.moveRecords.slice(-600);addHistory(c.kind==="swap"?"入れ替え候補反映":"移動候補反映",`${c.date} ${participantsText(a)} ${c.fromPeriod}限 → ${c.toPeriod}限 ${a.subject}`);save();renderAll();installV1200Ui();$("#proposalTargetDate").value=c.date;v1200Candidates=[];v1200SelectedId="";renderV1200List();$("#moveProposalStatus").innerHTML=`<div class="status ok">候補を反映しました。違う場合は「直前の候補反映を取り消す」で戻せます。</div>`;refreshUndoV1200();
  }
  function undoV1200(){
    const stack=state.proposalUndoStack||[];if(!stack.length)return;const snap=stack[stack.length-1];if(!confirm(`「${snap.description}」の反映前に戻しますか？`))return;state.daily=clone(snap.daily||{});state.moveRecords=clone(snap.moveRecords||[]);state.classSettings=clone(snap.classSettings||{});state.proposalUndoStack=stack.slice(0,-1);addHistory("移動候補取消",snap.description);save();renderAll();installV1200Ui();v1200Candidates=[];v1200SelectedId="";renderV1200List();$("#moveProposalStatus").innerHTML=`<div class="status ok">直前の候補反映を取り消しました。</div>`;refreshUndoV1200();
  }

  const style=document.createElement("style");style.textContent=`.proposal-date-row{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin:10px 0}.proposal-date-row>div:first-child{display:flex;flex-direction:column;gap:5px}.proposal-date-row label{font-weight:700}@media(max-width:650px){.proposal-date-row>*{width:100%}.proposal-date-row input,.proposal-date-row button{width:100%}}`;document.head.appendChild(style);
  const previousRenderAllV1200=renderAll;renderAll=function(){previousRenderAllV1200();installV1200Ui();refreshUndoV1200();};
  installV1200Ui();refreshUndoV1200();
})();