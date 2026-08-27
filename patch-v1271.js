(() => {
  function activeAbsenceConditions1271(date, period){
    return (state.structuredConditions||[]).filter(c=>
      c && c.enabled!==false &&
      c.date===date &&
      c.targetType==="teacher" &&
      c.condition==="不在" &&
      (c.periods||[]).map(Number).includes(+period)
    );
  }

  function absenceHitsForCell1271(td){
    const date=td.dataset.date||"";
    const day=td.dataset.day||"";
    const cls=td.dataset.class||"";
    const period=+(td.dataset.period||NaN);
    if(!date||!day||!cls||!Number.isFinite(period)) return [];
    const lesson=getDaily(cls,date,day,period);
    if(!lesson) return [];
    const teachers=lesson.teachers||[];
    return activeAbsenceConditions1271(date,period).filter(c=>teachers.includes(c.target));
  }

  function decorateAbsenceCells1271(){
    const table=$("#dailyTable");
    if(!table) return;
    table.querySelectorAll("td.slot[data-class][data-date][data-day][data-period]").forEach(td=>{
      const hits=absenceHitsForCell1271(td);
      const on=hits.length>0;
      td.classList.toggle("absence-condition-cell1271",on);
      if(on){
        td.dataset.absenceTeachers1271=hits.map(c=>c.target).join("・");
        const baseTitle=td.getAttribute("title")||"";
        const warning=`不在条件：${hits.map(c=>c.target).join("・")}先生`;
        td.setAttribute("title",baseTitle&&!baseTitle.includes("不在条件：")?`${baseTitle} / ${warning}`:warning);
      }else{
        delete td.dataset.absenceTeachers1271;
        const title=td.getAttribute("title")||"";
        if(title.startsWith("不在条件：")) td.removeAttribute("title");
      }
    });
  }

  const previousRenderDaily1271=renderDaily;
  renderDaily=function(){
    const r=previousRenderDaily1271();
    decorateAbsenceCells1271();
    return r;
  };

  const previousRenderAll1271=renderAll;
  renderAll=function(){
    const r=previousRenderAll1271();
    decorateAbsenceCells1271();
    return r;
  };

  function hookConditionRefresh1271(){
    const ids=["addStructuredConditionBtn","analyzeConditionsBtn","applyConditionsBtn"];
    ids.forEach(id=>{
      const el=$("#"+id);
      if(!el||el.dataset.absence1271==="1") return;
      el.dataset.absence1271="1";
      el.addEventListener("click",()=>setTimeout(decorateAbsenceCells1271,0));
    });
    const list=$("#structuredConditionList");
    if(list&&!list.dataset.absence1271){
      list.dataset.absence1271="1";
      list.addEventListener("change",()=>setTimeout(decorateAbsenceCells1271,0));
    }
  }

  const style=document.createElement("style");
  style.textContent=`
    #dailyTable td.absence-condition-cell1271{
      background:#fff0f0!important;
      box-shadow:inset 0 0 0 2px #d93025!important;
    }
    #dailyTable td.absence-condition-cell1271 .cell-content,
    #dailyTable td.absence-condition-cell1271 .cell-line,
    #dailyTable td.absence-condition-cell1271 .cell-subject,
    #dailyTable td.absence-condition-cell1271 .cell-teachers,
    #dailyTable td.absence-condition-cell1271 .cell-participants,
    #dailyTable td.absence-condition-cell1271 .cell-rooms{
      color:#c62828!important;
    }
  `;
  document.head.appendChild(style);

  hookConditionRefresh1271();
  decorateAbsenceCells1271();
})();
