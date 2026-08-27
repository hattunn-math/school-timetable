(() => {
  state.proposalUndoStack = Array.isArray(state.proposalUndoStack) ? state.proposalUndoStack : [];
  let proposalCandidates = [];
  let selectedProposalId = "";

  function proposalId(parts){ return parts.join("|"); }
  function fixedAt(classes,date,day,p){
    return (state.fixedSlots||[]).some(r=>r && r.date===date && r.day===day && +r.period===+p && (r.classes||[]).some(c=>classes.includes(c)));
  }
  function enabledConditions(){ return (state.structuredConditions||[]).filter(c=>c && c.enabled!==false && c.date && dayNameForDate(c.date)); }
  function conditionBlocksLessonAt(lesson,date,p){
    return enabledConditions().some(c=>{
      if(c.date!==date || !(c.periods||[]).map(Number).includes(+p)) return false;
      if(c.condition==="不在") return (lesson.teachers||[]).includes(c.target);
      if(c.condition==="使用不可") return (lesson.rooms||[]).includes(c.target);
      return false;
    });
  }
  function impactedLessons(){
    const out=[],seen=new Set();
    enabledConditions().forEach(c=>{
      const day=dayNameForDate(c.date);
      (c.periods||[]).map(Number).forEach(p=>{
        state.classes.forEach(cls=>{
          if(!periodsForClass(cls).includes(p)) return;
          const l=getDaily(cls,c.date,day,p); if(!l) return;
          const hit=c.condition==="不在" ? (l.teachers||[]).includes(c.target) : c.condition==="使用不可" ? (l.rooms||[]).includes(c.target) : false;
          if(!hit) return;
          const key=`${c.date}|${day}|${p}|${l.groupId}`; if(seen.has(key)) return; seen.add(key);
          out.push({date:c.date,day,p,lesson:l,reason:`${c.target} ${c.condition}`});
        });
      });
    });
    return out;
  }
  function destinationSafe(item,targetP){
    const {date,day,p:sourceP,lesson}=item;
    const classes=(lesson.participants?.length?lesson.participants:[]).filter(c=>state.classes.includes(c));
    if(!classes.length || targetP===sourceP) return false;
    if(!classes.every(c=>periodsForClass(c).includes(targetP))) return false;
    if(fixedAt(classes,date,day,sourceP) || fixedAt(classes,date,day,targetP)) return false;
    if(classes.some(c=>getDaily(c,date,day,targetP))) return false;
    if(conditionBlocksLessonAt(lesson,date,targetP)) return false;
    const teachers=activeTeachers(lesson);
    if(teachers.some(t=>!teacherAvailable(t,day,targetP))) return false;
    if(teachers.some(t=>teacherEntriesForPeriod(t,date,day,targetP).length>0)) return false;
    const occupied=uniqueLessonsForSlot(date,day,targetP);
    if((lesson.rooms||[]).some(r=>occupied.some(x=>(x.rooms||[]).includes(r)))) return false;
    return true;
  }
  function buildProposalCandidates(){
    const out=[];
    impactedLessons().forEach(item=>{
      const ps=allPeriodsForSchool().filter(p=>destinationSafe(item,p));
      ps.forEach(tp=>{
        const l=item.lesson,classes=(l.participants||[]);
        out.push({
          id:proposalId([item.date,item.day,item.p,tp,l.groupId]),
          date:item.date,day:item.day,fromPeriod:+item.p,toPeriod:+tp,groupId:l.groupId,
          subject:l.subject,participants:[...classes],teachers:[...(l.teachers||[])],rooms:[...(l.rooms||[])],reason:item.reason
        });
      });
    });
    proposalCandidates=out;
    return out;
  }

  function ensureProposalUi(){
    const section=$("#conditions"); if(!section || $("#moveProposalCard")) return;
    const card=document.createElement("div");
    card.id="moveProposalCard"; card.className="card move-proposal-card";
    card.innerHTML=`
      <div class="heading-row"><div><h2>移動候補</h2><p class="muted">登録した変更条件から、安全に移動できる候補を作成します。候補を選ぶと全体時間割と教員別時間割を確認できます。</p></div></div>
      <div class="actions"><button id="createMoveProposalsBtn" type="button" class="primary">移動候補を作成</button><button id="undoLastProposalBtn" type="button" class="sub">直前の候補反映を取り消す</button></div>
      <div id="moveProposalStatus"></div>
      <div class="move-proposal-layout">
        <div><h3>候補一覧</h3><div id="moveProposalList"></div></div>
        <div id="moveProposalPreview"><p class="muted">候補を選択すると確認画面を表示します。</p></div>
      </div>`;
    section.appendChild(card);
    $("#createMoveProposalsBtn").onclick=createMoveProposals;
    $("#undoLastProposalBtn").onclick=undoLastProposal;
    refreshUndoButton();
  }
  function refreshUndoButton(){
    const b=$("#undoLastProposalBtn"); if(!b) return;
    b.disabled=!(state.proposalUndoStack||[]).length;
    b.title=b.disabled?"取り消せる候補反映はありません":"直前に反映した移動候補を元に戻します";
  }
  function createMoveProposals(){
    const list=buildProposalCandidates(); selectedProposalId="";
    const st=$("#moveProposalStatus");
    if(st) st.innerHTML=list.length?`<div class="status ok">安全な移動候補を ${list.length}件 作成しました。</div>`:`<div class="status warn">現在の条件では安全に移動できる候補が見つかりませんでした。</div>`;
    renderProposalList();
    $("#moveProposalPreview").innerHTML=`<p class="muted">候補を選択すると確認画面を表示します。</p>`;
  }
  function renderProposalList(){
    const box=$("#moveProposalList"); if(!box) return;
    box.innerHTML=proposalCandidates.length?proposalCandidates.map(c=>`
      <button type="button" class="move-proposal-item ${c.id===selectedProposalId?"selected":""}" data-proposal-id="${esc(c.id)}">
        <strong>${esc(c.date)} ${c.fromPeriod}限 → ${c.toPeriod}限</strong>
        <span>${esc((c.participants||[]).join("・"))}　${esc(c.subject)}</span>
        <small>${esc(c.reason)}</small>
      </button>`).join(""):`<p class="muted">「移動候補を作成」を押してください。</p>`;
    box.querySelectorAll(".move-proposal-item").forEach(b=>b.onclick=()=>selectProposal(b.dataset.proposalId));
  }
  function selectProposal(id){
    selectedProposalId=id; renderProposalList(); renderProposalPreview();
  }
  function candidateById(id){ return proposalCandidates.find(c=>c.id===id)||null; }
  function relationTeachers(c){
    const set=new Set(c?.teachers||[]);
    const l=c?getDaily((c.participants||[])[0],c.date,c.day,c.fromPeriod):null;
    if(l?.substitute) set.add(l.substitute);
    return [...set];
  }
  function renderSchoolPreview(c){
    let h=`<table class="proposal-school-table"><tr><th>校時</th>${state.classes.map(cls=>`<th>${esc(cls)}</th>`).join("")}</tr>`;
    allPeriodsForSchool().forEach(p=>{
      h+=`<tr><th>${p}限</th>`;
      state.classes.forEach(cls=>{
        if(!periodsForClass(cls).includes(p)){h+=`<td>—</td>`;return;}
        const l=getDaily(cls,c.date,c.day,p);
        const from=(c.participants||[]).includes(cls)&&p===c.fromPeriod;
        const to=(c.participants||[]).includes(cls)&&p===c.toPeriod;
        h+=`<td class="${from?"proposal-from":""} ${to?"proposal-to":""}">${l?`<strong>${esc(l.subject)}</strong><div class="small">${esc(teachersText(l))}</div>`:(to?'<strong>← 移動先</strong>':'<span class="muted">空き</span>')}</td>`;
      });
      h+="</tr>";
    });
    return h+="</table>";
  }
  function teacherPreviewHtml(name,c){
    let h=`<table class="proposal-teacher-table"><tr><th>校時</th><th>${esc(name)}先生</th></tr>`;
    allPeriodsForSchool().forEach(p=>{
      const entries=teacherEntriesForPeriod(name,c.date,c.day,p);
      const mark=p===c.fromPeriod?"proposal-from":p===c.toPeriod?"proposal-to":"";
      h+=`<tr><th>${p}限</th><td class="${mark}">${entries.length?entries.map(e=>`${esc(e.classes)} ${esc(e.subject)}${e.status?`（${esc(e.status)}）`:""}`).join("<br>"):'<span class="muted">空き</span>'}</td></tr>`;
    });
    return h+="</table>";
  }
  function renderProposalPreview(){
    const c=candidateById(selectedProposalId),box=$("#moveProposalPreview"); if(!box||!c) return;
    const related=relationTeachers(c),all=sortedTeachers();
    const first=related[0]||all[0]||"";
    box.innerHTML=`
      <div class="proposal-summary"><strong>${esc(c.date)} ${c.fromPeriod}限 → ${c.toPeriod}限</strong><div>${esc((c.participants||[]).join("・"))}　${esc(c.subject)}</div><div class="small muted">理由：${esc(c.reason)}</div></div>
      <div class="proposal-preview-section"><h3>その日の全体時間割</h3><div class="table-wrap">${renderSchoolPreview(c)}</div></div>
      <div class="proposal-preview-section"><div class="proposal-teacher-head"><h3>教員の個別時間割</h3><select id="proposalTeacherSelect">${all.map(t=>`<option value="${esc(t)}" ${t===first?"selected":""}>${esc(t)}${related.includes(t)?"（関係教員）":""}</option>`).join("")}</select></div><div id="proposalTeacherPreview">${first?teacherPreviewHtml(first,c):'<p class="muted">教員が登録されていません。</p>'}</div></div>
      <div class="actions"><button id="applySelectedProposalBtn" type="button" class="primary">この候補を反映</button></div>`;
    $("#proposalTeacherSelect")?.addEventListener("change",e=>{$("#proposalTeacherPreview").innerHTML=teacherPreviewHtml(e.target.value,c)});
    $("#applySelectedProposalBtn").onclick=applySelectedProposal;
  }
  function stillSafe(c){
    const cls=(c.participants||[])[0]; if(!cls) return false;
    const l=getDaily(cls,c.date,c.day,c.fromPeriod); if(!l || l.groupId!==c.groupId) return false;
    return destinationSafe({date:c.date,day:c.day,p:c.fromPeriod,lesson:l},c.toPeriod);
  }
  function applySelectedProposal(){
    const c=candidateById(selectedProposalId); if(!c) return;
    if(!stillSafe(c)){ alert("時間割が変わったため、この候補は現在は安全ではありません。候補を作り直してください。"); return; }
    const cls=(c.participants||[])[0],l=getDaily(cls,c.date,c.day,c.fromPeriod); if(!l) return;
    state.proposalUndoStack.push({
      id:uniqueId(),ts:new Date().toISOString(),description:`${c.date} ${c.fromPeriod}限→${c.toPeriod}限 ${c.subject}`,
      daily:clone(state.daily),moveRecords:clone(state.moveRecords||[]),classSettings:clone(state.classSettings)
    });
    state.proposalUndoStack=state.proposalUndoStack.slice(-5);
    removeDailyGroup(c.date,c.day,c.fromPeriod,l);
    writeDailyGroup(c.date,c.day,c.toPeriod,clone(l));
    state.moveRecords=Array.isArray(state.moveRecords)?state.moveRecords:[];
    state.moveRecords.push({id:uniqueId(),groupId:l.groupId,fromDate:c.date,fromDay:c.day,fromPeriod:c.fromPeriod,toDate:c.date,toDay:c.day,toPeriod:c.toPeriod,participants:[...(l.participants||[])],subject:l.subject,ts:new Date().toISOString(),source:"移動候補"});
    state.moveRecords=state.moveRecords.slice(-600);
    addHistory("移動候補反映",`${c.date} ${participantsText(l)} ${c.fromPeriod}限 → ${c.toPeriod}限 ${l.subject}`);
    save(); renderAll();
    selectedProposalId=""; buildProposalCandidates(); renderProposalList();
    const st=$("#moveProposalStatus"); if(st) st.innerHTML=`<div class="status ok">候補を反映しました。必要なら「直前の候補反映を取り消す」で元に戻せます。</div>`;
    const pv=$("#moveProposalPreview"); if(pv) pv.innerHTML=`<p class="muted">候補を選択すると確認画面を表示します。</p>`;
    refreshUndoButton();
  }
  function undoLastProposal(){
    const stack=state.proposalUndoStack||[]; if(!stack.length) return;
    const snap=stack[stack.length-1];
    if(!confirm(`「${snap.description}」の反映前に戻しますか？`)) return;
    state.daily=clone(snap.daily||{});
    state.moveRecords=clone(snap.moveRecords||[]);
    state.classSettings=clone(snap.classSettings||{});
    state.proposalUndoStack=stack.slice(0,-1);
    addHistory("移動候補取消",snap.description);
    save(); renderAll();
    proposalCandidates=[]; selectedProposalId=""; renderProposalList();
    const st=$("#moveProposalStatus"); if(st) st.innerHTML=`<div class="status ok">直前の候補反映を取り消しました。</div>`;
    const pv=$("#moveProposalPreview"); if(pv) pv.innerHTML=`<p class="muted">「移動候補を作成」を押して候補を再作成してください。</p>`;
    refreshUndoButton();
  }

  const style=document.createElement("style");
  style.textContent=`
    .move-proposal-card{border-left:4px solid #2f6f9f}.move-proposal-layout{display:grid;grid-template-columns:minmax(260px,.7fr) minmax(0,1.6fr);gap:16px;margin-top:14px}
    #moveProposalList{display:flex;flex-direction:column;gap:8px;max-height:620px;overflow:auto}.move-proposal-item{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;border:1px solid var(--border);border-radius:8px;background:#fff;padding:10px;cursor:pointer}.move-proposal-item.selected{box-shadow:inset 0 0 0 2px #2f6f9f;background:#f4f9fd}.move-proposal-item small{color:var(--muted)}
    .proposal-summary{padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:#f7fafc}.proposal-preview-section{margin-top:14px}.proposal-teacher-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.proposal-teacher-head select{min-width:180px}
    .proposal-school-table,.proposal-teacher-table{border-collapse:collapse;width:max-content;min-width:100%}.proposal-school-table th,.proposal-school-table td,.proposal-teacher-table th,.proposal-teacher-table td{border:1px solid var(--border);padding:6px;vertical-align:top;min-width:90px}.proposal-school-table th:first-child,.proposal-teacher-table th{min-width:55px}.proposal-from{box-shadow:inset 0 0 0 2px #d9861c;background:#fff8ea!important}.proposal-to{box-shadow:inset 0 0 0 2px #2f6f9f;background:#eef7ff!important}
    @media(max-width:900px){.move-proposal-layout{grid-template-columns:1fr}.proposal-teacher-head{align-items:stretch;flex-direction:column}.proposal-teacher-head select{width:100%}}
  `;
  document.head.appendChild(style);

  const previousRenderAll=renderAll;
  renderAll=function(){ previousRenderAll(); ensureProposalUi(); refreshUndoButton(); };
  ensureProposalUi(); refreshUndoButton(); save();
})();
