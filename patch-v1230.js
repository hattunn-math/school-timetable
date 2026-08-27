(() => {
  let conditionalMoveSuggestions=[];

  function activeConditionsOn(date){
    return (state.structuredConditions||[]).filter(c=>c&&c.enabled!==false&&c.date===date);
  }
  function fixedAt123(classes,date,day,p){
    return (state.fixedSlots||[]).some(r=>r&&r.date===date&&r.day===day&&+r.period===+p&&(r.classes||[]).some(c=>classes.includes(c)));
  }
  function hardConditionBlocks123(lesson,date,p){
    return activeConditionsOn(date).some(c=>{
      if(!(c.periods||[]).map(Number).includes(+p)) return false;
      if(c.condition==="不在") return (lesson.teachers||[]).includes(c.target);
      if(c.condition==="使用不可") return (lesson.rooms||[]).includes(c.target);
      return false;
    });
  }
  function affected123(date){
    const out=[],seen=new Set(),day=dayNameForDate(date);
    if(!day)return out;
    activeConditionsOn(date).filter(c=>c.condition==="不在"||c.condition==="使用不可").forEach(c=>{
      (c.periods||[]).map(Number).forEach(p=>state.classes.forEach(cls=>{
        if(!periodsForClass(cls).includes(p))return;
        const l=getDaily(cls,date,day,p);if(!l)return;
        const hit=c.condition==="不在"?(l.teachers||[]).includes(c.target):(l.rooms||[]).includes(c.target);
        if(!hit)return;
        const k=`${date}|${p}|${l.groupId}`;if(seen.has(k))return;seen.add(k);
        out.push({date,day,p,lesson:l,reason:`${c.target} ${c.condition}`});
      }));
    });
    return out;
  }
  function lessonTeachers123(l){return activeTeachers(l);}
  function teacherBusy123(name,date,day,p,ignore=[]){
    const ig=new Set(ignore.filter(Boolean));
    return uniqueLessonsForSlot(date,day,p).some(l=>!ig.has(l.groupId)&&lessonTeachers123(l).includes(name));
  }
  function roomBusy123(room,date,day,p,ignore=[]){
    const ig=new Set(ignore.filter(Boolean));
    return uniqueLessonsForSlot(date,day,p).some(l=>!ig.has(l.groupId)&&(l.rooms||[]).includes(room));
  }
  function unavailableTeachers123(l,date,day,p){
    return lessonTeachers123(l).filter(t=>{
      if(typeof window.teacherAvailableOnDate==="function")return !window.teacherAvailableOnDate(t,date,day,p);
      return !teacherAvailable(t,day,p);
    });
  }
  function canExceptAvailability123(item,targetP,ignore=[]){
    const {date,day,lesson}=item,classes=(lesson.participants||[]).filter(c=>state.classes.includes(c));
    if(!classes.length||!classes.every(c=>periodsForClass(c).includes(targetP)))return null;
    if(fixedAt123(classes,date,day,item.p)||fixedAt123(classes,date,day,targetP))return null;
    if(hardConditionBlocks123(lesson,date,targetP))return null;
    const teachers=lessonTeachers123(lesson);
    if(teachers.some(t=>teacherBusy123(t,date,day,targetP,[lesson.groupId,...ignore])))return null;
    if((lesson.rooms||[]).some(r=>roomBusy123(r,date,day,targetP,[lesson.groupId,...ignore])))return null;
    const unavailable=unavailableTeachers123(lesson,date,day,targetP);
    if(!unavailable.length)return null;
    return unavailable;
  }
  function makeMoveConditional123(item,targetP){
    if(targetP===item.p)return null;
    const l=item.lesson,classes=(l.participants||[]).filter(c=>state.classes.includes(c));
    if(classes.some(c=>getDaily(c,item.date,item.day,targetP)))return null;
    const need=canExceptAvailability123(item,targetP,[]);if(!need)return null;
    return {id:`cm|${item.date}|${item.p}|${targetP}|${l.groupId}`,kind:"move",date:item.date,day:item.day,fromPeriod:+item.p,toPeriod:+targetP,subject:l.subject,participants:[...classes],needed:[...need],reason:item.reason};
  }
  function makeSwapConditional123(item,targetP){
    if(targetP===item.p)return null;
    const a=item.lesson,aClasses=(a.participants||[]).filter(c=>state.classes.includes(c));
    if(aClasses.length!==1)return null;
    const cls=aClasses[0],b=getDaily(cls,item.date,item.day,targetP);if(!b||b.groupId===a.groupId)return null;
    const bClasses=(b.participants||[]).filter(c=>state.classes.includes(c));if(bClasses.length!==1||bClasses[0]!==cls)return null;
    if(fixedAt123([cls],item.date,item.day,item.p)||fixedAt123([cls],item.date,item.day,targetP))return null;
    const needA=canExceptAvailability123(item,targetP,[b.groupId]);
    const itemB={date:item.date,day:item.day,p:targetP,lesson:b};
    const needB=canExceptAvailability123(itemB,item.p,[a.groupId]);
    if(!needA&&!needB)return null;
    // If either side has a non-availability blocker, canExceptAvailability returns null indistinguishably.
    // Re-check each side that is already available to ensure it is otherwise valid.
    function validSide(side,tp,ignore){
      const unavailable=unavailableTeachers123(side.lesson,side.date,side.day,tp);
      if(unavailable.length)return !!canExceptAvailability123(side,tp,ignore);
      const {date,day,lesson}=side,classes=(lesson.participants||[]).filter(c=>state.classes.includes(c));
      if(!classes.length||!classes.every(c=>periodsForClass(c).includes(tp)))return false;
      if(fixedAt123(classes,date,day,side.p)||fixedAt123(classes,date,day,tp))return false;
      if(hardConditionBlocks123(lesson,date,tp))return false;
      const teachers=lessonTeachers123(lesson);
      if(teachers.some(t=>teacherBusy123(t,date,day,tp,[lesson.groupId,...ignore])))return false;
      if((lesson.rooms||[]).some(r=>roomBusy123(r,date,day,tp,[lesson.groupId,...ignore])))return false;
      return true;
    }
    if(!validSide(item,targetP,[b.groupId])||!validSide(itemB,item.p,[a.groupId]))return null;
    const needed=[...new Set([...(needA||[]),...(needB||[])])];if(!needed.length)return null;
    return {id:`cs|${item.date}|${item.p}|${targetP}|${a.groupId}|${b.groupId}`,kind:"swap",date:item.date,day:item.day,fromPeriod:+item.p,toPeriod:+targetP,subject:a.subject,swapSubject:b.subject,participants:[cls],needed,neededDetails:[...(needA||[]).map(t=>({teacher:t,period:+targetP})),...(needB||[]).map(t=>({teacher:t,period:+item.p}))],reason:item.reason};
  }
  function buildConditional123(date){
    const out=[];
    affected123(date).forEach(item=>allPeriodsForSchool().forEach(tp=>{
      const m=makeMoveConditional123(item,tp);if(m){m.neededDetails=m.needed.map(t=>({teacher:t,period:+tp}));out.push(m);}
      const s=makeSwapConditional123(item,tp);if(s)out.push(s);
    }));
    const seen=new Set();
    conditionalMoveSuggestions=out.filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true;});
    return conditionalMoveSuggestions;
  }
  function ensureConditionalBox123(){
    const status=$("#moveProposalStatus");if(!status)return null;
    let box=$("#conditionalMoveSuggestions");
    if(!box){box=document.createElement("div");box.id="conditionalMoveSuggestions";box.className="conditional-move-suggestions";status.insertAdjacentElement("afterend",box);}
    return box;
  }
  function detailText123(s){
    return (s.neededDetails||[]).map(x=>`${x.teacher}先生が${x.period}限勤務可`).join("・");
  }
  function renderConditional123(date){
    const box=ensureConditionalBox123();if(!box)return;
    const list=buildConditional123(date);
    if(!list.length){box.innerHTML=`<div class="conditional-title"><strong>条件付き候補</strong></div><p class="muted small">勤務可否だけを変更すれば成立する候補はありません。</p>`;return;}
    box.innerHTML=`<div class="conditional-title"><strong>条件付き候補</strong><span class="small muted">勤務可否だけを変更すれば成立する案</span></div>`+list.map(s=>`<div class="conditional-item"><div><strong>${s.kind==="swap"?"入れ替え":"移動"}：${s.fromPeriod}限 → ${s.toPeriod}限</strong><div>${esc((s.participants||[]).join("・"))}　${esc(s.subject)}${s.kind==="swap"?` ⇄ ${esc(s.swapSubject)}`:""}</div><div class="small conditional-requirement">${esc(detailText123(s))}なら実行できます。</div></div><button type="button" class="sub add-work-condition-from-suggestion" data-id="${esc(s.id)}">勤務可条件を追加</button></div>`).join("");
    box.querySelectorAll(".add-work-condition-from-suggestion").forEach(b=>b.onclick=()=>applySuggestionConditions123(b.dataset.id));
  }
  function applySuggestionConditions123(id){
    const s=conditionalMoveSuggestions.find(x=>x.id===id);if(!s)return;
    const details=s.neededDetails||[];
    if(!details.length)return;
    const text=details.map(x=>`${x.teacher}先生：${s.date} ${x.period}限を勤務可`).join("\n");
    if(!confirm(`${text}\n\nこの勤務可条件を追加しますか？`))return;
    details.forEach(x=>{
      const exists=(state.structuredConditions||[]).some(c=>c&&c.enabled!==false&&c.targetType==="teacher"&&c.target===x.teacher&&c.date===s.date&&c.condition==="勤務可"&&(c.periods||[]).map(Number).includes(+x.period));
      if(exists)return;
      state.structuredConditions.push({id:`cond-${uniqueId()}`,enabled:true,targetType:"teacher",target:x.teacher,condition:"勤務可",date:s.date,day:s.day,periods:[+x.period]});
      addHistory("勤務可条件追加",`${s.date} ${x.teacher} ${x.period}限（条件付き候補から追加）`);
    });
    save();renderAll();
    const dateInput=$("#proposalTargetDate");if(dateInput)dateInput.value=s.date;
    setTimeout(()=>{
      const btn=$("#createMoveProposalsBtn");if(btn)btn.click();
    },0);
  }
  function hookProposal123(){
    const btn=$("#createMoveProposalsBtn");if(!btn||btn.dataset.conditional123==="1")return;
    const old=btn.onclick;if(typeof old!=="function")return;
    btn.dataset.conditional123="1";
    btn.onclick=function(e){
      const result=old.call(this,e);
      const date=$("#proposalTargetDate")?.value||currentDate();
      if(date&&dayNameForDate(date))renderConditional123(date);
      return result;
    };
  }
  function updateHelp123(){
    const p=$("#moveProposalCard")?.querySelector("p.muted");
    if(p)p.textContent="1日ずつ、同日内の移動・入れ替えを検討します。通常は動かせない場合でも、勤務可否だけの変更で成立する案は「条件付き候補」として提案します。";
  }
  const prevRenderAll123=renderAll;
  renderAll=function(){prevRenderAll123();hookProposal123();updateHelp123();};
  const style=document.createElement("style");
  style.textContent=`.conditional-move-suggestions{margin-top:10px;padding:10px 12px;border:1px dashed #4a7d55;border-radius:9px;background:#f7fbf7}.conditional-title{display:flex;gap:10px;align-items:baseline;margin-bottom:7px}.conditional-item{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--border)}.conditional-item:first-of-type{border-top:0}.conditional-requirement{margin-top:3px;font-weight:700;color:#3e6b48}@media(max-width:700px){.conditional-item{align-items:stretch;flex-direction:column}.conditional-item button{width:100%}}`;
  document.head.appendChild(style);
  hookProposal123();updateHelp123();
})();