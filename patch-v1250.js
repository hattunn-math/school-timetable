(() => {
  let progressiveCandidates125=[];
  const MAX_SEARCH_MS125=3000;
  const MAX_NODES125=60000;
  const MAX_RESULTS125=80;

  function conditions125(date){
    return (state.structuredConditions||[]).filter(c=>c&&c.enabled!==false&&c.date===date);
  }
  function fixed125(classes,date,day,p){
    return (state.fixedSlots||[]).some(r=>r&&r.date===date&&r.day===day&&+r.period===+p&&(r.classes||[]).some(c=>classes.includes(c)));
  }
  function available125(name,date,day,p){
    return typeof window.teacherAvailableOnDate==="function"?window.teacherAvailableOnDate(name,date,day,p):teacherAvailable(name,day,p);
  }
  function hardBlocked125(lesson,date,p){
    return conditions125(date).some(c=>{
      if(!(c.periods||[]).map(Number).includes(+p))return false;
      if(c.condition==="不在")return (lesson.teachers||[]).includes(c.target);
      if(c.condition==="使用不可")return (lesson.rooms||[]).includes(c.target);
      return false;
    });
  }
  function singleClass125(l){
    const ps=(l?.participants||[]).filter(c=>state.classes.includes(c));
    return ps.length===1?ps[0]:"";
  }
  function affected125(date){
    const day=dayNameForDate(date),out=[],seen=new Set();
    if(!day)return out;
    conditions125(date).filter(c=>c.condition==="不在"||c.condition==="使用不可").forEach(c=>{
      (c.periods||[]).map(Number).forEach(p=>state.classes.forEach(cls=>{
        if(!periodsForClass(cls).includes(p))return;
        const l=getDaily(cls,date,day,p);if(!l)return;
        const hit=c.condition==="不在"?(l.teachers||[]).includes(c.target):(l.rooms||[]).includes(c.target);
        if(!hit)return;
        const key=`${date}|${p}|${l.groupId}`;if(seen.has(key))return;seen.add(key);
        out.push({date,day,p:+p,lesson:l,condition:c});
      }));
    });
    return out;
  }
  function lessonByGroup125(date,day,gid,cls){
    for(const p of periodsForClass(cls)){
      const l=getDaily(cls,date,day,p);if(l?.groupId===gid)return {lesson:l,p:+p};
    }
    return null;
  }
  function planKey125(plan){return plan.map(m=>`${m.groupId}:${m.from}>${m.to}`).sort().join("|");}

  function validate125(date,day,plan){
    if(!plan.length)return {ok:false,reason:"変更なし"};
    const groups=new Set(plan.map(m=>m.groupId)),lessonMap=new Map();
    for(const m of plan){
      const f=lessonByGroup125(date,day,m.groupId,m.cls);if(!f)return {ok:false,reason:"授業が見つかりません"};
      if(+f.p!==+m.from)return {ok:false,reason:"時間割が変更されています"};
      const l=f.lesson,cls=singleClass125(l);if(!cls||cls!==m.cls)return {ok:false,reason:"合同授業は対象外"};
      if(!periodsForClass(cls).includes(+m.to))return {ok:false,reason:"校時外"};
      if(fixed125([cls],date,day,m.from)||fixed125([cls],date,day,m.to))return {ok:false,reason:"時間固定"};
      if(hardBlocked125(l,date,m.to))return {ok:false,reason:"変更条件に抵触"};
      const bad=activeTeachers(l).filter(t=>!available125(t,date,day,m.to));if(bad.length)return {ok:false,reason:`${bad.join("・")}先生が勤務時間外`};
      lessonMap.set(m.groupId,l);
    }
    const positions=[],seen=new Set();
    state.classes.forEach(cls=>periodsForClass(cls).forEach(p=>{
      const l=getDaily(cls,date,day,p);if(!l||groups.has(l.groupId))return;
      const k=l.groupId||`${cls}-${p}`;if(seen.has(k))return;seen.add(k);positions.push({p:+p,lesson:l});
    }));
    plan.forEach(m=>positions.push({p:+m.to,lesson:lessonMap.get(m.groupId)}));
    const classMap=new Map(),teacherMap=new Map(),roomMap=new Map();
    for(const x of positions){
      const gid=x.lesson.groupId;
      for(const cls of (x.lesson.participants||[]).filter(c=>state.classes.includes(c))){
        const k=`${cls}|${x.p}`;if(classMap.has(k)&&classMap.get(k)!==gid)return {ok:false,reason:`${cls} ${x.p}限が重複`};classMap.set(k,gid);
      }
      for(const t of activeTeachers(x.lesson)){
        if(!available125(t,date,day,x.p))return {ok:false,reason:`${t}先生が${x.p}限勤務時間外`};
        const k=`${t}|${x.p}`;if(teacherMap.has(k)&&teacherMap.get(k)!==gid)return {ok:false,reason:`${t}先生が${x.p}限で重複`};teacherMap.set(k,gid);
      }
      for(const r of (x.lesson.rooms||[])){
        const k=`${r}|${x.p}`;if(roomMap.has(k)&&roomMap.get(k)!==gid)return {ok:false,reason:`${r}が${x.p}限で重複`};roomMap.set(k,gid);
      }
    }
    return {ok:true};
  }

  function buildForRoot125(root,deadline,counter){
    const cls=singleClass125(root.lesson);if(!cls)return [];
    const periods=periodsForClass(cls).map(Number),schedule=new Map();
    periods.forEach(p=>{const l=getDaily(cls,root.date,root.day,p);if(l)schedule.set(p,l);});
    const src=+root.p,results=[],seenPlans=new Set();

    function addPlan(plan){
      const k=planKey125(plan);if(seenPlans.has(k))return;seenPlans.add(k);
      const v=validate125(root.date,root.day,plan);if(!v.ok)return;
      results.push({id:`progressive|${root.date}|${k}`,date:root.date,day:root.day,kind:"progressive",rootClass:cls,rootSubject:root.lesson.subject,reason:`${root.condition.target} ${root.condition.condition}`,moves:plan.map(x=>({...x})),steps:plan.length});
    }

    function dfs(currentGroup,currentFrom,plan,usedGroups,usedTargets){
      if(performance.now()>deadline||counter.n>=MAX_NODES125||results.length>=MAX_RESULTS125)return;
      counter.n++;
      const found=lessonByGroup125(root.date,root.day,currentGroup,cls);if(!found)return;
      for(const to of periods){
        if(to===currentFrom||usedTargets.has(to))continue;
        const nextPlan=[...plan,{groupId:currentGroup,cls,subject:found.lesson.subject,from:+currentFrom,to:+to}];
        const occupant=schedule.get(to);
        if(!occupant||usedGroups.has(occupant.groupId)){
          addPlan(nextPlan);
          continue;
        }
        if(singleClass125(occupant)!==cls)continue;
        if(usedGroups.has(occupant.groupId))continue;
        const nextUsedGroups=new Set(usedGroups);nextUsedGroups.add(occupant.groupId);
        const nextTargets=new Set(usedTargets);nextTargets.add(to);
        dfs(occupant.groupId,to,nextPlan,nextUsedGroups,nextTargets);
      }
    }

    dfs(root.lesson.groupId,src,[],new Set([root.lesson.groupId]),new Set());
    return results;
  }

  function buildProgressive125(date){
    const start=performance.now(),deadline=start+MAX_SEARCH_MS125,counter={n:0},all=[];
    const roots=affected125(date);
    for(const root of roots){
      if(performance.now()>deadline||counter.n>=MAX_NODES125)break;
      all.push(...buildForRoot125(root,deadline,counter));
    }
    const seen=new Set();
    progressiveCandidates125=all.filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;}).sort((a,b)=>a.steps-b.steps||a.rootClass.localeCompare(b.rootClass,"ja")).slice(0,MAX_RESULTS125);
    return {roots,candidates:progressiveCandidates125,nodes:counter.n,elapsed:Math.round(performance.now()-start),limited:performance.now()>deadline||counter.n>=MAX_NODES125};
  }

  function ensureProgressiveUi125(){
    const card=$("#moveProposalCard");if(!card)return;
    const btn=$("#createComplexProposalsBtn");
    if(btn&&btn.dataset.progressive125!=="1"){
      btn.dataset.progressive125="1";btn.textContent="複合候補を深く探索";btn.onclick=createProgressiveUi125;
    }
    let box=$("#progressiveProposalBox");
    if(!box){box=document.createElement("div");box.id="progressiveProposalBox";box.className="complex-proposal-box";const old=$("#complexProposalBox")||$("#conditionalMoveSuggestions")||$("#moveProposalStatus");old?.insertAdjacentElement("afterend",box);}
    const oldBox=$("#complexProposalBox");if(oldBox)oldBox.style.display="none";
  }
  function createProgressiveUi125(){
    const date=$("#proposalTargetDate")?.value||currentDate(),box=$("#progressiveProposalBox");if(!box)return;
    if(!date||!dayNameForDate(date)){box.innerHTML=`<div class="status warn">月〜金の日付を選択してください。</div>`;return;}
    box.innerHTML=`<div class="status ok">複合変更を探索しています…</div>`;
    setTimeout(()=>{
      const r=buildProgressive125(date);
      if(!r.roots.length){box.innerHTML=`<div class="status warn">${esc(date)} に複合移動を検討する不在・使用不可の授業がありません。</div>`;return;}
      if(!r.candidates.length){
        const joint=r.roots.filter(x=>!singleClass125(x.lesson)).length;
        box.innerHTML=`<div class="status warn">動かせる授業が尽きるところまで探索しましたが、安全な複合変更候補は見つかりませんでした。</div><div class="small muted">探索 ${r.nodes}件 / ${r.elapsed}ms${r.limited?"（安全上限で停止）":""}</div>${joint?`<div class="small muted">合同授業 ${joint}件は複数クラスへ影響するため、この探索では対象外です。</div>`:""}`;return;
      }
      box.innerHTML=`<div class="complex-title"><div><strong>複合変更候補 ${r.candidates.length}件</strong><div class="small muted">1手から順に深く探索し、成立する案を手数の少ない順に表示しています。探索 ${r.nodes}件 / ${r.elapsed}ms${r.limited?"（安全上限で停止）":""}</div></div></div><div class="complex-list">${r.candidates.map(c=>`<div class="complex-item"><div class="complex-item-head"><strong>${c.steps}手｜${esc(c.rootClass)} ${esc(c.rootSubject)}</strong><span class="small muted">理由：${esc(c.reason)}</span></div><div class="complex-steps">${c.moves.map((m,i)=>`<div><span class="step-no">${i+1}</span>${esc(m.subject)}：${m.from}限 → ${m.to}限</div>`).join("")}</div><button type="button" class="primary apply-progressive125" data-id="${esc(c.id)}">この組み合わせをまとめて反映</button></div>`).join("")}</div>`;
      box.querySelectorAll(".apply-progressive125").forEach(b=>b.onclick=()=>applyProgressive125(b.dataset.id));
    },20);
  }
  function applyProgressive125(id){
    const c=progressiveCandidates125.find(x=>x.id===id);if(!c)return;
    const v=validate125(c.date,c.day,c.moves);if(!v.ok){alert(`現在はこの候補を反映できません：${v.reason}\n候補を作り直してください。`);return;}
    const desc=c.moves.map(m=>`${m.subject} ${m.from}→${m.to}`).join(" / ");
    if(!confirm(`${c.date} の${c.moves.length}手の複合変更をまとめて反映しますか？\n\n${desc}`))return;
    state.proposalUndoStack=Array.isArray(state.proposalUndoStack)?state.proposalUndoStack:[];
    state.proposalUndoStack.push({id:uniqueId(),ts:new Date().toISOString(),description:`${c.date} 複合変更：${desc}`,daily:clone(state.daily),moveRecords:clone(state.moveRecords||[]),classSettings:clone(state.classSettings)});
    state.proposalUndoStack=state.proposalUndoStack.slice(-5);
    const payload=[];
    for(const m of c.moves){const f=lessonByGroup125(c.date,c.day,m.groupId,m.cls);if(!f)return;payload.push({move:m,lesson:clone(f.lesson)});}
    payload.forEach(x=>removeDailyGroup(c.date,c.day,x.move.from,x.lesson));
    payload.forEach(x=>writeDailyGroup(c.date,c.day,x.move.to,x.lesson));
    state.moveRecords=Array.isArray(state.moveRecords)?state.moveRecords:[];
    payload.forEach(x=>state.moveRecords.push({id:uniqueId(),groupId:x.lesson.groupId,fromDate:c.date,fromDay:c.day,fromPeriod:+x.move.from,toDate:c.date,toDay:c.day,toPeriod:+x.move.to,participants:[...(x.lesson.participants||[])],subject:x.lesson.subject,ts:new Date().toISOString(),source:"段階的複合変更候補"}));
    state.moveRecords=state.moveRecords.slice(-600);
    addHistory("複合変更反映",`${c.date} ${desc}`);save();renderAll();
    const d=$("#proposalTargetDate");if(d)d.value=c.date;
    setTimeout(()=>{ensureProgressiveUi125();const box=$("#progressiveProposalBox");if(box)box.innerHTML=`<div class="status ok">${c.moves.length}手の複合変更をまとめて反映しました。「直前の候補反映を取り消す」でセット全体を元に戻せます。</div>`;},0);
  }

  function absentConditionForCell125(td){
    const date=td.dataset.date,day=td.dataset.day,p=+td.dataset.period,cls=td.dataset.class;if(!date||!day||!cls)return [];
    const l=getDaily(cls,date,day,p);if(!l)return [];
    return conditions125(date).filter(c=>c.targetType==="teacher"&&c.condition==="不在"&&(c.periods||[]).map(Number).includes(p)&&(l.teachers||[]).includes(c.target));
  }
  function decorateAbsentDaily125(){
    const table=$("#dailyTable");if(!table)return;
    table.querySelectorAll("td.slot").forEach(td=>{
      const hits=absentConditionForCell125(td);td.classList.toggle("absence-condition-cell",hits.length>0);
      if(hits.length)td.title=`不在条件：${hits.map(c=>c.target).join("・")}先生`;
    });
  }
  function updateHelp125(){
    const p=$("#moveProposalCard")?.querySelector("p.muted");if(p)p.textContent="1日ずつ、通常候補・条件付き候補に加えて、必要なら複数授業を連鎖的に動かす複合候補を深く探索します。手数は固定せず、成立するまで段階的に広げます。";
  }
  const prevRenderAll125=renderAll;
  renderAll=function(){prevRenderAll125();ensureProgressiveUi125();decorateAbsentDaily125();updateHelp125();};
  const prevRenderDaily125=renderDaily;
  renderDaily=function(){const r=prevRenderDaily125();decorateAbsentDaily125();return r;};

  const style=document.createElement("style");
  style.textContent=`
    #dailyTable td.absence-condition-cell .cell-line{color:#b42318!important;font-weight:700}
    #dailyTable td.absence-condition-cell{box-shadow:inset 0 0 0 2px rgba(180,35,24,.28)}
  `;
  document.head.appendChild(style);
  ensureProgressiveUi125();decorateAbsentDaily125();updateHelp125();
})();