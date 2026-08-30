(() => {
  function participants130(l){
    const ps=(l?.participants||[]).filter(c=>state.classes.includes(c));
    return ps.length?ps:[];
  }
  function fixed130(l,date,day,from,to){
    const cls=participants130(l);
    return (state.fixedSlots||[]).some(r=>r&&r.date===date&&r.day===day&&(+r.period===+from||+r.period===+to)&&(r.classes||[]).some(c=>cls.includes(c)));
  }
  function selectedTd130(){
    return $("#dailyTable td.manual-selected-cell129[data-class][data-date][data-day][data-period]");
  }
  function lessonAt130(cls,date,day,p){
    return periodsForClass(cls).map(Number).includes(+p)?getDaily(cls,date,day,+p):null;
  }
  function snapshot130(desc){
    state.manualMoveUndo129=Array.isArray(state.manualMoveUndo129)?state.manualMoveUndo129:[];
    state.manualMoveUndo129.push({
      id:uniqueId(),ts:new Date().toISOString(),description:desc,
      daily:clone(state.daily),moveRecords:clone(state.moveRecords||[]),classSettings:clone(state.classSettings)
    });
    state.manualMoveUndo129=state.manualMoveUndo129.slice(-10);
  }
  function structuralCheck130(date,day,moves){
    const moved=new Set(moves.map(m=>m.lesson.groupId));
    const classMap=new Map();
    const seen=new Set();
    state.classes.forEach(cls=>periodsForClass(cls).forEach(p=>{
      const l=getDaily(cls,date,day,p);if(!l||moved.has(l.groupId))return;
      const gid=l.groupId||`${cls}|${p}|${l.subject}`;
      if(seen.has(`${gid}|${p}`))return;seen.add(`${gid}|${p}`);
      participants130(l).forEach(c=>classMap.set(`${c}|${p}`,gid));
    }));
    for(const m of moves){
      const gid=m.lesson.groupId||uniqueId();
      for(const c of participants130(m.lesson)){
        if(!periodsForClass(c).map(Number).includes(+m.to))return {ok:false,reason:`${c}には${m.to}限がありません。`};
        const k=`${c}|${m.to}`,old=classMap.get(k);
        if(old&&old!==gid)return {ok:false,reason:`${c}の${m.to}限には別の授業があり、同じセルに2授業は保存できません。`};
        classMap.set(k,gid);
      }
    }
    return {ok:true};
  }
  function moveSelected130(delta){
    const td=selectedTd130();
    const msg=$("#manualMoveMessage129");
    if(!td){if(msg){msg.className="status warn manual-message129";msg.textContent="先に移動したい授業セルを選択してください。";}return;}
    const cls=td.dataset.class,date=td.dataset.date,day=td.dataset.day,from=+td.dataset.period,to=from+delta;
    const a=lessonAt130(cls,date,day,from);if(!a)return;
    if(!periodsForClass(cls).map(Number).includes(to))return;
    const b=lessonAt130(cls,date,day,to);
    const moves=[{lesson:clone(a),from,to}];
    if(b&&b.groupId!==a.groupId)moves.push({lesson:clone(b),from:to,to:from});

    for(const m of moves){
      if(fixed130(m.lesson,date,day,m.from,m.to)){
        if(msg){msg.className="status warn manual-message129";msg.textContent="時間固定されている授業は移動できません。固定を解除してから操作してください。";}
        return;
      }
    }
    const structure=structuralCheck130(date,day,moves);
    if(!structure.ok){
      if(msg){msg.className="status warn manual-message129";msg.textContent=structure.reason;}
      return;
    }

    const desc=b?`${date} ${cls} ${from}限↔${to}限 ${a.subject} / ${b.subject}`:`${date} ${cls} ${a.subject} ${from}限→${to}限`;
    snapshot130(desc);
    moves.forEach(m=>removeDailyGroup(date,day,m.from,m.lesson));
    moves.forEach(m=>writeDailyGroup(date,day,m.to,m.lesson));
    state.moveRecords=Array.isArray(state.moveRecords)?state.moveRecords:[];
    moves.forEach(m=>state.moveRecords.push({
      id:uniqueId(),groupId:m.lesson.groupId,fromDate:date,fromDay:day,fromPeriod:+m.from,
      toDate:date,toDay:day,toPeriod:+m.to,participants:[...(m.lesson.participants||[])],
      subject:m.lesson.subject,ts:new Date().toISOString(),source:"自由手動移動"
    }));
    state.moveRecords=state.moveRecords.slice(-600);
    addHistory(b?"手動入れ替え":"手動移動",desc);
    save();renderAll();
    setTimeout(()=>{
      const target=[...document.querySelectorAll('#dailyTable td.slot[data-class][data-date][data-day][data-period]')].find(x=>x.dataset.class===cls&&x.dataset.date===date&&x.dataset.day===day&&+x.dataset.period===to);
      if(target)target.click();
      decorateWarnings130();
      const m=$("#manualMoveMessage129");
      if(m){
        const warn=target?.classList.contains("manual-warning-cell130");
        m.className=`status ${warn?"warn":"ok"} manual-message129`;
        m.textContent=warn?"移動しました。条件や重複に抵触しているため、赤いセルを確認してください。":(b?`${from}限と${to}限を入れ替えました。`:`${from}限から${to}限へ移動しました。`);
      }
    },0);
  }

  function uniqueLessons130(date,day,p){
    const map=new Map();
    state.classes.forEach(cls=>{
      if(!periodsForClass(cls).map(Number).includes(+p))return;
      const l=getDaily(cls,date,day,p);if(!l)return;
      const gid=l.groupId||`${cls}|${p}|${l.subject}`;
      if(!map.has(gid))map.set(gid,l);
    });
    return [...map.values()];
  }
  function warningsFor130(cls,date,day,p,l){
    const reasons=[];
    const conds=(state.structuredConditions||[]).filter(c=>c&&c.enabled!==false&&c.date===date&&(c.periods||[]).map(Number).includes(+p));
    conds.forEach(c=>{
      if(c.condition==="不在"&&(l.teachers||[]).includes(c.target))reasons.push(`${c.target}先生：不在条件`);
      if(c.condition==="使用不可"&&(l.rooms||[]).includes(c.target))reasons.push(`${c.target}：使用不可`);
    });
    const active=activeTeachers(l);
    active.forEach(t=>{
      const ok=typeof window.teacherAvailableOnDate==="function"?window.teacherAvailableOnDate(t,date,day,p):teacherAvailable(t,day,p);
      if(!ok)reasons.push(`${t}先生：勤務不可`);
    });
    const slot=uniqueLessons130(date,day,p);
    active.forEach(t=>{
      const hits=slot.filter(x=>activeTeachers(x).includes(t));
      if(hits.length>1)reasons.push(`${t}先生：授業重複`);
    });
    (l.rooms||[]).forEach(r=>{
      const hits=slot.filter(x=>(x.rooms||[]).includes(r));
      if(hits.length>1)reasons.push(`${r}：教室重複`);
    });
    return [...new Set(reasons)];
  }
  function decorateWarnings130(){
    const table=$("#dailyTable");if(!table)return;
    table.querySelectorAll("td.slot[data-class][data-date][data-day][data-period]").forEach(td=>{
      const cls=td.dataset.class,date=td.dataset.date,day=td.dataset.day,p=+td.dataset.period;
      const l=getDaily(cls,date,day,p);
      const reasons=l?warningsFor130(cls,date,day,p,l):[];
      td.classList.toggle("manual-warning-cell130",reasons.length>0);
      if(reasons.length){
        td.dataset.warning130=reasons.join(" / ");
        td.title=`⚠ ${reasons.join(" / ")}`;
      }else{
        delete td.dataset.warning130;
        if((td.title||"").startsWith("⚠ "))td.removeAttribute("title");
      }
    });
  }
  function hookToolbar130(){
    const up=$("#moveSelectedUp129"),down=$("#moveSelectedDown129");
    if(up&&up.dataset.freeMove130!=="1"){up.dataset.freeMove130="1";up.onclick=()=>moveSelected130(-1);}
    if(down&&down.dataset.freeMove130!=="1"){down.dataset.freeMove130="1";down.onclick=()=>moveSelected130(1);}
    const m=$("#manualMoveMessage129");
    if(m&&m.dataset.freeMove130!=="1"){
      m.dataset.freeMove130="1";
      m.textContent="原則として自由に移動できます。時間固定だけは移動不可です。条件違反や重複は赤いセルで警告します。";
    }
  }
  function refresh130(){hookToolbar130();decorateWarnings130();}
  const prevDaily130=renderDaily;
  renderDaily=function(){const r=prevDaily130();setTimeout(refresh130,0);return r;};
  const prevAll130=renderAll;
  renderAll=function(){const r=prevAll130();setTimeout(refresh130,0);return r;};

  const style=document.createElement("style");
  style.textContent=`
    #dailyTable td.manual-warning-cell130{
      background:#ffe8e8!important;
      box-shadow:inset 0 0 0 2px #d93025!important;
    }
    #dailyTable td.manual-warning-cell130 .cell-content,
    #dailyTable td.manual-warning-cell130 .cell-line{color:#b42318!important}
    #dailyTable td.manual-warning-cell130.manual-selected-cell129{
      outline:3px solid #2459d3!important;
      outline-offset:-3px!important;
      box-shadow:inset 0 0 0 2px #d93025!important;
    }
  `;
  document.head.appendChild(style);
  setTimeout(refresh130,0);
})();
