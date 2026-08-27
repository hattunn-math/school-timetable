(() => {
  let scopedDate127="";

  function validDate127(d){ return !!(d && dayNameForDate(d)); }
  function currentScopedDate127(){
    const shared=$("#adjustmentDate127")?.value;
    if(validDate127(shared)) return shared;
    const c=$("#conditionDate")?.value;
    if(validDate127(c)) return c;
    const p=$("#proposalTargetDate")?.value;
    if(validDate127(p)) return p;
    const f=$("#fixedDate")?.value;
    if(validDate127(f)) return f;
    const d=currentDate();
    return validDate127(d)?d:"";
  }

  function syncDateControls127(date,source=""){
    if(!validDate127(date)) return;
    scopedDate127=date;
    const ids=["adjustmentDate127","conditionDate","fixedDate","proposalTargetDate"];
    ids.forEach(id=>{
      if(id===source) return;
      const el=$("#"+id); if(el && el.value!==date) el.value=date;
    });
    if($("#fixedDate") && typeof refreshFixedForm==="function"){
      try{ refreshFixedForm(); }catch(e){}
    }
    renderScopedConditionList127();
    decorateDateLabels127();
  }

  function installUnifiedAdjustment127(){
    const section=$("#conditions"), fixed=$("#fixedConditionCard"), move=$("#moveProposalCard");
    if(!section || !fixed || !move) return;
    let outer=$("#dailyAdjustmentCard127");
    if(!outer){
      outer=document.createElement("div");
      outer.id="dailyAdjustmentCard127";
      outer.className="card daily-adjustment-card127";
      outer.innerHTML=`
        <div class="heading-row adjustment-heading127">
          <div><h2>その日の変更調整</h2><p class="muted">対象日を1日ずつ選び、時間固定と移動候補を同じ画面で調整します。</p></div>
          <div class="adjustment-date127"><label>対象日</label><input id="adjustmentDate127" type="date"></div>
        </div>
        <div id="fixedSection127" class="adjustment-section127"></div>
        <div id="moveSection127" class="adjustment-section127"></div>`;
      fixed.parentNode.insertBefore(outer,fixed);
    }
    const fs=$("#fixedSection127"), ms=$("#moveSection127");
    if(fixed.parentNode!==fs){ fixed.classList.remove("card"); fixed.classList.add("embedded-adjustment127"); fs.appendChild(fixed); }
    if(move.parentNode!==ms){ move.classList.remove("card"); move.classList.add("embedded-adjustment127"); ms.appendChild(move); }
    const date=$("#adjustmentDate127");
    if(date && date.dataset.sync127!=="1"){
      date.dataset.sync127="1";
      date.addEventListener("change",()=>syncDateControls127(date.value,"adjustmentDate127"));
    }
    const initial=currentScopedDate127() || currentDate();
    if(validDate127(initial)) syncDateControls127(initial);
  }

  function hookDateControls127(){
    [["conditionDate","conditionDate"],["fixedDate","fixedDate"],["proposalTargetDate","proposalTargetDate"]].forEach(([id,source])=>{
      const el=$("#"+id); if(!el || el.dataset.scope127==="1") return;
      el.dataset.scope127="1";
      el.addEventListener("change",()=>{
        if(validDate127(el.value)) syncDateControls127(el.value,source);
      });
    });
  }

  function scopedConditions127(date){
    return (state.structuredConditions||[]).filter(c=>c && c.date===date);
  }

  function conditionRow127(c){
    const day=dayNameForDate(c.date)||c.day||"";
    return `<div class="structured-condition-item ${c.enabled===false?"disabled-condition":""}">
      <label class="condition-enabled"><input type="checkbox" class="structured-condition-enabled scope127-enabled" data-id="${esc(c.id)}" ${c.enabled===false?"":"checked"}></label>
      <div class="condition-summary"><strong>${esc(c.date||"日付未設定")}${day?`（${esc(day)}）`:""}</strong>｜${esc(c.target)}｜${esc(c.condition)}｜${esc((c.periods||[]).map(p=>`${p}限`).join("・"))}</div>
      <div class="condition-item-actions"><button type="button" class="sub structured-condition-edit scope127-edit" data-id="${esc(c.id)}">編集</button><button type="button" class="danger-outline structured-condition-delete scope127-delete" data-id="${esc(c.id)}">削除</button></div>
    </div>`;
  }

  function renderScopedConditionList127(){
    const box=$("#structuredConditionList"); if(!box) return;
    const date=currentScopedDate127();
    if(!validDate127(date)) return;
    const rows=scopedConditions127(date).sort((a,b)=>(a.target||"").localeCompare(b.target||"","ja"));
    box.innerHTML=rows.length?rows.map(conditionRow127).join(""):`<p class="muted">${esc(date)} に登録されている条件はありません。</p>`;
    box.querySelectorAll(".scope127-enabled").forEach(x=>x.onchange=()=>{
      const c=(state.structuredConditions||[]).find(c=>c.id===x.dataset.id); if(!c)return;
      c.enabled=x.checked; save(); renderScopedConditionList127();
    });
    box.querySelectorAll(".scope127-edit").forEach(b=>b.onclick=()=>{
      const c=(state.structuredConditions||[]).find(x=>x.id===b.dataset.id); if(!c)return;
      const dateEl=$("#conditionDate"); if(dateEl) dateEl.value=c.date;
      const type=$("#conditionTargetType"); if(type) type.value=c.targetType||"teacher";
      if(typeof refreshConditionTarget==="function") try{refreshConditionTarget();}catch(e){}
      const target=$("#conditionTarget");
      if(target){
        if([...target.options].some(o=>o.value===c.target)) target.value=c.target;
        else if([...target.options].some(o=>o.value==="__other__")){
          target.value="__other__"; const other=$("#conditionTargetOther"); if(other){other.value=c.target;other.classList.remove("hidden");}
        }
      }
      const kind=$("#conditionKind"); if(kind) kind.value=c.condition;
      $$(".structured-period-check").forEach(x=>x.checked=(c.periods||[]).map(Number).includes(+x.value));
      // Delegate to the original edit button when available so its internal editing id is set.
      const original=[...document.querySelectorAll(".structured-condition-edit")].find(x=>x!==b&&x.dataset.id===b.dataset.id);
      if(original) original.click();
      else alert("編集内容を読み込みました。更新ではなく新規追加になる場合は、元の条件を削除してから保存してください。");
    });
    box.querySelectorAll(".scope127-delete").forEach(b=>b.onclick=()=>{
      if(!confirm("この条件を削除しますか？"))return;
      state.structuredConditions=(state.structuredConditions||[]).filter(c=>c.id!==b.dataset.id);
      addHistory("変更条件削除",`${date} の登録条件を削除`); save(); renderScopedConditionList127();
    });
  }

  function hookConditionList127(){
    const date=$("#conditionDate");
    if(date && date.dataset.list127!=="1"){
      date.dataset.list127="1";
      date.addEventListener("change",()=>setTimeout(renderScopedConditionList127,0));
    }
    const add=$("#addStructuredConditionBtn");
    if(add && add.dataset.list127!=="1"){
      add.dataset.list127="1";
      add.addEventListener("click",()=>setTimeout(()=>{
        const d=$("#conditionDate")?.value||scopedDate127; if(validDate127(d))syncDateControls127(d,"conditionDate");
        renderScopedConditionList127();
      },0));
    }
  }

  function installScopedAnalyze127(){
    const btn=$("#analyzeConditionsBtn"); if(!btn || btn.dataset.scope127==="1") return;
    btn.dataset.scope127="1";
    btn.onclick=function(){
      const date=currentScopedDate127();
      const box=$("#conditionResult");
      if(!validDate127(date)){ if(box)box.innerHTML=`<div class="status warn">解析する平日の日付を選択してください。</div>`; return; }
      const all=Array.isArray(state.structuredConditions)?state.structuredConditions:[];
      const scoped=all.filter(c=>c&&c.date===date);
      if(!scoped.length){ if(box)box.innerHTML=`<div class="status warn">${esc(date)} に登録されている条件はありません。</div>`; return; }
      state.structuredConditions=scoped;
      try{ analyzeConditions(); }
      finally{ state.structuredConditions=all; }
      if(box){
        const head=document.createElement("div"); head.className="scope-analysis-label127"; head.textContent=`解析対象：${date} の条件のみ`;
        box.insertAdjacentElement("afterbegin",head);
      }
    };
  }

  function installScopedApply127(){
    const btn=$("#applyConditionsBtn"); if(!btn || btn.dataset.scope127==="1") return;
    const old=btn.onclick;
    btn.dataset.scope127="1";
    btn.onclick=function(e){
      const date=currentScopedDate127();
      if(!validDate127(date)){alert("反映する平日の日付を選択してください。");return;}
      const all=Array.isArray(state.structuredConditions)?state.structuredConditions:[];
      const scoped=all.filter(c=>c&&c.date===date);
      state.structuredConditions=scoped;
      try{ return typeof old==="function"?old.call(this,e):applyConditions(); }
      finally{ state.structuredConditions=all; save(); setTimeout(renderScopedConditionList127,0); }
    };
  }

  function renderScopedFixedList127(){
    const box=$("#fixedConditionList"); if(!box)return;
    const date=currentScopedDate127();
    const rows=(state.fixedSlots||[]).filter(r=>r&&r.date===date).sort((a,b)=>+a.period-+b.period);
    box.innerHTML=rows.length?rows.map(r=>`<div class="fixed-item"><div><strong>🔒 ${esc(r.date)} ${r.period}限</strong>　${esc((r.classes||[]).join("・"))}${r.subject?`　${esc(r.subject)}`:""}<div class="small muted">${esc(r.source||"手動")}で固定</div></div><button type="button" class="danger-outline scope-fixed-remove127" data-fixed-id="${esc(r.id)}">固定解除</button></div>`).join(""):`<p class="muted">${esc(date||"")} に固定されている授業はありません。</p>`;
    box.querySelectorAll(".scope-fixed-remove127").forEach(b=>b.onclick=()=>{
      state.fixedSlots=(state.fixedSlots||[]).filter(r=>r.id!==b.dataset.fixedId);addHistory("時間固定解除",`${date} の固定条件を解除`);save();renderAll();
    });
  }

  function decorateDateLabels127(){
    const date=currentScopedDate127();
    const ch=$("#structuredConditionList")?.previousElementSibling;
    if(ch && ch.tagName==="H3") ch.textContent=`登録した条件（${date||"日付未選択"}）`;
    const fh=$("#fixedConditionList")?.previousElementSibling;
    if(fh && fh.tagName==="H3") fh.textContent=`時間固定（${date||"日付未選択"}）`;
  }

  const prevRenderAll127=renderAll;
  renderAll=function(){
    prevRenderAll127();
    installUnifiedAdjustment127();
    hookDateControls127();
    hookConditionList127();
    installScopedAnalyze127();
    installScopedApply127();
    renderScopedConditionList127();
    renderScopedFixedList127();
    decorateDateLabels127();
  };

  const style=document.createElement("style");
  style.textContent=`
    .daily-adjustment-card127{border-left:4px solid #2f6f9f}
    .adjustment-heading127{align-items:end}.adjustment-date127{min-width:170px}.adjustment-date127 label{display:block;margin-bottom:5px}
    .adjustment-section127{padding-top:14px;margin-top:14px;border-top:1px solid var(--border)}
    .adjustment-section127:first-of-type{margin-top:4px}.embedded-adjustment127{border:0!important;box-shadow:none!important;padding:0!important;margin:0!important;background:transparent!important}
    .scope-analysis-label127{font-weight:700;margin:0 0 8px;color:var(--muted)}
    @media(max-width:700px){.adjustment-heading127{align-items:stretch;flex-direction:column}.adjustment-date127,.adjustment-date127 input{width:100%}}
  `;
  document.head.appendChild(style);

  installUnifiedAdjustment127();
  hookDateControls127();
  hookConditionList127();
  installScopedAnalyze127();
  installScopedApply127();
  renderScopedConditionList127();
  renderScopedFixedList127();
  decorateDateLabels127();
})();