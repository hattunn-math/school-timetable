(() => {
  let complexCandidates124=[];

  function conds124(date){
    return (state.structuredConditions||[]).filter(c=>c&&c.enabled!==false&&c.date===date);
  }
  function hardBlocked124(lesson,date,p){
    return conds124(date).some(c=>{
      if(!(c.periods||[]).map(Number).includes(+p)) return false;
      if(c.condition==="不在") return (lesson.teachers||[]).includes(c.target);
      if(c.condition==="使用不可") return (lesson.rooms||[]).includes(c.target);
      return false;
    });
  }
  function fixed124(classes,date,day,p){
    return (state.fixedSlots||[]).some(r=>r&&r.date===date&&r.day===day&&+r.period===+p&&(r.classes||[]).some(c=>classes.includes(c)));
  }
  function available124(name,date,day,p){
    return typeof window.teacherAvailableOnDate==="function"
      ? window.teacherAvailableOnDate(name,date,day,p)
      : teacherAvailable(name,day,p);
  }
  function affected124(date){
    const day=dayNameForDate(date),out=[],seen=new Set();
    if(!day)return out;
    conds124(date).filter(c=>c.condition==="不在"||c.condition==="使用不可").forEach(c=>{
      (c.periods||[]).map(Number).forEach(p=>state.classes.forEach(cls=>{
        if(!periodsForClass(cls).includes(p))return;
        const l=getDaily(cls,date,day,p); if(!l)return;
        const hit=c.condition==="不在"?(l.teachers||[]).includes(c.target):(l.rooms||[]).includes(c.target);
        if(!hit)return;
        const k=`${date}|${p}|${l.groupId}`; if(seen.has(k))return; seen.add(k);
        out.push({date,day,p,lesson:l,condition:c});
      }));
    });
    return out;
  }
  function singleClass124(l){
    const ps=(l?.participants||[]).filter(c=>state.classes.includes(c));
    return ps.length===1?ps[0]:"";
  }
  function classSchedule124(cls,date,day){
    const m=new Map();
    periodsForClass(cls).forEach(p=>{const l=getDaily(cls,date,day,p);if(l)m.set(+p,l);});
    return m;
  }
  function planKey124(plan){
    return plan.map(m=>`${m.groupId}:${m.from}>${m.to}`).sort().join("|");
  }
  function lessonByGroupAt124(date,day,groupId,preferredClass=""){
    if(preferredClass){
      for(const p of periodsForClass(preferredClass)){
        const l=getDaily(preferredClass,date,day,p); if(l?.groupId===groupId)return {lesson:l,p};
      }
    }
    for(const cls of state.classes){
      for(const p of periodsForClass(cls)){
        const l=getDaily(cls,date,day,p); if(l?.groupId===groupId)return {lesson:l,p};
      }
    }
    return null;
  }
  function validatePlan124(date,day,plan){
    if(!plan.length||plan.length>3)return {ok:false,reason:"変更数が範囲外"};
    const moveGroups=new Set(plan.map(m=>m.groupId));
    const lessons=new Map();
    for(const m of plan){
      const found=lessonByGroupAt124(date,day,m.groupId,m.cls); if(!found)return {ok:false,reason:"授業が見つかりません"};
      const l=found.lesson,classes=(l.participants||[]).filter(c=>state.classes.includes(c));
      if(classes.length!==1||classes[0]!==m.cls)return {ok:false,reason:"合同授業を含む複合移動は対象外"};
      if(+found.p!==+m.from)return {ok:false,reason:"時間割が変更されています"};
      if(!periodsForClass(m.cls).includes(+m.to))return {ok:false,reason:"移動先が校時外"};
      if(fixed124(classes,date,day,m.from)||fixed124(classes,date,day,m.to))return {ok:false,reason:"時間固定"};
      if(hardBlocked124(l,date,m.to))return {ok:false,reason:"移動先が変更条件に抵触"};
      const bad=activeTeachers(l).filter(t=>!available124(t,date,day,m.to));
      if(bad.length)return {ok:false,reason:`${bad.join("・")}先生が勤務時間外`};
      lessons.set(m.groupId,l);
    }

    const positions=[];
    const seen=new Set();
    state.classes.forEach(cls=>periodsForClass(cls).forEach(p=>{
      const l=getDaily(cls,date,day,p); if(!l||moveGroups.has(l.groupId))return;
      const k=l.groupId||`${cls}-${p}`; if(seen.has(k))return; seen.add(k);
      positions.push({p:+p,lesson:l});
    }));
    plan.forEach(m=>positions.push({p:+m.to,lesson:lessons.get(m.groupId)}));

    const classMap=new Map();
    for(const x of positions){
      for(const cls of (x.lesson.participants||[]).filter(c=>state.classes.includes(c))){
        const k=`${cls}|${x.p}`; if(classMap.has(k)&&classMap.get(k)!==x.lesson.groupId)return {ok:false,reason:`${cls}の${x.p}限が重複`};
        classMap.set(k,x.lesson.groupId);
      }
    }
    const teacherMap=new Map(),roomMap=new Map();
    for(const x of positions){
      const gid=x.lesson.groupId;
      for(const t of activeTeachers(x.lesson)){
        if(!available124(t,date,day,x.p))return {ok:false,reason:`${t}先生が${x.p}限勤務時間外`};
        const k=`${t}|${x.p}`,old=teacherMap.get(k);
        if(old&&old!==gid)return {ok:false,reason:`${t}先生が${x.p}限で重複`};
        teacherMap.set(k,gid);
      }
      for(const r of (x.lesson.rooms||[])){
        const k=`${r}|${x.p}`,old=roomMap.get(k);
        if(old&&old!==gid)return {ok:false,reason:`${r}が${x.p}限で重複`};
        roomMap.set(k,gid);
      }
    }
    return {ok:true};
  }
  function candidate124(root,plan,label){
    const v=validatePlan124(root.date,root.day,plan); if(!v.ok)return null;
    return {
      id:`complex|${root.date}|${planKey124(plan)}`,
      date:root.date,day:root.day,kind:"complex",label,
      rootSubject:root.lesson.subject,rootClass:singleClass124(root.lesson),
      reason:`${root.condition.target} ${root.condition.condition}`,
      moves:plan.map(m=>({...m}))
    };
  }
  function buildForRoot124(root){
    const cls=singleClass124(root.lesson); if(!cls)return [];
    const schedule=classSchedule124(cls,root.date,root.day),ps=periodsForClass(cls),src=+root.p,out=[];
    const rootMove=(to)=>({groupId:root.lesson.groupId,cls,subject:root.lesson.subject,from:src,to:+to});

    for(const pB of ps){
      if(pB===src)continue;
      const b=schedule.get(+pB); if(!b||b.groupId===root.lesson.groupId||singleClass124(b)!==cls)continue;
      const swap=[rootMove(pB),{groupId:b.groupId,cls,subject:b.subject,from:+pB,to:src}];
      const cs=candidate124(root,swap,"2手入れ替え"); if(cs)out.push(cs);
      for(const e of ps){
        if(e===src||e===pB||schedule.get(+e))continue;
        const path=[rootMove(pB),{groupId:b.groupId,cls,subject:b.subject,from:+pB,to:+e}];
        const cp=candidate124(root,path,"2手連鎖"); if(cp)out.push(cp);
      }
    }

    for(const pB of ps){
      if(pB===src)continue;
      const b=schedule.get(+pB); if(!b||singleClass124(b)!==cls)continue;
      for(const pC of ps){
        if(pC===src||pC===pB)continue;
        const c=schedule.get(+pC); if(!c||singleClass124(c)!==cls||c.groupId===b.groupId)continue;
        const cyc=[rootMove(pB),{groupId:b.groupId,cls,subject:b.subject,from:+pB,to:+pC},{groupId:c.groupId,cls,subject:c.subject,from:+pC,to:src}];
        const cc=candidate124(root,cyc,"3手循環"); if(cc)out.push(cc);
        for(const e of ps){
          if(e===src||e===pB||e===pC||schedule.get(+e))continue;
          const path=[rootMove(pB),{groupId:b.groupId,cls,subject:b.subject,from:+pB,to:+pC},{groupId:c.groupId,cls,subject:c.subject,from:+pC,to:+e}];
          const cp=candidate124(root,path,"3手連鎖"); if(cp)out.push(cp);
        }
      }
    }
    const seen=new Set();
    return out.filter(c=>{const k=planKey124(c.moves);if(seen.has(k))return false;seen.add(k);return true;});
  }
  function buildComplex124(date){
    const out=[];
    affected124(date).forEach(r=>out.push(...buildForRoot124(r)));
    const seen=new Set();
    complexCandidates124=out.filter(c=>{if(seen.has(c.id))return false;seen.add(c.id);return true;}).slice(0,80);
    return complexCandidates124;
  }
  function ensureUi124(){
    const card=$("#moveProposalCard"); if(!card)return;
    if(!$("#createComplexProposalsBtn")){
      const actions=card.querySelector(".proposal-date-row .actions")||card.querySelector(".actions");
      if(actions){
        const b=document.createElement("button");b.id="createComplexProposalsBtn";b.type="button";b.className="sub";b.textContent="複合候補を作成";actions.appendChild(b);
        b.onclick=createComplexUi124;
      }
    }
    let box=$("#complexProposalBox");
    if(!box){box=document.createElement("div");box.id="complexProposalBox";box.className="complex-proposal-box";const anchor=$("#conditionalMoveSuggestions")||$("#moveProposalStatus");anchor?.insertAdjacentElement("afterend",box);}
  }
  function createComplexUi124(){
    const date=$("#proposalTargetDate")?.value||currentDate(),box=$("#complexProposalBox");
    if(!box)return;
    if(!date||!dayNameForDate(date)){box.innerHTML=`<div class="status warn">月〜金の日付を選択してください。</div>`;return;}
    const roots=affected124(date);
    if(!roots.length){box.innerHTML=`<div class="status warn">${esc(date)} に複合移動を検討する不在・使用不可の授業がありません。</div>`;return;}
    const list=buildComplex124(date);
    if(!list.length){
      const joint=roots.filter(r=>!singleClass124(r.lesson)).length;
      box.innerHTML=`<div class="status warn">最大3手まで探しましたが、安全な複合変更候補は見つかりませんでした。</div>${joint?`<div class="small muted">合同授業 ${joint}件は、複数クラスへ影響するため今回の複合探索対象外です。</div>`:""}`;
      return;
    }
    box.innerHTML=`<div class="complex-title"><div><strong>複合変更候補 ${list.length}件</strong><div class="small muted">最大3手。セット全体を反映後の状態で重複・勤務・教室・固定・変更条件を確認済みです。</div></div></div><div class="complex-list">${list.map(c=>`<div class="complex-item"><div class="complex-item-head"><strong>${esc(c.label)}｜${esc(c.rootClass)} ${esc(c.rootSubject)}</strong><span class="small muted">理由：${esc(c.reason)}</span></div><div class="complex-steps">${c.moves.map((m,i)=>`<div><span class="step-no">${i+1}</span>${esc(m.subject)}：${m.from}限 → ${m.to}限</div>`).join("")}</div><button type="button" class="primary apply-complex124" data-id="${esc(c.id)}">この組み合わせをまとめて反映</button></div>`).join("")}</div>`;
    box.querySelectorAll(".apply-complex124").forEach(b=>b.onclick=()=>applyComplex124(b.dataset.id));
  }
  function applyComplex124(id){
    const c=complexCandidates124.find(x=>x.id===id); if(!c)return;
    const v=validatePlan124(c.date,c.day,c.moves); if(!v.ok){alert(`現在はこの候補を反映できません：${v.reason}\n候補を作り直してください。`);return;}
    const desc=c.moves.map(m=>`${m.subject} ${m.from}→${m.to}`).join(" / ");
    if(!confirm(`${c.date} の複合変更をまとめて反映しますか？\n\n${desc}`))return;
    state.proposalUndoStack=Array.isArray(state.proposalUndoStack)?state.proposalUndoStack:[];
    state.proposalUndoStack.push({id:uniqueId(),ts:new Date().toISOString(),description:`${c.date} 複合変更：${desc}`,daily:clone(state.daily),moveRecords:clone(state.moveRecords||[]),classSettings:clone(state.classSettings)});
    state.proposalUndoStack=state.proposalUndoStack.slice(-5);

    const payload=[];
    for(const m of c.moves){
      const found=lessonByGroupAt124(c.date,c.day,m.groupId,m.cls); if(!found)return;
      payload.push({move:m,lesson:clone(found.lesson)});
    }
    payload.forEach(x=>removeDailyGroup(c.date,c.day,x.move.from,x.lesson));
    payload.forEach(x=>writeDailyGroup(c.date,c.day,x.move.to,x.lesson));
    state.moveRecords=Array.isArray(state.moveRecords)?state.moveRecords:[];
    payload.forEach(x=>state.moveRecords.push({id:uniqueId(),groupId:x.lesson.groupId,fromDate:c.date,fromDay:c.day,fromPeriod:+x.move.from,toDate:c.date,toDay:c.day,toPeriod:+x.move.to,participants:[...(x.lesson.participants||[])],subject:x.lesson.subject,ts:new Date().toISOString(),source:"複合変更候補"}));
    state.moveRecords=state.moveRecords.slice(-600);
    addHistory("複合変更反映",`${c.date} ${desc}`);
    save();renderAll();
    const d=$("#proposalTargetDate");if(d)d.value=c.date;
    setTimeout(()=>{ensureUi124();const box=$("#complexProposalBox");if(box)box.innerHTML=`<div class="status ok">複合変更をまとめて反映しました。「直前の候補反映を取り消す」でセット全体を元に戻せます。</div>`;},0);
  }
  function updateHelp124(){
    const p=$("#moveProposalCard")?.querySelector("p.muted");
    if(p)p.textContent="1日ずつ、通常の移動・入れ替えに加え、最大3手の複合変更も探索できます。勤務可否だけで成立する案は条件付き候補として表示します。";
  }
  const prevRenderAll124=renderAll;
  renderAll=function(){prevRenderAll124();ensureUi124();updateHelp124();};
  const style=document.createElement("style");
  style.textContent=`
    .complex-proposal-box{margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:#fbfbfd}
    .complex-title{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}
    .complex-list{display:flex;flex-direction:column;gap:10px}.complex-item{padding:10px;border:1px solid var(--border);border-radius:9px;background:#fff}
    .complex-item-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.complex-steps{display:grid;gap:5px;margin:8px 0}.complex-steps>div{padding:6px 8px;background:#f7f8fa;border-radius:7px}.step-no{display:inline-flex;width:22px;height:22px;border-radius:50%;align-items:center;justify-content:center;margin-right:7px;background:#eef3f7;font-weight:700}
    @media(max-width:700px){.complex-item .primary{width:100%}.complex-item-head{flex-direction:column}}
  `;
  document.head.appendChild(style);
  ensureUi124();updateHelp124();
})();
