(() => {
  function conditions128(date){
    return (state.structuredConditions||[]).filter(c=>c&&c.enabled!==false&&c.date===date);
  }
  function fixed128(classes,date,day,p){
    return (state.fixedSlots||[]).some(r=>r&&r.date===date&&r.day===day&&+r.period===+p&&(r.classes||[]).some(c=>classes.includes(c)));
  }
  function available128(name,date,day,p){
    return typeof window.teacherAvailableOnDate==="function"
      ? window.teacherAvailableOnDate(name,date,day,p)
      : teacherAvailable(name,day,p);
  }
  function conditionBlock128(l,date,p){
    return conditions128(date).find(c=>{
      if(!(c.periods||[]).map(Number).includes(+p)) return false;
      if(c.condition==="不在") return (l.teachers||[]).includes(c.target);
      if(c.condition==="使用不可") return (l.rooms||[]).includes(c.target);
      return false;
    })||null;
  }
  function lessonClasses128(l){
    return (l?.participants||[]).filter(c=>state.classes.includes(c));
  }
  function findLessonAt128(cls,date,day,p){
    return periodsForClass(cls).includes(+p)?getDaily(cls,date,day,+p):null;
  }

  function validateArrowPlan128(date,day,moves){
    if(!moves.length) return {ok:false,reason:"移動する授業がありません"};
    const moveGroups=new Set(moves.map(x=>x.lesson.groupId));
    for(const m of moves){
      const classes=lessonClasses128(m.lesson);
      if(classes.length!==1) return {ok:false,reason:"合同授業は矢印移動の対象外です。授業編集から変更してください。"};
      if(!classes.every(c=>periodsForClass(c).includes(+m.to))) return {ok:false,reason:"移動先がクラスの校時外です"};
      if(fixed128(classes,date,day,m.from)||fixed128(classes,date,day,m.to)) return {ok:false,reason:"時間固定されている授業は移動できません"};
      const block=conditionBlock128(m.lesson,date,m.to);
      if(block) return {ok:false,reason:`移動先が変更条件「${block.target} ${block.condition}」に抵触します`};
      const unavailable=activeTeachers(m.lesson).filter(t=>!available128(t,date,day,m.to));
      if(unavailable.length) return {ok:false,reason:`${unavailable.join("・")}先生が${m.to}限は勤務不可です`};
    }

    const classMap=new Map(),teacherMap=new Map(),roomMap=new Map(),seen=new Set();
    state.classes.forEach(cls=>periodsForClass(cls).forEach(p=>{
      const l=getDaily(cls,date,day,p); if(!l||moveGroups.has(l.groupId)) return;
      const key=l.groupId||`${cls}-${p}`; if(seen.has(key)) return; seen.add(key);
      const gid=l.groupId;
      lessonClasses128(l).forEach(c=>classMap.set(`${c}|${p}`,gid));
      activeTeachers(l).forEach(t=>teacherMap.set(`${t}|${p}`,gid));
      (l.rooms||[]).forEach(r=>roomMap.set(`${r}|${p}`,gid));
    }));

    for(const m of moves){
      const l=m.lesson,gid=l.groupId,p=+m.to;
      for(const cls of lessonClasses128(l)){
        const k=`${cls}|${p}`,old=classMap.get(k);
        if(old&&old!==gid) return {ok:false,reason:`${cls}の${p}限に別の授業があります`};
        classMap.set(k,gid);
      }
      for(const t of activeTeachers(l)){
        const k=`${t}|${p}`,old=teacherMap.get(k);
        if(old&&old!==gid) return {ok:false,reason:`${t}先生が${p}限に別の授業を担当しています`};
        teacherMap.set(k,gid);
      }
      for(const r of (l.rooms||[])){
        const k=`${r}|${p}`,old=roomMap.get(k);
        if(old&&old!==gid) return {ok:false,reason:`${r}が${p}限に使用されています`};
        roomMap.set(k,gid);
      }
    }
    return {ok:true};
  }

  function pushArrowUndo128(description){
    state.proposalUndoStack=Array.isArray(state.proposalUndoStack)?state.proposalUndoStack:[];
    state.proposalUndoStack.push({
      id:uniqueId(),ts:new Date().toISOString(),description,
      daily:clone(state.daily),moveRecords:clone(state.moveRecords||[]),classSettings:clone(state.classSettings)
    });
    state.proposalUndoStack=state.proposalUndoStack.slice(-5);
  }

  function arrowMove128(td,delta){
    const cls=td.dataset.class,date=td.dataset.date,day=td.dataset.day,from=+td.dataset.period;
    if(!cls||!date||!day||!Number.isFinite(from)) return;
    const a=findLessonAt128(cls,date,day,from); if(!a) return;
    const classesA=lessonClasses128(a);
    if(classesA.length!==1){alert("合同授業は矢印では移動できません。授業編集から変更してください。");return;}
    const ps=periodsForClass(cls).map(Number),to=from+delta;
    if(!ps.includes(to)) return;
    const b=findLessonAt128(cls,date,day,to);
    if(b&&lessonClasses128(b).length!==1){alert("移動先が合同授業のため、矢印では入れ替えできません。");return;}
    const moves=[{lesson:clone(a),from,to,cls}];
    if(b) moves.push({lesson:clone(b),from:to,to:from,cls});
    const check=validateArrowPlan128(date,day,moves);
    if(!check.ok){alert(`この移動はできません。\n${check.reason}`);return;}

    const desc=b
      ? `${date} ${cls} ${from}限↔${to}限 ${a.subject} / ${b.subject}`
      : `${date} ${cls} ${a.subject} ${from}限→${to}限`;
    pushArrowUndo128(desc);

    moves.forEach(m=>removeDailyGroup(date,day,m.from,m.lesson));
    moves.forEach(m=>writeDailyGroup(date,day,m.to,m.lesson));
    state.moveRecords=Array.isArray(state.moveRecords)?state.moveRecords:[];
    moves.forEach(m=>state.moveRecords.push({
      id:uniqueId(),groupId:m.lesson.groupId,fromDate:date,fromDay:day,fromPeriod:+m.from,
      toDate:date,toDay:day,toPeriod:+m.to,participants:[...(m.lesson.participants||[])],
      subject:m.lesson.subject,ts:new Date().toISOString(),source:"手動矢印移動"
    }));
    state.moveRecords=state.moveRecords.slice(-600);
    addHistory(b?"手動入れ替え":"手動移動",desc);
    save();renderAll();
  }

  // 後続パッチからも矢印移動本体を呼べるよう公開する
  window.arrowMove128=arrowMove128;

  function decorateArrowButtons128(){
    const table=$("#dailyTable"); if(!table) return;
    table.querySelectorAll("td.slot[data-class][data-date][data-day][data-period]").forEach(td=>{
      const cls=td.dataset.class,date=td.dataset.date,day=td.dataset.day,p=+td.dataset.period;
      const l=getDaily(cls,date,day,p);
      td.querySelector(".cell-arrow-controls128")?.remove();
      if(!l) return;
      const ps=periodsForClass(cls).map(Number);
      const wrap=document.createElement("div");wrap.className="cell-arrow-controls128";
      if(ps.includes(p-1)){
        const up=document.createElement("button");up.type="button";up.className="cell-arrow128";up.textContent="▲";up.title="1校時上へ移動／入れ替え";
        up.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();arrowMove128(td,-1);});wrap.appendChild(up);
      }
      if(ps.includes(p+1)){
        const down=document.createElement("button");down.type="button";down.className="cell-arrow128";down.textContent="▼";down.title="1校時下へ移動／入れ替え";
        down.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();arrowMove128(td,1);});wrap.appendChild(down);
      }
      if(wrap.childElementCount) td.appendChild(wrap);
    });
  }

  const previousRenderDaily128=renderDaily;
  renderDaily=function(){const r=previousRenderDaily128();decorateArrowButtons128();return r;};
  const previousRenderAll128=renderAll;
  renderAll=function(){const r=previousRenderAll128();decorateArrowButtons128();return r;};

  const style=document.createElement("style");
  style.textContent=`
    #dailyTable td.slot{position:relative}
    .cell-arrow-controls128{position:absolute;right:3px;top:3px;display:flex;flex-direction:column;gap:2px;z-index:6;opacity:.18;transition:opacity .12s ease}
    #dailyTable td.slot:hover .cell-arrow-controls128,.cell-arrow-controls128:focus-within{opacity:1}
    .cell-arrow128{width:21px;height:18px;min-width:0!important;padding:0!important;border:1px solid #8aa0b3!important;border-radius:4px!important;background:rgba(255,255,255,.94)!important;color:#31536d!important;font-size:9px!important;line-height:16px!important;cursor:pointer!important;box-shadow:0 1px 2px rgba(0,0,0,.08)}
    .cell-arrow128:hover{background:#eaf4fb!important;border-color:#2f6f9f!important;color:#174e78!important}
    @media(max-width:700px){.cell-arrow-controls128{opacity:.72}.cell-arrow128{width:20px;height:17px}}
  `;
  document.head.appendChild(style);

  decorateArrowButtons128();
})();