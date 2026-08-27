(() => {
  state.structuredConditions = Array.isArray(state.structuredConditions) ? state.structuredConditions : [];
  let editingConditionId = "";

  function condId(){ return `cond-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
  function knownRooms(){
    const set = new Set();
    const collect = g => Object.values(g || {}).forEach(l => (l?.rooms || []).forEach(r => r && set.add(r)));
    Object.values(state.base || {}).forEach(collect);
    Object.values(state.daily || {}).forEach(collect);
    return [...set].sort((a,b)=>a.localeCompare(b,"ja"));
  }
  function activePeriods(){
    return [...document.querySelectorAll('.structured-period-check:checked')].map(x=>+x.value).sort((a,b)=>a-b);
  }
  function periodRuns(ps){
    const a=[...new Set(ps)].sort((x,y)=>x-y);
    if(!a.length) return [];
    if(a.length===ALL_PERIODS.length && ALL_PERIODS.every(p=>a.includes(p))) return ["終日"];
    const runs=[]; let start=a[0], prev=a[0];
    for(let i=1;i<=a.length;i++){
      const cur=a[i];
      if(cur===prev+1){ prev=cur; continue; }
      runs.push(start===prev?String(start):`${start}-${prev}`);
      start=cur; prev=cur;
    }
    return runs;
  }
  function periodsToLegacy(ps){ return periodRuns(ps).join("・"); }
  function conditionToLegacyLines(c){
    if(!c.enabled) return [];
    return periodRuns(c.periods).map(run=>`${c.target},${c.condition},${c.day},${run}`);
  }
  function syncLegacyTextarea(){
    const ta=$("#conditionText"); if(!ta) return;
    ta.value=state.structuredConditions.flatMap(conditionToLegacyLines).join("\n");
  }

  function ensureStructuredUi(){
    const ta=$("#conditionText"); if(!ta || $("#structuredConditionEditor")) return;
    const card=ta.closest(".card"); if(!card) return;
    const h2=card.querySelector("h2"); if(h2) h2.textContent="変更条件";
    const desc=card.querySelector("p.muted");
    if(desc) desc.textContent="対象と条件を選び、該当する校時にチェックを入れて追加してください。";

    const editor=document.createElement("div");
    editor.id="structuredConditionEditor";
    editor.innerHTML=`
      <div class="structured-condition-grid">
        <div><label>対象種別</label><select id="conditionTargetType"><option value="teacher">教員</option><option value="room">教室・施設</option></select></div>
        <div><label>対象</label><select id="conditionTarget"></select><input id="conditionTargetOther" class="hidden" placeholder="教室・施設名を入力"></div>
        <div><label>条件</label><select id="conditionKind"></select></div>
        <div><label>曜日</label><select id="conditionDay">${DAYS.map(d=>`<option value="${d}">${d}曜日</option>`).join("")}</select></div>
      </div>
      <div class="structured-period-area">
        <label class="period-label">校時</label>
        <div id="structuredPeriodChecks" class="structured-period-checks">${ALL_PERIODS.map(p=>`<label><input class="structured-period-check" type="checkbox" value="${p}">${p}限</label>`).join("")}</div>
        <div class="structured-period-actions"><button type="button" class="sub" data-period-preset="all">終日</button><button type="button" class="sub" data-period-preset="am">午前</button><button type="button" class="sub" data-period-preset="pm">午後</button><button type="button" class="sub" data-period-preset="none">すべて解除</button></div>
      </div>
      <div class="actions structured-condition-actions"><button id="addStructuredConditionBtn" type="button" class="primary">条件を追加</button><button id="cancelStructuredConditionEditBtn" type="button" class="sub hidden">編集をキャンセル</button></div>
      <div id="structuredConditionMessage"></div>
      <div class="structured-condition-list-wrap"><h3>登録した条件</h3><div id="structuredConditionList"></div></div>`;
    ta.parentNode.insertBefore(editor,ta);
    ta.classList.add("hidden");

    $("#conditionTargetType").onchange=refreshConditionTarget;
    $("#conditionTarget").onchange=()=>{
      const other=$("#conditionTargetOther");
      if(other) other.classList.toggle("hidden",$("#conditionTarget").value!=="__other__");
    };
    $$("[data-period-preset]").forEach(b=>b.onclick=()=>setPeriodPreset(b.dataset.periodPreset));
    $("#addStructuredConditionBtn").onclick=saveStructuredCondition;
    $("#cancelStructuredConditionEditBtn").onclick=resetStructuredEditor;
    refreshConditionTarget();
    renderStructuredConditions();
  }

  function refreshConditionTarget(){
    const type=$("#conditionTargetType")?.value || "teacher";
    const target=$("#conditionTarget"), kind=$("#conditionKind"), other=$("#conditionTargetOther");
    if(!target||!kind) return;
    const old=target.value;
    if(type==="teacher"){
      target.innerHTML=sortedTeachers().map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
      kind.innerHTML=`<option value="不在">不在</option>`;
      if(other) other.classList.add("hidden");
    }else{
      const rooms=knownRooms();
      target.innerHTML=rooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join("")+`<option value="__other__">その他（直接入力）</option>`;
      kind.innerHTML=`<option value="使用不可">使用不可</option>`;
      if(other) other.classList.toggle("hidden",target.value!=="__other__");
    }
    if([...target.options].some(o=>o.value===old)) target.value=old;
    if(other) other.classList.toggle("hidden",target.value!=="__other__");
  }

  function setPeriodPreset(mode){
    $$(".structured-period-check").forEach(x=>{
      const p=+x.value;
      x.checked = mode==="all" ? true : mode==="am" ? (p>=0&&p<=4) : mode==="pm" ? (p>=5) : false;
    });
  }
  function readTarget(){
    const sel=$("#conditionTarget"); if(!sel) return "";
    return sel.value==="__other__" ? $("#conditionTargetOther")?.value.trim() || "" : sel.value;
  }
  function saveStructuredCondition(){
    const target=readTarget(), periods=activePeriods();
    const msg=$("#structuredConditionMessage");
    if(!target){ if(msg) msg.innerHTML=`<div class="status warn">対象を選択または入力してください。</div>`; return; }
    if(!periods.length){ if(msg) msg.innerHTML=`<div class="status warn">校時を1つ以上選択してください。</div>`; return; }
    const data={id:editingConditionId||condId(),enabled:true,targetType:$("#conditionTargetType").value,target,condition:$("#conditionKind").value,day:$("#conditionDay").value,periods};
    const i=state.structuredConditions.findIndex(c=>c.id===editingConditionId);
    if(i>=0){ data.enabled=state.structuredConditions[i].enabled!==false; state.structuredConditions[i]=data; }
    else state.structuredConditions.push(data);
    addHistory(i>=0?"変更条件編集":"変更条件追加",`${target} ${data.condition} ${data.day} ${periodsToLegacy(periods)}`);
    save(); syncLegacyTextarea(); renderStructuredConditions(); resetStructuredEditor();
    if(msg) msg.innerHTML=`<div class="status ok">条件を${i>=0?"更新":"追加"}しました。</div>`;
  }
  function resetStructuredEditor(){
    editingConditionId="";
    const btn=$("#addStructuredConditionBtn"); if(btn) btn.textContent="条件を追加";
    $("#cancelStructuredConditionEditBtn")?.classList.add("hidden");
    $("#conditionTargetType").value="teacher";
    refreshConditionTarget(); setPeriodPreset("none");
    if($("#conditionTargetOther")) $("#conditionTargetOther").value="";
  }
  function editStructuredCondition(id){
    const c=state.structuredConditions.find(x=>x.id===id); if(!c) return;
    editingConditionId=id;
    $("#conditionTargetType").value=c.targetType||"teacher"; refreshConditionTarget();
    const sel=$("#conditionTarget");
    if([...sel.options].some(o=>o.value===c.target)) sel.value=c.target;
    else { sel.value="__other__"; $("#conditionTargetOther").value=c.target; $("#conditionTargetOther").classList.remove("hidden"); }
    $("#conditionKind").value=c.condition; $("#conditionDay").value=c.day;
    $$(".structured-period-check").forEach(x=>x.checked=(c.periods||[]).includes(+x.value));
    $("#addStructuredConditionBtn").textContent="条件を更新";
    $("#cancelStructuredConditionEditBtn").classList.remove("hidden");
  }
  function deleteStructuredCondition(id){
    state.structuredConditions=state.structuredConditions.filter(c=>c.id!==id);
    addHistory("変更条件削除","登録条件を削除"); save(); syncLegacyTextarea(); renderStructuredConditions();
  }
  function renderStructuredConditions(){
    const box=$("#structuredConditionList"); if(!box) return;
    box.innerHTML=state.structuredConditions.length ? state.structuredConditions.map(c=>`
      <div class="structured-condition-item ${c.enabled===false?"disabled-condition":""}">
        <label class="condition-enabled"><input type="checkbox" class="structured-condition-enabled" data-id="${esc(c.id)}" ${c.enabled===false?"":"checked"}></label>
        <div class="condition-summary"><strong>${esc(c.target)}</strong>｜${esc(c.condition)}｜${esc(c.day)}曜日｜${esc((c.periods||[]).map(p=>`${p}限`).join("・"))}</div>
        <div class="condition-item-actions"><button type="button" class="sub structured-condition-edit" data-id="${esc(c.id)}">編集</button><button type="button" class="danger-outline structured-condition-delete" data-id="${esc(c.id)}">削除</button></div>
      </div>`).join("") : `<p class="muted">登録されている条件はありません。</p>`;
    $$(".structured-condition-enabled").forEach(x=>x.onchange=()=>{ const c=state.structuredConditions.find(c=>c.id===x.dataset.id); if(c){c.enabled=x.checked;save();syncLegacyTextarea();renderStructuredConditions();} });
    $$(".structured-condition-edit").forEach(b=>b.onclick=()=>editStructuredCondition(b.dataset.id));
    $$(".structured-condition-delete").forEach(b=>b.onclick=()=>deleteStructuredCondition(b.dataset.id));
    syncLegacyTextarea();
  }

  const previousAnalyzeConditions=analyzeConditions;
  analyzeConditions=function(){ syncLegacyTextarea(); return previousAnalyzeConditions(); };
  const previousApplyConditions=applyConditions;
  applyConditions=function(){ syncLegacyTextarea(); return previousApplyConditions(); };

  const style=document.createElement("style");
  style.textContent=`
    .structured-condition-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin:10px 0 14px}
    .structured-condition-grid>div{display:flex;flex-direction:column;gap:5px}.structured-condition-grid label,.period-label{font-weight:700}
    .structured-period-area{padding:12px;border:1px solid var(--line,var(--border));border-radius:9px;background:#fafbfc}
    .structured-period-checks{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.structured-period-checks label{display:flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid var(--line,var(--border));border-radius:7px;background:#fff}
    .structured-period-checks input{width:17px;height:17px}.structured-period-actions{display:flex;flex-wrap:wrap;gap:7px}
    .structured-condition-actions{margin-top:10px}.structured-condition-list-wrap{margin-top:16px}.structured-condition-list-wrap h3{margin-bottom:8px}
    .structured-condition-item{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:9px 10px;border:1px solid var(--line,var(--border));border-radius:8px;margin-top:7px;background:#fff}
    .condition-enabled input{width:18px;height:18px}.condition-item-actions{display:flex;gap:6px}.disabled-condition{opacity:.5}.hidden{display:none!important}
    @media(max-width:800px){.structured-condition-grid{grid-template-columns:1fr 1fr}.structured-condition-item{grid-template-columns:auto 1fr}.condition-item-actions{grid-column:2}}
    @media(max-width:520px){.structured-condition-grid{grid-template-columns:1fr}.structured-condition-item{grid-template-columns:auto 1fr}.condition-item-actions{grid-column:1/-1}.condition-item-actions button{flex:1}}
  `;
  document.head.appendChild(style);

  const previousRenderAll=renderAll;
  renderAll=function(){ previousRenderAll(); ensureStructuredUi(); refreshConditionTarget(); renderStructuredConditions(); };

  ensureStructuredUi();
  renderStructuredConditions();
  save();
})();
