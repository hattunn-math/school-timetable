(() => {
  function participants131(l){
    return (l?.participants||[]).filter(c=>state.classes.includes(c));
  }
  function selectedCell131(){
    return $("#dailyTable td.manual-selected-cell129[data-class][data-date][data-day][data-period]");
  }
  function lessonAt131(cls,date,day,p){
    return periodsForClass(cls).map(Number).includes(+p)?getDaily(cls,date,day,+p):null;
  }
  function fixedAt131(l,date,day,p){
    const classes=participants131(l);
    return (state.fixedSlots||[]).some(r=>r&&r.date===date&&r.day===day&&+r.period===+p&&(r.classes||[]).some(c=>classes.includes(c)));
  }
  function snapshot131(desc){
    state.manualMoveUndo129=Array.isArray(state.manualMoveUndo129)?state.manualMoveUndo129:[];
    state.manualMoveUndo129.push({
      id:uniqueId(),ts:new Date().toISOString(),description:desc,
      daily:clone(state.daily),moveRecords:clone(state.moveRecords||[]),classSettings:clone(state.classSettings)
    });
    state.manualMoveUndo129=state.manualMoveUndo129.slice(-10);
  }
  function uniqueTargetLessons131(date,day,p,classes,excludeGid){
    const map=new Map();
    classes.forEach(cls=>{
      if(!periodsForClass(cls).map(Number).includes(+p))return;
      const l=getDaily(cls,date,day,+p);
      if(!l||l.groupId===excludeGid)return;
      const gid=l.groupId||`${cls}|${p}|${l.subject}`;
      if(!map.has(gid))map.set(gid,l);
    });
    return [...map.values()];
  }
  function structuralCheck131(date,day,moves){
    const moved=new Set(moves.map(m=>m.lesson.groupId));
    const classMap=new Map(),seen=new Set();
    state.classes.forEach(cls=>periodsForClass(cls).forEach(p=>{
      const l=getDaily(cls,date,day,p);
      if(!l||moved.has(l.groupId))return;
      const gid=l.groupId||`${cls}|${p}|${l.subject}`;
      const key=`${gid}|${p}`;
      if(seen.has(key))return;
      seen.add(key);
      participants131(l).forEach(c=>classMap.set(`${c}|${p}`,gid));
    }));
    for(const m of moves){
      const gid=m.lesson.groupId||uniqueId();
      for(const cls of participants131(m.lesson)){
        if(!periodsForClass(cls).map(Number).includes(+m.to))return {ok:false,reason:`${cls}には${m.to}限がありません。`};
        const k=`${cls}|${m.to}`,old=classMap.get(k);
        if(old&&old!==gid)return {ok:false,reason:`${cls}の${m.to}限には移動対象外の授業があり、同じセルに2授業は保存できません。`};
        classMap.set(k,gid);
      }
    }
    return {ok:true};
  }
  function ensureDirectSwapUi131(){
    const actions=$("#manualMoveToolbar129 .manual-move-actions129");
    if(!actions)return;
    let wrap=$("#directSwapWrap131");
    if(!wrap){
      wrap=document.createElement("div");
      wrap.id="directSwapWrap131";
      wrap.className="direct-swap-wrap131";
      wrap.innerHTML=`<label class="direct-swap-label131">移動先<select id="directSwapPeriod131"></select></label><button id="directSwapBtn131" type="button" class="primary">指定校時と入れ替え</button>`;
      const clear=$("#clearSelected129");
      if(clear)actions.insertBefore(wrap,clear);else actions.appendChild(wrap);
      $("#directSwapBtn131").onclick=directSwap131;
    }
    const sel=$("#directSwapPeriod131");
    if(sel){
      const old=sel.value;
      const ps=allPeriodsForSchool().map(Number);
      sel.innerHTML=ps.map(p=>`<option value="${p}">${p}限</option>`).join("");
      if(ps.map(String).includes(old))sel.value=old;
    }
  }
  function directSwap131(){
    const td=selectedCell131(),msg=$("#manualMoveMessage129");
    if(!td){
      if(msg){msg.className="status warn manual-message129";msg.textContent="先に移動したい授業セルを選択してください。";}
      return;
    }
    const cls=td.dataset.class,date=td.dataset.date,day=td.dataset.day,from=+td.dataset.period,to=+($("#directSwapPeriod131")?.value||NaN);
    if(!Number.isFinite(to))return;
    if(from===to){
      if(msg){msg.className="status warn manual-message129";msg.textContent="現在とは別の校時を選択してください。";}
      return;
    }
    const root=lessonAt131(cls,date,day,from);
    if(!root)return;
    const rootClasses=participants131(root);
    if(!rootClasses.length)return;
    if(!rootClasses.every(c=>periodsForClass(c).map(Number).includes(to))){
      if(msg){msg.className="status warn manual-message129";msg.textContent="参加クラスの中に指定校時を持たないクラスがあります。";}
      return;
    }
    const targets=uniqueTargetLessons131(date,day,to,rootClasses,root.groupId);
    const moves=[{lesson:clone(root),from,to},...targets.map(l=>({lesson:clone(l),from:to,to:from}))];

    for(const m of moves){
      if(fixedAt131(m.lesson,date,day,m.from)||fixedAt131(m.lesson,date,day,m.to)){
        if(msg){msg.className="status warn manual-message129";msg.textContent="時間固定されている授業が含まれるため入れ替えできません。固定を解除してから操作してください。";}
        return;
      }
    }
    const structure=structuralCheck131(date,day,moves);
    if(!structure.ok){
      if(msg){msg.className="status warn manual-message129";msg.textContent=structure.reason;}
      return;
    }

    const targetText=targets.length?targets.map(l=>`${participantsText(l)} ${l.subject}`).join(" / "):"空き";
    const desc=`${date} ${participantsText(root)} ${root.subject} ${from}限↔${to}限（相手：${targetText}）`;
    snapshot131(desc);
    moves.forEach(m=>removeDailyGroup(date,day,m.from,m.lesson));
    moves.forEach(m=>writeDailyGroup(date,day,m.to,m.lesson));
    state.moveRecords=Array.isArray(state.moveRecords)?state.moveRecords:[];
    moves.forEach(m=>state.moveRecords.push({
      id:uniqueId(),groupId:m.lesson.groupId,fromDate:date,fromDay:day,fromPeriod:+m.from,
      toDate:date,toDay:day,toPeriod:+m.to,participants:[...(m.lesson.participants||[])],
      subject:m.lesson.subject,ts:new Date().toISOString(),source:"指定校時直接入れ替え"
    }));
    state.moveRecords=state.moveRecords.slice(-600);
    addHistory(targets.length?"指定校時入れ替え":"指定校時移動",desc);
    save();renderAll();
    setTimeout(()=>{
      const target=[...document.querySelectorAll('#dailyTable td.slot[data-class][data-date][data-day][data-period]')].find(x=>x.dataset.class===cls&&x.dataset.date===date&&x.dataset.day===day&&+x.dataset.period===to);
      if(target)target.click();
      if(typeof window.decorateWarnings130==="function")window.decorateWarnings130();
      const m=$("#manualMoveMessage129");
      if(m){
        const warning=[...document.querySelectorAll('#dailyTable td.manual-warning-cell130')].some(x=>x.dataset.date===date&&(participants131(root).includes(x.dataset.class)||targets.some(t=>participants131(t).includes(x.dataset.class))));
        m.className=`status ${warning?"warn":"ok"} manual-message129`;
        m.textContent=warning?`${from}限と${to}限を直接入れ替えました。赤いセルの警告を確認してください。`:`${from}限と${to}限を直接入れ替えました。`;
      }
    },0);
  }

  function refreshDirect131(){
    ensureDirectSwapUi131();
    const td=selectedCell131(),btn=$("#directSwapBtn131"),sel=$("#directSwapPeriod131");
    if(btn)btn.disabled=!td;
    if(sel&&td){
      const from=+td.dataset.period;
      [...sel.options].forEach(o=>o.disabled=+o.value===from);
      if(+sel.value===from){
        const alt=[...sel.options].find(o=>!o.disabled);
        if(alt)sel.value=alt.value;
      }
    }
  }
  const prevDaily131=renderDaily;
  renderDaily=function(){const r=prevDaily131();setTimeout(refreshDirect131,0);return r;};
  const prevAll131=renderAll;
  renderAll=function(){const r=prevAll131();setTimeout(refreshDirect131,0);return r;};
  const table=$("#dailyTable");
  if(table&&!table.dataset.directSwap131){
    table.dataset.directSwap131="1";
    table.addEventListener("click",()=>setTimeout(refreshDirect131,0));
  }
  const style=document.createElement("style");
  style.textContent=`
    .direct-swap-wrap131{display:flex;align-items:end;gap:6px;padding:4px 7px;border:1px solid var(--line);border-radius:8px;background:#f7f9fc}
    .direct-swap-label131{margin:0;display:flex;align-items:center;gap:6px;white-space:nowrap}
    .direct-swap-label131 select{padding:7px 8px;min-width:72px}
    #directSwapBtn131{white-space:nowrap}
    @media(max-width:700px){.direct-swap-wrap131{width:100%;flex-wrap:wrap}.direct-swap-label131{flex:1}.direct-swap-label131 select{flex:1}#directSwapBtn131{flex:1 1 100%}}
  `;
  document.head.appendChild(style);
  setTimeout(refreshDirect131,0);
})();
