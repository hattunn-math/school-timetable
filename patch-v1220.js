(() => {
  const previousAnalyzeConditions = analyzeConditions;
  const previousApplyConditions = applyConditions;

  function ensureV1220ConditionKinds(){
    const type=$("#conditionTargetType"), kind=$("#conditionKind");
    if(!type||!kind||type.value!=="teacher") return;
    const old=kind.value;
    const values=["不在","自習","勤務可","勤務不可"];
    kind.innerHTML=values.map(v=>`<option value="${v}">${v}</option>`).join("");
    kind.value=values.includes(old)?old:"不在";
  }

  function hookV1220ConditionEditor(){
    const type=$("#conditionTargetType");
    if(type && type.dataset.v1220Hook!=="1"){
      type.dataset.v1220Hook="1";
      type.addEventListener("change",()=>setTimeout(ensureV1220ConditionKinds,0));
    }
    ensureV1220ConditionKinds();
  }

  function splitV1220Conditions(){
    const all=Array.isArray(state.structuredConditions)?state.structuredConditions:[];
    const absence=all.filter(c=>c && c.condition==="不在");
    const selfStudy=all.filter(c=>c && c.condition==="自習");
    const passthrough=all.filter(c=>!absence.includes(c) && !selfStudy.includes(c));
    return {all,absence,selfStudy,passthrough};
  }

  function affectedLessonsForCondition(c){
    if(!c?.date || !dayNameForDate(c.date)) return [];
    const date=c.date, day=dayNameForDate(date), out=[], seen=new Set();
    (c.periods||[]).map(Number).forEach(p=>{
      state.classes.forEach(cls=>{
        if(!periodsForClass(cls).includes(p)) return;
        const l=getDaily(cls,date,day,p); if(!l) return;
        if(c.targetType==="teacher" && !(l.teachers||[]).includes(c.target)) return;
        const key=`${date}|${p}|${l.groupId}`;
        if(seen.has(key)) return; seen.add(key);
        out.push({date,day,p,lesson:l});
      });
    });
    return out;
  }

  function renderAbsenceRouting(absence){
    if(!absence.length) return "";
    let count=0;
    absence.filter(c=>c.enabled!==false).forEach(c=>{ count+=affectedLessonsForCondition(c).length; });
    return `<div class="status warn">不在条件 ${absence.filter(c=>c.enabled!==false).length}件（該当授業 ${count}件）は自動変更しません。単独担当・複数担当とも「移動候補」で同日内の移動・入れ替えを検討します。</div>`;
  }

  function renderSelfStudySummary(selfStudy){
    const enabled=selfStudy.filter(c=>c.enabled!==false);
    if(!enabled.length) return "";
    let count=0; enabled.forEach(c=>{count+=affectedLessonsForCondition(c).length;});
    return `<div class="status ok">自習指定 ${enabled.length}件（該当授業 ${count}件）は「安全な変更だけ自動反映」で自習に変更します。</div>`;
  }

  analyzeConditions=function(){
    const {all,absence,selfStudy,passthrough}=splitV1220Conditions();
    state.structuredConditions=passthrough;
    let result;
    try{ result=previousAnalyzeConditions(); }
    finally{ state.structuredConditions=all; save(); }
    const box=$("#conditionResult");
    if(box){
      const extra=renderAbsenceRouting(absence)+renderSelfStudySummary(selfStudy);
      if(extra) box.insertAdjacentHTML("afterbegin",extra);
    }
    return result;
  };

  function applySelfStudyConditions(selfStudy){
    let changed=0;
    const seen=new Set();
    selfStudy.filter(c=>c.enabled!==false).forEach(c=>{
      affectedLessonsForCondition(c).forEach(x=>{
        const key=`${x.date}|${x.p}|${x.lesson.groupId}`; if(seen.has(key)) return; seen.add(key);
        const l=clone(x.lesson);
        l.subject="自習";
        l.teachers=[];
        l.absent=[];
        l.substitute="";
        writeDailyGroup(x.date,x.day,x.p,l);
        addHistory("自習指定",`${x.date} ${participantsText(l)} ${x.p}限 自習`);
        changed++;
      });
    });
    return changed;
  }

  applyConditions=function(){
    const {all,absence,selfStudy,passthrough}=splitV1220Conditions();
    state.structuredConditions=passthrough;
    let result;
    try{ result=previousApplyConditions(); }
    finally{ state.structuredConditions=all; }
    const selfStudyChanged=applySelfStudyConditions(selfStudy);
    save(); renderAll();
    const box=$("#conditionResult");
    if(box){
      const extra=renderAbsenceRouting(absence)+(selfStudyChanged?`<div class="status ok">明示指定された自習を ${selfStudyChanged}件 反映しました。</div>`:renderSelfStudySummary(selfStudy));
      if(extra) box.insertAdjacentHTML("afterbegin",extra);
    }
    return result;
  };

  function decorateV1220Conditions(){
    $$(".structured-condition-item").forEach(item=>{
      const txt=item.textContent||"";
      item.classList.toggle("self-study-condition",txt.includes("自習"));
      item.classList.toggle("absence-move-condition",txt.includes("不在"));
    });
  }

  function updateV1220Help(){
    const card=$("#structuredConditionEditor")?.closest(".card");
    const desc=card?.querySelector("p.muted");
    if(desc) desc.textContent="日付・対象・条件・校時を指定します。不在は自動変更せず移動候補へ回し、自習は明示指定した場合だけ反映します。";
    const proposalCard=$("#moveProposalCard");
    const p=proposalCard?.querySelector("p.muted");
    if(p) p.textContent="1日ずつ、不在・使用不可の条件から同日内の移動を優先し、必要に応じて入れ替え候補を作成します。候補がない場合は理由を表示します。";
  }

  const previousRenderAll=renderAll;
  renderAll=function(){
    previousRenderAll();
    hookV1220ConditionEditor();
    decorateV1220Conditions();
    updateV1220Help();
  };

  const style=document.createElement("style");
  style.textContent=`
    .self-study-condition{border-left:4px solid #8a6d1d!important}
    .absence-move-condition{border-left:4px solid #2f6f9f!important}
  `;
  document.head.appendChild(style);

  hookV1220ConditionEditor();
  decorateV1220Conditions();
  updateV1220Help();
  save();
})();
