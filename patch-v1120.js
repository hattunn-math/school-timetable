(() => {
  state.fixedSlots = Array.isArray(state.fixedSlots) ? state.fixedSlots : [];

  function fixedId(){ return `fixed-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
  function slotLesson(cls,date,day,p){ return getDaily(cls,date,day,+p); }
  function fixedMatches(rec,cls,date,day,p){
    if(!rec || rec.date!==date || rec.day!==day || +rec.period!==+p) return false;
    if((rec.classes||[]).includes(cls)) return true;
    const lesson = slotLesson(cls,date,day,p);
    if(!lesson?.groupId || !rec.groupId) return false;
    return lesson.groupId===rec.groupId;
  }
  function fixedRecordFor(cls,date,day,p){
    return state.fixedSlots.find(r=>fixedMatches(r,cls,date,day,p)) || null;
  }
  function isFixed(cls,date,day,p){ return !!fixedRecordFor(cls,date,day,p); }

  function normalizeFixedSlots(){
    state.fixedSlots = state.fixedSlots.filter(r=>r && r.date && r.day && Number.isFinite(+r.period) && Array.isArray(r.classes) && r.classes.length);
  }
  normalizeFixedSlots();

  function addFixedRecord({date,day,period,classes,subject="",source="手動",groupId=""}){
    const cls = [...new Set((classes||[]).filter(c=>state.classes.includes(c)))];
    if(!date || !day || !cls.length) return false;
    const exists = state.fixedSlots.some(r=>r.date===date && r.day===day && +r.period===+period && cls.every(c=>(r.classes||[]).includes(c)));
    if(exists) return false;
    state.fixedSlots.push({id:fixedId(),date,day,period:+period,classes:cls,subject,source,groupId,createdAt:new Date().toISOString()});
    return true;
  }

  function removeFixed(id){
    const before = state.fixedSlots.length;
    state.fixedSlots = state.fixedSlots.filter(r=>r.id!==id);
    if(state.fixedSlots.length!==before){
      addHistory("時間固定解除", "固定条件を解除");
      save();
      renderAll();
    }
  }

  function injectFixedConditionUi(){
    const section = $("#conditions");
    if(!section || $("#fixedConditionCard")) return;
    const card = document.createElement("div");
    card.id = "fixedConditionCard";
    card.className = "card fixed-condition-card";
    card.innerHTML = `
      <div class="heading-row">
        <div><h2>時間固定</h2><p class="muted">研究授業など、指定した日時から動かしたくない授業を固定します。</p></div>
      </div>
      <div class="fixed-condition-form">
        <div><label>日付</label><input id="fixedDate" type="date"></div>
        <div><label>クラス</label><select id="fixedClass"></select></div>
        <div><label>校時</label><select id="fixedPeriod"></select></div>
        <div class="fixed-subject-preview"><label>現在の授業</label><strong id="fixedSubjectPreview">—</strong></div>
        <button id="addFixedConditionBtn" type="button" class="primary">時間固定を追加</button>
      </div>
      <div id="fixedConditionMessage"></div>
      <div class="fixed-list-wrap"><h3>現在の固定条件</h3><div id="fixedConditionList"></div></div>`;
    section.appendChild(card);
    $("#fixedDate").value = currentDate() || "";
    $("#fixedDate").onchange = refreshFixedForm;
    $("#fixedClass").onchange = refreshFixedPeriods;
    $("#fixedPeriod").onchange = refreshFixedSubject;
    $("#addFixedConditionBtn").onclick = addManualFixed;
    refreshFixedForm();
  }

  function refreshFixedForm(){
    const clsSel=$("#fixedClass"); if(!clsSel) return;
    const old=clsSel.value;
    clsSel.innerHTML=state.classes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
    if(state.classes.includes(old)) clsSel.value=old;
    refreshFixedPeriods();
    renderFixedList();
  }
  function refreshFixedPeriods(){
    const cls=$("#fixedClass")?.value, per=$("#fixedPeriod"); if(!cls||!per) return;
    const old=+per.value;
    const ps=periodsForClass(cls);
    per.innerHTML=ps.map(p=>`<option value="${p}">${p}限</option>`).join("");
    if(ps.includes(old)) per.value=String(old);
    refreshFixedSubject();
  }
  function refreshFixedSubject(){
    const date=$("#fixedDate")?.value, cls=$("#fixedClass")?.value, p=+($("#fixedPeriod")?.value||0);
    const day=dayNameForDate(date), l=day?slotLesson(cls,date,day,p):null;
    const out=$("#fixedSubjectPreview"); if(out) out.textContent=l?.subject||"—";
  }
  function addManualFixed(){
    const date=$("#fixedDate")?.value, cls=$("#fixedClass")?.value, p=+($("#fixedPeriod")?.value||0), day=dayNameForDate(date);
    const msg=$("#fixedConditionMessage");
    if(!day){ msg.innerHTML=`<div class="status warn">月〜金の日付を選択してください。</div>`; return; }
    const l=slotLesson(cls,date,day,p);
    if(!l){ msg.innerHTML=`<div class="status warn">その時間には授業がありません。</div>`; return; }
    const classes=(l.participants?.length?l.participants:[cls]).filter(c=>state.classes.includes(c));
    const added=addFixedRecord({date,day,period:p,classes,subject:l.subject||"",source:"手動",groupId:l.groupId||""});
    msg.innerHTML=added?`<div class="status ok">${esc(date)} ${esc(classes.join("・"))} ${p}限 ${esc(l.subject||"")} を時間固定しました。</div>`:`<div class="status warn">同じ時間はすでに固定されています。</div>`;
    if(added){ addHistory("時間固定",`${date} ${classes.join("・")} ${p}限 ${l.subject||""}`); save(); renderAll(); }
  }

  function renderFixedList(){
    const box=$("#fixedConditionList"); if(!box) return;
    const rows=[...state.fixedSlots].sort((a,b)=>`${a.date}-${a.period}`.localeCompare(`${b.date}-${b.period}`));
    box.innerHTML=rows.length?rows.map(r=>`<div class="fixed-item"><div><strong>🔒 ${esc(r.date)} ${r.period}限</strong>　${esc((r.classes||[]).join("・"))}${r.subject?`　${esc(r.subject)}`:""}<div class="small muted">${esc(r.source||"手動")}で固定</div></div><button type="button" class="danger-outline fixed-remove" data-fixed-id="${esc(r.id)}">固定解除</button></div>`).join(""):`<p class="muted">固定されている授業はありません。</p>`;
    box.querySelectorAll(".fixed-remove").forEach(b=>b.onclick=()=>removeFixed(b.dataset.fixedId));
  }

  function injectBatchLockOption(){
    const card=$("#testBatchCard"); if(!card || $("#batchFixOption")) return;
    const actions=card.querySelector(".actions"); if(!actions) return;
    const row=document.createElement("label");
    row.id="batchFixOption";
    row.className="batch-fix-option";
    row.innerHTML=`<input id="fixBatchTimes" type="checkbox"> <span><strong>変更した時間を固定する</strong><small>一括変更で科目を変更した校時を、その日時から動かさない条件として登録します。</small></span>`;
    actions.insertAdjacentElement("beforebegin",row);
  }

  function selectedBatchClasses(){
    return [...document.querySelectorAll('#testClassChecks input[type="checkbox"]:checked')].map(x=>x.value).filter(c=>state.classes.includes(c));
  }
  function batchSubjects(){
    const out={};
    $$(".test-subject-input").forEach(el=>{const s=el.value.trim();if(s)out[+el.dataset.period]=s;});
    return out;
  }
  function captureBatchLockPlan(){
    if(!$("#fixBatchTimes")?.checked || $("#applyTestBatchBtn")?.disabled) return null;
    const date=$("#testBatchDate")?.value, day=dayNameForDate(date), classes=selectedBatchClasses(), subjects=batchSubjects();
    if(!date||!day||!classes.length||!Object.keys(subjects).length) return null;
    return {date,day,classes,subjects};
  }
  function applyBatchLocks(plan){
    if(!plan) return;
    let added=0;
    Object.entries(plan.subjects).forEach(([pStr,subject])=>{
      const p=+pStr;
      const valid=plan.classes.filter(cls=>periodsForClass(cls).includes(p) && slotLesson(cls,plan.date,plan.day,p));
      if(!valid.length) return;
      if(addFixedRecord({date:plan.date,day:plan.day,period:p,classes:valid,subject,source:"一括変更"})) added++;
    });
    if(added){
      addHistory("時間固定",`${plan.date} 一括変更と同時に ${added}校時を固定`);
      save();
      renderAll();
    }
  }

  function bindBatchLock(){
    injectBatchLockOption();
    const btn=$("#applyTestBatchBtn");
    if(!btn || btn.dataset.fixedHook==="1") return;
    btn.dataset.fixedHook="1";
    btn.addEventListener("click",()=>{
      const plan=captureBatchLockPlan();
      if(!plan) return;
      setTimeout(()=>applyBatchLocks(plan),0);
    });
  }

  function decorateFixedCells(){
    const table=$("#dailyTable"); if(!table) return;
    table.querySelectorAll("td.slot[data-class][data-date][data-day][data-period]").forEach(td=>{
      const fixed=isFixed(td.dataset.class,td.dataset.date,td.dataset.day,+td.dataset.period);
      td.classList.toggle("fixed-cell",fixed);
      const content=td.querySelector(".cell-content");
      if(fixed && content && !content.querySelector(".fixed-badge")) content.insertAdjacentHTML("beforeend",`<span class="fixed-badge" title="時間固定">🔒</span>`);
    });
  }

  const previousOpenEditor=openEditor;
  openEditor=function(isBase,cls,date,day,p){
    previousOpenEditor(isBase,cls,date,day,p);
    if(isBase) return;
    const fixed=fixedRecordFor(cls,date,day,p);
    if(!fixed) return;
    if($("#editTargetDate")) $("#editTargetDate").disabled=true;
    if($("#editPeriod")) $("#editPeriod").disabled=true;
    const warn=$("#editorWarnings");
    if(warn) warn.innerHTML=`<div class="status warn">🔒 この授業は時間固定されています。科目・教員・教室は編集できますが、日付・校時の移動や削除はできません。</div>`;
  };

  const previousSaveEditor=saveEditor;
  saveEditor=function(){
    if(editing && !editing.isBase && isFixed(editing.cls,editing.date,editing.day,editing.p)){
      const targetDate=$("#editTargetDate")?.value||editing.date;
      const targetDay=dayNameForDate(targetDate)||editing.day;
      const targetP=+($("#editPeriod")?.value||editing.p);
      if(targetDate!==editing.date || targetDay!==editing.day || targetP!==+editing.p){
        alert("この授業は時間固定されています。固定を解除してから移動してください。"); return;
      }
    }
    return previousSaveEditor();
  };

  const previousDeleteEditor=deleteEditor;
  deleteEditor=function(){
    if(editing && !editing.isBase && isFixed(editing.cls,editing.date,editing.day,editing.p)){
      alert("この授業は時間固定されています。固定を解除してから削除してください。"); return;
    }
    return previousDeleteEditor();
  };

  const previousRenderDaily=renderDaily;
  renderDaily=function(){ previousRenderDaily(); decorateFixedCells(); };

  const style=document.createElement("style");
  style.textContent=`
    .fixed-condition-card{border-left:4px solid #7b61a8}
    .fixed-condition-form{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
    .fixed-subject-preview{min-width:150px;display:flex;flex-direction:column;gap:6px}
    .fixed-list-wrap{margin-top:14px}.fixed-list-wrap h3{margin-bottom:8px}
    .fixed-item{display:flex;gap:12px;justify-content:space-between;align-items:center;padding:9px 10px;border:1px solid var(--border);border-radius:8px;margin-top:7px;background:#fff}
    .fixed-cell{position:relative;box-shadow:inset 0 0 0 2px #7b61a8!important}
    .fixed-badge{position:absolute;right:4px;bottom:3px;font-size:13px;line-height:1}
    .batch-fix-option{display:flex;align-items:flex-start;gap:8px;margin:12px 0;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:#fff;cursor:pointer}
    .batch-fix-option input{width:18px;height:18px;margin-top:2px}.batch-fix-option span{display:flex;flex-direction:column;gap:2px}.batch-fix-option small{color:var(--muted)}
    @media(max-width:700px){.fixed-condition-form>*{width:100%}.fixed-condition-form select,.fixed-condition-form input,.fixed-condition-form button{width:100%}.fixed-item{align-items:flex-start;flex-direction:column}.fixed-item button{width:100%}}
  `;
  document.head.appendChild(style);

  const previousRenderAll=renderAll;
  renderAll=function(){
    previousRenderAll();
    injectFixedConditionUi();
    refreshFixedForm();
    bindBatchLock();
    decorateFixedCells();
  };

  injectFixedConditionUi();
  bindBatchLock();
  decorateFixedCells();
  save();
})();
