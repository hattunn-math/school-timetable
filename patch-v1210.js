(() => {
  const baseTeacherAvailable = teacherAvailable;
  const baseConflictEntries = conflictEntries;
  const baseRenderTeacherDayTable = renderTeacherDayTable;
  const baseLessonAvailabilityWarnings = lessonAvailabilityWarnings;
  const baseAnalyzeConditions = analyzeConditions;
  const baseApplyConditions = applyConditions;

  function workOverrideConditions(name,date,period){
    return (state.structuredConditions||[]).filter(c=>
      c && c.enabled!==false && c.targetType==="teacher" && c.target===name && c.date===date &&
      (c.periods||[]).map(Number).includes(+period) && (c.condition==="勤務可" || c.condition==="勤務不可")
    );
  }

  function teacherAvailableOnDate(name,date,day,period){
    const list=workOverrideConditions(name,date,period);
    if(list.length){
      const latest=list[list.length-1];
      return latest.condition==="勤務可";
    }
    return baseTeacherAvailable(name,day,period);
  }
  window.teacherAvailableOnDate = teacherAvailableOnDate;

  function inferredAvailabilityDate(day){
    if(window.__teacherAvailabilityDateContext){
      const d=window.__teacherAvailabilityDateContext;
      if(dayNameForDate(d)===day) return d;
    }
    const d=typeof currentDate==="function" ? currentDate() : "";
    return d && dayNameForDate(d)===day ? d : "";
  }

  teacherAvailable = function(name,day,period){
    const date=inferredAvailabilityDate(day);
    return date ? teacherAvailableOnDate(name,date,day,period) : baseTeacherAvailable(name,day,period);
  };

  function withAvailabilityDate(date,fn){
    const old=window.__teacherAvailabilityDateContext;
    window.__teacherAvailabilityDateContext=date||old||"";
    try{return fn();}finally{window.__teacherAvailabilityDateContext=old;}
  }

  conflictEntries = function(date){ return withAvailabilityDate(date,()=>baseConflictEntries(date)); };
  renderTeacherDayTable = function(date,day){ return withAvailabilityDate(date,()=>baseRenderTeacherDayTable(date,day)); };
  lessonAvailabilityWarnings = function(l,day,p){
    const date=editing && !editing.isBase ? (editing.date||currentDate()) : currentDate();
    return withAvailabilityDate(date,()=>baseLessonAvailabilityWarnings(l,day,p));
  };

  function ensureWorkConditionKinds(){
    const type=$("#conditionTargetType"), kind=$("#conditionKind");
    if(!type||!kind||type.value!=="teacher") return;
    const old=kind.value;
    const values=["不在","勤務可","勤務不可"];
    kind.innerHTML=values.map(v=>`<option value="${v}">${v}</option>`).join("");
    kind.value=values.includes(old)?old:"不在";
  }

  function hookConditionEditor(){
    const type=$("#conditionTargetType");
    if(type && type.dataset.workOverrideHook!=="1"){
      type.dataset.workOverrideHook="1";
      type.addEventListener("change",()=>setTimeout(ensureWorkConditionKinds,0));
    }
    ensureWorkConditionKinds();
  }

  function splitWorkConditions(){
    const all=Array.isArray(state.structuredConditions)?state.structuredConditions:[];
    const work=all.filter(c=>c && (c.condition==="勤務可" || c.condition==="勤務不可"));
    const normal=all.filter(c=>!work.includes(c));
    return {all,work,normal};
  }

  function workConditionSummary(work){
    if(!work.length) return "";
    return `<div class="status ok">勤務可否の例外条件 ${work.length}件は、移動候補・空き教員検索・勤務時間外判定に反映されます。</div>`;
  }

  analyzeConditions = function(){
    const {all,work,normal}=splitWorkConditions();
    state.structuredConditions=normal;
    let result;
    try{ result=baseAnalyzeConditions(); }
    finally{ state.structuredConditions=all; save(); }
    const box=$("#conditionResult");
    if(box && work.length) box.insertAdjacentHTML("afterbegin",workConditionSummary(work));
    return result;
  };

  applyConditions = function(){
    const {all,work,normal}=splitWorkConditions();
    state.structuredConditions=normal;
    let result;
    try{ result=baseApplyConditions(); }
    finally{ state.structuredConditions=all; save(); renderAll(); }
    const box=$("#conditionResult");
    if(box && work.length) box.insertAdjacentHTML("afterbegin",workConditionSummary(work));
    return result;
  };

  function hookProposalButton(){
    const btn=$("#createMoveProposalsBtn");
    if(!btn || btn.dataset.availabilityOverrideHook==="1") return;
    const old=btn.onclick;
    if(typeof old!=="function") return;
    btn.dataset.availabilityOverrideHook="1";
    btn.onclick=function(e){
      const date=$("#proposalTargetDate")?.value || currentDate();
      return withAvailabilityDate(date,()=>old.call(this,e));
    };
  }

  function decorateOverrideConditions(){
    $$(".structured-condition-item").forEach(item=>{
      const txt=item.textContent||"";
      item.classList.toggle("work-override-condition",txt.includes("勤務可")||txt.includes("勤務不可"));
    });
  }

  const previousRenderAll=renderAll;
  renderAll=function(){
    previousRenderAll();
    hookConditionEditor();
    hookProposalButton();
    decorateOverrideConditions();
  };

  const style=document.createElement("style");
  style.textContent=`
    .work-override-condition{border-left:4px solid #4a7d55!important}
  `;
  document.head.appendChild(style);

  hookConditionEditor();
  hookProposalButton();
  decorateOverrideConditions();
  save();
})();
