(() => {
  let selected129 = null;

  function ensureManualUndo129(){
    if(!Array.isArray(state.manualMoveUndo129)) state.manualMoveUndo129=[];
  }
  function periods129(cls){ return periodsForClass(cls).map(Number); }
  function lessonClasses129(l){
    return (l?.participants||[]).filter(c=>state.classes.includes(c));
  }
  function available129(name,date,day,p){
    return typeof window.teacherAvailableOnDate==="function"
      ? window.teacherAvailableOnDate(name,date,day,p)
      : teacherAvailable(name,day,p);
  }
  function fixed129(classes,date,day,p){
    return (state.fixedSlots||[]).some(r=>r&&r.date===date&&r.day===day&&+r.period===+p&&(r.classes||[]).some(c=>classes.includes(c)));
  }
  function conditionBlock129(l,date,p){
    return (state.structuredConditions||[]).find(c=>{
      if(!c||c.enabled===false||c.date!==date||!(c.periods||[]).map(Number).includes(+p)) return false;
      if(c.condition==="不在") return (l.teachers||[]).includes(c.target);
      if(c.condition==="使用不可") return (l.rooms||[]).includes(c.target);
      return false;
    })||null;
  }
  function lessonAt129(cls,date,day,p){
    return periods129(cls).includes(+p)?getDaily(cls,date,day,+p):null;
  }

  function ensureToolbar129(){
    const daily=$("#daily");
    const top=daily?.querySelector(".toolbar.card");
    if(!daily||!top)return;
    let bar=$("#manualMoveToolbar129");
    if(!bar){
      bar=document.createElement("div");
      bar.id="manualMoveToolbar129";
      bar.className="card manual-move-toolbar129";
      bar.innerHTML=`
        <div class="manual-move-main129">
          <div class="manual-selected129">
            <strong>手動移動</strong>
            <span id="manualSelectedText129" class="muted">授業セルをクリックして選択してください。</span>
          </div>
          <div class="manual-move-actions129">
            <button id="moveSelectedUp129" type="button" class="sub" disabled>▲ 1校時上へ</button>
            <button id="moveSelectedDown129" type="button" class="sub" disabled>▼ 1校時下へ</button>
            <button id="editSelected129" type="button" class="sub" disabled>選択セルを編集</button>
            <button id="clearSelected129" type="button" class="sub" disabled>選択解除</button>
            <button id="undoManualMove129" type="button" class="danger-outline">直前の手動移動を戻す</button>
          </div>
        </div>
        <div id="manualMoveMessage129" class="small muted">移動先が空きなら移動、授業がある場合は入れ替えます。</div>`;
      top.insertAdjacentElement("afterend",bar);
      $("#moveSelectedUp129").onclick=()=>moveSelected129(-1);
      $("#moveSelectedDown129").onclick=()=>moveSelected129(1);
      $("#editSelected129").onclick=editSelected129;
      $("#clearSelected129").onclick=()=>{selected129=null;refreshSelection129();};
      $("#undoManualMove129").onclick=undoManual129;
    }
    refreshUndo129();
  }

  function currentSelectedLesson129(){
    if(!selected129)return null;
    return lessonAt129(selected129.cls,selected129.date,selected129.day,selected129.p);
  }
  function selectionStillValid129(){
    if(!selected129)return false;
    const l=currentSelectedLesson129();
    return !!(l && (!selected129.groupId || l.groupId===selected129.groupId));
  }
  function selectCell129(td){
    const cls=td.dataset.class,date=td.dataset.date,day=td.dataset.day,p=+td.dataset.period;
    const l=lessonAt129(cls,date,day,p);
    if(!l)return;
    selected129={cls,date,day,p,groupId:l.groupId||""};
    refreshSelection129();
  }
  function findSelectedTd129(){
    if(!selected129)return null;
    return [...document.querySelectorAll('#dailyTable td.slot[data-class][data-date][data-day][data-period]')].find(td=>
      td.dataset.class===selected129.cls && td.dataset.date===selected129.date && td.dataset.day===selected129.day && +td.dataset.period===+selected129.p
    )||null;
  }
  function refreshSelection129(){
    ensureToolbar129();
    document.querySelectorAll("#dailyTable td.manual-selected-cell129").forEach(td=>td.classList.remove("manual-selected-cell129"));
    const text=$("#manualSelectedText129"),up=$("#moveSelectedUp129"),down=$("#moveSelectedDown129"),edit=$("#editSelected129"),clear=$("#clearSelected129");
    if(!selectionStillValid129()) selected129=null;
    if(!selected129){
      if(text)text.textContent="授業セルをクリックして選択してください。";
      [up,down,edit,clear].forEach(b=>{if(b)b.disabled=true;});
      refreshUndo129();
      return;
    }
    const l=currentSelectedLesson129();
    const td=findSelectedTd129(); if(td)td.classList.add("manual-selected-cell129");
    if(text)text.textContent=`${selected129.date} ${selected129.cls} ${selected129.p}限　${l?.subject||""}`;
    const ps=periods129(selected129.cls);
    if(up)up.disabled=!ps.includes(selected129.p-1);
    if(down)down.disabled=!ps.includes(selected129.p+1);
    if(edit)edit.disabled=!l;
    if(clear)clear.disabled=false;
    refreshUndo129();
  }

  function validatePlan129(date,day,moves){
    const moved=new Set(moves.map(m=>m.lesson.groupId));
    for(const m of moves){
      const classes=lessonClasses129(m.lesson);
      if(classes.length!==1) return {ok:false,reason:"合同授業は上下移動の対象外です。編集画面から変更してください。"};
      if(!classes.every(c=>periods129(c).includes(+m.to))) return {ok:false,reason:"移動先が校時外です。"};
      if(fixed129(classes,date,day,m.from)||fixed129(classes,date,day,m.to)) return {ok:false,reason:"時間固定されている授業は移動できません。"};
      const block=conditionBlock129(m.lesson,date,m.to);
      if(block) return {ok:false,reason:`移動先が変更条件「${block.target} ${block.condition}」に抵触します。`};
      const bad=activeTeachers(m.lesson).filter(t=>!available129(t,date,day,m.to));
      if(bad.length) return {ok:false,reason:`${bad.join("・")}先生が${m.to}限は勤務不可です。`};
    }

    const positions=[],seen=new Set();
    state.classes.forEach(cls=>periods129(cls).forEach(p=>{
      const l=getDaily(cls,date,day,p);
      if(!l||moved.has(l.groupId))return;
      const key=l.groupId||`${cls}|${p}`;
      if(seen.has(key))return;
      seen.add(key);positions.push({p:+p,lesson:l});
    }));
    moves.forEach(m=>positions.push({p:+m.to,lesson:m.lesson}));

    const classMap=new Map(),teacherMap=new Map(),roomMap=new Map();
    for(const x of positions){
      const gid=x.lesson.groupId||uniqueId();
      for(const cls of lessonClasses129(x.lesson)){
        const k=`${cls}|${x.p}`,old=classMap.get(k);
        if(old&&old!==gid)return {ok:false,reason:`${cls}の${x.p}限が重複します。`};
        classMap.set(k,gid);
      }
      for(const t of activeTeachers(x.lesson)){
        const k=`${t}|${x.p}`,old=teacherMap.get(k);
        if(old&&old!==gid)return {ok:false,reason:`${t}先生が${x.p}限で重複します。`};
        teacherMap.set(k,gid);
      }
      for(const r of (x.lesson.rooms||[])){
        const k=`${r}|${x.p}`,old=roomMap.get(k);
        if(old&&old!==gid)return {ok:false,reason:`${r}が${x.p}限で重複します。`};
        roomMap.set(k,gid);
      }
    }
    return {ok:true};
  }

  function pushUndo129(desc){
    ensureManualUndo129();
    state.manualMoveUndo129.push({
      id:uniqueId(),ts:new Date().toISOString(),description:desc,
      daily:clone(state.daily),moveRecords:clone(state.moveRecords||[]),classSettings:clone(state.classSettings)
    });
    state.manualMoveUndo129=state.manualMoveUndo129.slice(-10);
  }

  function moveSelected129(delta){
    if(!selectionStillValid129()){selected129=null;refreshSelection129();return;}
    const {cls,date,day,p:from}=selected129;
    const a=lessonAt129(cls,date,day,from); if(!a)return;
    const to=from+delta;
    if(!periods129(cls).includes(to))return;
    const b=lessonAt129(cls,date,day,to);
    const moves=[{lesson:clone(a),from,to,cls}];
    if(b)moves.push({lesson:clone(b),from:to,to:from,cls});
    const check=validatePlan129(date,day,moves);
    const msg=$("#manualMoveMessage129");
    if(!check.ok){
      if(msg){msg.className="status warn manual-message129";msg.textContent=check.reason;}
      return;
    }
    const desc=b?`${date} ${cls} ${from}限↔${to}限 ${a.subject} / ${b.subject}`:`${date} ${cls} ${a.subject} ${from}限→${to}限`;
    pushUndo129(desc);
    moves.forEach(m=>removeDailyGroup(date,day,m.from,m.lesson));
    moves.forEach(m=>writeDailyGroup(date,day,m.to,m.lesson));
    state.moveRecords=Array.isArray(state.moveRecords)?state.moveRecords:[];
    moves.forEach(m=>state.moveRecords.push({
      id:uniqueId(),groupId:m.lesson.groupId,fromDate:date,fromDay:day,fromPeriod:+m.from,
      toDate:date,toDay:day,toPeriod:+m.to,participants:[...(m.lesson.participants||[])],
      subject:m.lesson.subject,ts:new Date().toISOString(),source:"セル選択手動移動"
    }));
    state.moveRecords=state.moveRecords.slice(-600);
    addHistory(b?"手動入れ替え":"手動移動",desc);
    selected129={cls,date,day,p:to,groupId:a.groupId||""};
    save();renderAll();
    setTimeout(()=>{
      refreshSelection129();
      const m=$("#manualMoveMessage129");
      if(m){m.className="status ok manual-message129";m.textContent=b?`${from}限と${to}限を入れ替えました。`:`${from}限から${to}限へ移動しました。`;}
    },0);
  }

  function undoManual129(){
    ensureManualUndo129();
    const snap=state.manualMoveUndo129.pop();
    if(!snap){refreshUndo129();return;}
    state.daily=clone(snap.daily||{});
    state.moveRecords=clone(snap.moveRecords||[]);
    state.classSettings=clone(snap.classSettings||{});
    addHistory("手動移動取消",snap.description||"直前の手動移動");
    selected129=null;
    save();renderAll();
    setTimeout(()=>{
      refreshSelection129();
      const m=$("#manualMoveMessage129");
      if(m){m.className="status ok manual-message129";m.textContent="直前の手動移動を元に戻しました。";}
    },0);
  }
  function refreshUndo129(){
    ensureManualUndo129();
    const b=$("#undoManualMove129");if(b)b.disabled=!state.manualMoveUndo129.length;
  }
  function editSelected129(){
    if(!selectionStillValid129())return;
    const s=selected129;
    openEditor(false,s.cls,s.date,s.day,s.p);
  }

  function bindTable129(){
    const table=$("#dailyTable");if(!table||table.dataset.manualSelect129==="1")return;
    table.dataset.manualSelect129="1";
    table.addEventListener("click",e=>{
      if(e.target.closest("button,a,input,select,label"))return;
      const td=e.target.closest("td.slot[data-class][data-date][data-day][data-period]");
      if(!td)return;
      const l=lessonAt129(td.dataset.class,td.dataset.date,td.dataset.day,+td.dataset.period);
      if(!l)return;
      e.preventDefault();e.stopPropagation();
      if(e.stopImmediatePropagation)e.stopImmediatePropagation();
      selectCell129(td);
    },true);
    table.addEventListener("dblclick",e=>{
      const td=e.target.closest("td.slot[data-class][data-date][data-day][data-period]");
      if(!td)return;
      const l=lessonAt129(td.dataset.class,td.dataset.date,td.dataset.day,+td.dataset.period);
      if(!l)return;
      e.preventDefault();e.stopPropagation();
      openEditor(false,td.dataset.class,td.dataset.date,td.dataset.day,+td.dataset.period);
    },true);
  }

  function removeOldArrows129(){
    document.querySelectorAll("#dailyTable .cell-arrow-controls128").forEach(x=>x.remove());
  }

  const prevRenderDaily129=renderDaily;
  renderDaily=function(){
    const r=prevRenderDaily129();
    ensureToolbar129();bindTable129();removeOldArrows129();
    setTimeout(()=>{bindTable129();removeOldArrows129();refreshSelection129();},0);
    return r;
  };
  const prevRenderAll129=renderAll;
  renderAll=function(){
    const r=prevRenderAll129();
    ensureToolbar129();bindTable129();removeOldArrows129();
    setTimeout(()=>{bindTable129();removeOldArrows129();refreshSelection129();},0);
    return r;
  };

  const style=document.createElement("style");
  style.textContent=`
    #dailyTable .cell-arrow-controls128{display:none!important}
    #dailyTable td.slot{padding-right:4px!important}
    .manual-move-toolbar129{padding:10px 14px;border-left:4px solid #2459d3}
    .manual-move-main129{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    .manual-selected129{display:flex;align-items:center;gap:10px;min-width:260px}
    .manual-move-actions129{display:flex;gap:7px;flex-wrap:wrap}
    .manual-message129{margin-top:8px!important;padding:8px 10px!important}
    #dailyTable td.manual-selected-cell129{outline:3px solid #2459d3!important;outline-offset:-3px!important;box-shadow:inset 0 0 0 2px #fff!important}
    @media(max-width:700px){.manual-move-actions129 button{flex:1 1 46%}.manual-selected129{width:100%}}
  `;
  document.head.appendChild(style);

  ensureManualUndo129();
  ensureToolbar129();
  bindTable129();
  removeOldArrows129();
  refreshSelection129();
})();
