(() => {
  let priorityCandidates126=[];
  const MAX_MS126=3000;
  const MAX_NODES126=60000;
  const MAX_RESULTS126=60;

  function ensurePriorityState126(){
    if(!Array.isArray(state.priorityMoves)) state.priorityMoves=[];
  }
  function priorityForGroup126(date,gid){
    ensurePriorityState126();
    return state.priorityMoves.find(x=>x&&x.date===date&&x.groupId===gid)||null;
  }
  function upsertPriority126(rec){
    ensurePriorityState126();
    state.priorityMoves=state.priorityMoves.filter(x=>!(x&&x.date===rec.date&&x.groupId===rec.groupId));
    if(rec.priority!=="auto") state.priorityMoves.push(rec);
    state.priorityMoves=state.priorityMoves.slice(-300);
  }
  function currentEditingLesson126(){
    if(!editing||editing.isBase)return null;
    return getDaily(editing.cls,editing.date,editing.day,editing.p);
  }

  function installPriorityEditor126(){
    const form=$("#lessonForm"); if(!form)return;
    let box=$("#priorityMoveEditor126");
    if(!box){
      box=document.createElement("div");
      box.id="priorityMoveEditor126";
      box.className="priority-move-editor126";
      const body=form.querySelector(".dialog-body");
      if(body) body.appendChild(box);
    }
    if(editing?.isBase){box.style.display="none";return;}
    const l=currentEditingLesson126();
    if(!l){box.style.display="none";return;}
    box.style.display="block";
    const old=priorityForGroup126(editing.date,l.groupId);
    const priority=old?.priority||"auto";
    const target=old?.targetPeriod??editing.p;
    const periods=periodsForClass(editing.cls).map(Number);
    box.innerHTML=`<div class="priority-move-title"><strong>変更優先度</strong><span class="small muted">この授業をどこへ動かしたいかを探索エンジンに指定します。</span></div>
      <div class="priority-move-row">
        <label>優先度<select id="priorityMoveKind126"><option value="auto" ${priority==="auto"?"selected":""}>おまかせ</option><option value="prefer" ${priority==="prefer"?"selected":""}>優先変更</option><option value="must" ${priority==="must"?"selected":""}>必須変更</option></select></label>
        <label>希望校時<select id="priorityMoveTarget126">${periods.map(p=>`<option value="${p}" ${+p===+target?"selected":""}>${p}限</option>`).join("")}</select></label>
        <button type="button" class="sub" id="savePriorityMove126">優先指定を保存</button>
      </div>
      <div class="small muted" id="priorityMoveNote126">${priority==="must"?"必須：指定校時への移動を成立させるため、周囲の授業を連鎖的に動かします。":priority==="prefer"?"優先：指定校時への移動案を優先して探します。":"おまかせ：通常の変更条件を解消することを優先します。"}</div>`;
    const kind=$("#priorityMoveKind126"),targetSel=$("#priorityMoveTarget126"),note=$("#priorityMoveNote126");
    function refresh(){
      targetSel.disabled=kind.value==="auto";
      note.textContent=kind.value==="must"?"必須：指定校時への移動を成立させるため、周囲の授業を連鎖的に動かします。":kind.value==="prefer"?"優先：指定校時への移動案を優先して探します。":"おまかせ：通常の変更条件を解消することを優先します。";
    }
    kind.onchange=refresh; refresh();
    $("#savePriorityMove126").onclick=()=>{
      const now=currentEditingLesson126(); if(!now)return;
      const pr=kind.value,tp=+targetSel.value;
      if(pr!=="auto"&&tp===+editing.p){alert("移動先は現在とは別の校時を選んでください。");return;}
      upsertPriority126({id:old?.id||uniqueId(),date:editing.date,day:editing.day,groupId:now.groupId,cls:editing.cls,sourcePeriod:+editing.p,subject:now.subject,priority:pr,targetPeriod:tp,ts:new Date().toISOString()});
      addHistory("変更優先度",`${editing.date} ${editing.cls} ${now.subject}：${pr==="must"?"必須":pr==="prefer"?"優先":"おまかせ"}${pr!=="auto"?` ${editing.p}限→${tp}限`:""}`);
      save(); decoratePriorityCells126();
      alert(pr==="auto"?"優先指定を解除しました。":"優先指定を保存しました。");
    };
  }

  const prevOpenEditor126=openEditor;
  openEditor=function(isBase,cls,date,day,p){
    const r=prevOpenEditor126(isBase,cls,date,day,p);
    setTimeout(installPriorityEditor126,0);
    return r;
  };

  function conditions126(date){return (state.structuredConditions||[]).filter(c=>c&&c.enabled!==false&&c.date===date);}
  function fixed126(cls,date,day,p){return (state.fixedSlots||[]).some(r=>r&&r.date===date&&r.day===day&&+r.period===+p&&(r.classes||[]).includes(cls));}
  function available126(name,date,day,p){return typeof window.teacherAvailableOnDate==="function"?window.teacherAvailableOnDate(name,date,day,p):teacherAvailable(name,day,p);}
  function hardBlocked126(l,date,p){
    return conditions126(date).some(c=>{
      if(!(c.periods||[]).map(Number).includes(+p))return false;
      if(c.condition==="不在")return (l.teachers||[]).includes(c.target);
      if(c.condition==="使用不可")return (l.rooms||[]).includes(c.target);
      return false;
    });
  }
  function singleClass126(l){const ps=(l?.participants||[]).filter(c=>state.classes.includes(c));return ps.length===1?ps[0]:"";}
  function lessonByGroup126(date,day,gid,cls){for(const p of periodsForClass(cls)){const l=getDaily(cls,date,day,p);if(l?.groupId===gid)return {lesson:l,p:+p};}return null;}
  function planKey126(plan){return plan.map(m=>`${m.groupId}:${m.from}>${m.to}`).sort().join("|");}

  function validate126(date,day,plan){
    if(!plan.length)return {ok:false,reason:"変更なし"};
    const groups=new Set(plan.map(m=>m.groupId)),lessonMap=new Map();
    for(const m of plan){
      const f=lessonByGroup126(date,day,m.groupId,m.cls);if(!f)return {ok:false,reason:"授業が見つかりません"};
      if(+f.p!==+m.from)return {ok:false,reason:"時間割が変更されています"};
      const l=f.lesson,cls=singleClass126(l);if(!cls||cls!==m.cls)return {ok:false,reason:"合同授業は対象外"};
      if(!periodsForClass(cls).includes(+m.to))return {ok:false,reason:"校時外"};
      if(fixed126(cls,date,day,m.from)||fixed126(cls,date,day,m.to))return {ok:false,reason:"時間固定"};
      if(hardBlocked126(l,date,m.to))return {ok:false,reason:"変更条件に抵触"};
      const bad=activeTeachers(l).filter(t=>!available126(t,date,day,m.to));if(bad.length)return {ok:false,reason:`${bad.join("・")}先生が勤務時間外`};
      lessonMap.set(m.groupId,l);
    }
    const positions=[],seen=new Set();
    state.classes.forEach(cls=>periodsForClass(cls).forEach(p=>{const l=getDaily(cls,date,day,p);if(!l||groups.has(l.groupId))return;const k=l.groupId||`${cls}-${p}`;if(seen.has(k))return;seen.add(k);positions.push({p:+p,lesson:l});}));
    plan.forEach(m=>positions.push({p:+m.to,lesson:lessonMap.get(m.groupId)}));
    const classMap=new Map(),teacherMap=new Map(),roomMap=new Map();
    for(const x of positions){
      const gid=x.lesson.groupId;
      for(const cls of (x.lesson.participants||[]).filter(c=>state.classes.includes(c))){const k=`${cls}|${x.p}`;if(classMap.has(k)&&classMap.get(k)!==gid)return {ok:false,reason:`${cls} ${x.p}限が重複`};classMap.set(k,gid);}
      for(const t of activeTeachers(x.lesson)){if(!available126(t,date,day,x.p))return {ok:false,reason:`${t}先生が${x.p}限勤務時間外`};const k=`${t}|${x.p}`;if(teacherMap.has(k)&&teacherMap.get(k)!==gid)return {ok:false,reason:`${t}先生が${x.p}限で重複`};teacherMap.set(k,gid);}
      for(const r of (x.lesson.rooms||[])){const k=`${r}|${x.p}`;if(roomMap.has(k)&&roomMap.get(k)!==gid)return {ok:false,reason:`${r}が${x.p}限で重複`};roomMap.set(k,gid);}
    }
    return {ok:true};
  }

  function buildPriorityRoot126(pref,deadline,counter){
    const date=pref.date,day=dayNameForDate(date),found=lessonByGroup126(date,day,pref.groupId,pref.cls);if(!day||!found)return [];
    const root=found.lesson,cls=singleClass126(root);if(!cls||cls!==pref.cls)return [];
    const src=+found.p,target=+pref.targetPeriod,periods=periodsForClass(cls).map(Number);
    if(src===target||!periods.includes(target))return [];
    const schedule=new Map();periods.forEach(p=>{const l=getDaily(cls,date,day,p);if(l)schedule.set(p,l);});
    const results=[],seenPlans=new Set();
    const rootMove={groupId:root.groupId,cls,subject:root.subject,from:src,to:target};
    const targetOcc=schedule.get(target);
    function add(plan){const k=planKey126(plan);if(seenPlans.has(k))return;seenPlans.add(k);const v=validate126(date,day,plan);if(!v.ok)return;results.push({id:`priority|${date}|${pref.id}|${k}`,date,day,pref,rootClass:cls,rootSubject:root.subject,moves:plan.map(x=>({...x})),steps:plan.length});}
    if(!targetOcc){add([rootMove]);return results;}
    if(singleClass126(targetOcc)!==cls)return [];
    function dfs(gid,from,plan,usedGroups,usedTargets){
      if(performance.now()>deadline||counter.n>=MAX_NODES126||results.length>=MAX_RESULTS126)return;
      counter.n++;
      const f=lessonByGroup126(date,day,gid,cls);if(!f)return;
      for(const to of periods){
        if(to===from||usedTargets.has(to)||to===target)continue;
        const next=[...plan,{groupId:gid,cls,subject:f.lesson.subject,from:+from,to:+to}];
        const occ=schedule.get(to);
        if(!occ||usedGroups.has(occ.groupId)){add(next);continue;}
        if(singleClass126(occ)!==cls||usedGroups.has(occ.groupId))continue;
        const ug=new Set(usedGroups);ug.add(occ.groupId);const ut=new Set(usedTargets);ut.add(to);
        dfs(occ.groupId,to,next,ug,ut);
      }
    }
    dfs(targetOcc.groupId,target,[rootMove],new Set([root.groupId,targetOcc.groupId]),new Set([target]));
    return results;
  }

  function buildPriority126(date){
    ensurePriorityState126();
    const prefs=state.priorityMoves.filter(x=>x&&x.date===date&&(x.priority==="must"||x.priority==="prefer"));
    const start=performance.now(),deadline=start+MAX_MS126,counter={n:0},all=[];
    const ordered=[...prefs].sort((a,b)=>(a.priority==="must"?0:1)-(b.priority==="must"?0:1));
    for(const p of ordered){if(performance.now()>deadline||counter.n>=MAX_NODES126)break;all.push(...buildPriorityRoot126(p,deadline,counter));}
    const seen=new Set();
    priorityCandidates126=all.filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;}).sort((a,b)=>(a.pref.priority==="must"?0:1)-(b.pref.priority==="must"?0:1)||a.steps-b.steps).slice(0,MAX_RESULTS126);
    return {prefs,candidates:priorityCandidates126,nodes:counter.n,elapsed:Math.round(performance.now()-start),limited:performance.now()>deadline||counter.n>=MAX_NODES126};
  }

  function ensurePriorityProposalUi126(){
    const card=$("#moveProposalCard");if(!card)return;
    let box=$("#priorityProposalBox126");
    if(!box){box=document.createElement("div");box.id="priorityProposalBox126";box.className="priority-proposal-box126";const anchor=$("#progressiveProposalBox")||$("#complexProposalBox")||$("#moveProposalStatus");anchor?.insertAdjacentElement("afterend",box);}
    const btn=$("#createComplexProposalsBtn");
    if(btn&&btn.dataset.priority126!=="1"){
      const old=btn.onclick;btn.dataset.priority126="1";
      btn.onclick=function(e){
        const date=$("#proposalTargetDate")?.value||currentDate();ensurePriorityState126();
        const prefs=state.priorityMoves.filter(x=>x&&x.date===date&&(x.priority==="must"||x.priority==="prefer"));
        if(!prefs.length)return typeof old==="function"?old.call(this,e):undefined;
        renderPriorityProposals126(date);return undefined;
      };
    }
  }
  function renderPriorityProposals126(date){
    const box=$("#priorityProposalBox126");if(!box)return;
    box.innerHTML=`<div class="status ok">優先変更を最優先で探索しています…</div>`;
    setTimeout(()=>{
      const r=buildPriority126(date);
      if(!r.prefs.length){box.innerHTML="";return;}
      if(!r.candidates.length){
        box.innerHTML=`<div class="status warn">指定した優先変更を成立させる安全な組み合わせが見つかりませんでした。</div><div class="small muted">探索 ${r.nodes}件 / ${r.elapsed}ms${r.limited?"（安全上限で停止）":""}。勤務時間・固定・合同授業・教室・他の変更条件などが原因の可能性があります。</div>`;return;
      }
      box.innerHTML=`<div class="priority-proposal-title126"><strong>優先変更から作成した候補 ${r.candidates.length}件</strong><div class="small muted">必須変更を最優先、その次に優先変更、同じ優先度では手数の少ない順です。探索 ${r.nodes}件 / ${r.elapsed}ms${r.limited?"（安全上限で停止）":""}</div></div>`+r.candidates.map(c=>`<div class="complex-item priority-candidate126"><div class="complex-item-head"><strong>${c.pref.priority==="must"?"必須":"優先"}｜${esc(c.rootClass)} ${esc(c.rootSubject)} ${c.moves[0].from}限→${c.pref.targetPeriod}限</strong><span class="small muted">${c.steps}手</span></div><div class="complex-steps">${c.moves.map((m,i)=>`<div><span class="step-no">${i+1}</span>${esc(m.subject)}：${m.from}限 → ${m.to}限</div>`).join("")}</div><button type="button" class="primary apply-priority126" data-id="${esc(c.id)}">この優先変更をまとめて反映</button></div>`).join("");
      box.querySelectorAll(".apply-priority126").forEach(b=>b.onclick=()=>applyPriority126(b.dataset.id));
    },20);
  }
  function applyPriority126(id){
    const c=priorityCandidates126.find(x=>x.id===id);if(!c)return;
    const v=validate126(c.date,c.day,c.moves);if(!v.ok){alert(`現在は反映できません：${v.reason}\n候補を作り直してください。`);return;}
    const desc=c.moves.map(m=>`${m.subject} ${m.from}→${m.to}`).join(" / ");
    if(!confirm(`${c.date} の優先変更をまとめて反映しますか？\n\n${desc}`))return;
    state.proposalUndoStack=Array.isArray(state.proposalUndoStack)?state.proposalUndoStack:[];
    state.proposalUndoStack.push({id:uniqueId(),ts:new Date().toISOString(),description:`${c.date} 優先変更：${desc}`,daily:clone(state.daily),moveRecords:clone(state.moveRecords||[]),classSettings:clone(state.classSettings),priorityMoves:clone(state.priorityMoves||[])});
    state.proposalUndoStack=state.proposalUndoStack.slice(-5);
    const payload=[];for(const m of c.moves){const f=lessonByGroup126(c.date,c.day,m.groupId,m.cls);if(!f)return;payload.push({move:m,lesson:clone(f.lesson)});}
    payload.forEach(x=>removeDailyGroup(c.date,c.day,x.move.from,x.lesson));payload.forEach(x=>writeDailyGroup(c.date,c.day,x.move.to,x.lesson));
    state.moveRecords=Array.isArray(state.moveRecords)?state.moveRecords:[];
    payload.forEach(x=>state.moveRecords.push({id:uniqueId(),groupId:x.lesson.groupId,fromDate:c.date,fromDay:c.day,fromPeriod:+x.move.from,toDate:c.date,toDay:c.day,toPeriod:+x.move.to,participants:[...(x.lesson.participants||[])],subject:x.lesson.subject,ts:new Date().toISOString(),source:"優先変更候補"}));
    state.moveRecords=state.moveRecords.slice(-600);
    state.priorityMoves=(state.priorityMoves||[]).filter(x=>x.id!==c.pref.id);
    addHistory("優先変更反映",`${c.date} ${desc}`);save();renderAll();
    const d=$("#proposalTargetDate");if(d)d.value=c.date;
    setTimeout(()=>{ensurePriorityProposalUi126();const box=$("#priorityProposalBox126");if(box)box.innerHTML=`<div class="status ok">優先変更をまとめて反映しました。「直前の候補反映を取り消す」で元に戻せます。</div>`;},0);
  }

  function decoratePriorityCells126(){
    ensurePriorityState126();
    const table=$("#dailyTable");if(!table)return;
    table.querySelectorAll("td.slot").forEach(td=>{
      const date=td.dataset.date,cls=td.dataset.class,day=td.dataset.day,p=+td.dataset.period;if(!date||!cls||!day)return;
      const l=getDaily(cls,date,day,p);if(!l)return;
      const pref=priorityForGroup126(date,l.groupId);
      td.classList.toggle("must-move-cell126",pref?.priority==="must");
      td.classList.toggle("prefer-move-cell126",pref?.priority==="prefer");
      if(pref){const base=td.title?td.title+" / ":"";td.title=base+`${pref.priority==="must"?"必須":"優先"}変更：${p}限→${pref.targetPeriod}限`;}
    });
  }

  const prevRenderAll126=renderAll;
  renderAll=function(){prevRenderAll126();ensurePriorityState126();ensurePriorityProposalUi126();decoratePriorityCells126();};
  const prevRenderDaily126=renderDaily;
  renderDaily=function(){const r=prevRenderDaily126();decoratePriorityCells126();return r;};

  const style=document.createElement("style");
  style.textContent=`
    .priority-move-editor126{margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:10px;background:#fafafa}
    .priority-move-title{display:flex;gap:10px;align-items:baseline;margin-bottom:9px}
    .priority-move-row{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.priority-move-row label{display:flex;flex-direction:column;gap:4px}
    .priority-proposal-box126{margin-top:12px}.priority-proposal-title126{margin-bottom:8px}
    #dailyTable td.must-move-cell126{box-shadow:inset 0 0 0 3px #9b1c1c!important}#dailyTable td.prefer-move-cell126{box-shadow:inset 0 0 0 3px #b7791f!important}
    @media(max-width:700px){.priority-move-row{align-items:stretch;flex-direction:column}}
  `;
  document.head.appendChild(style);
  ensurePriorityState126();ensurePriorityProposalUi126();decoratePriorityCells126();
})();