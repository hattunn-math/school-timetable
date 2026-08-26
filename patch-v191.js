(() => {
  function gradeOf(cls){
    const s = String(cls || "").normalize("NFKC").trim();
    let m = s.match(/([1-3])\s*年/);
    if(m) return `${m[1]}年`;
    m = s.match(/^([1-3])\s*[-ー－]/);
    if(m) return `${m[1]}年`;
    m = s.match(/^([1-3])\s*[A-Za-z]/);
    if(m) return `${m[1]}年`;
    m = s.match(/^([1-3])\s*組/);
    if(m) return `${m[1]}年`;
    return "";
  }

  function availableGrades(){
    return ["1年","2年","3年"].filter(g => state.classes.some(c => gradeOf(c) === g));
  }

  function targetClasses(){
    const mode = $("#testTargetMode")?.value || "grade";
    const value = $("#testTargetValue")?.value || "";
    if(mode === "class") return state.classes.includes(value) ? [value] : [];
    return state.classes.filter(c => gradeOf(c) === value);
  }

  function renderTargets(){
    const modeEl = $("#testTargetMode"), valueEl = $("#testTargetValue");
    if(!modeEl || !valueEl) return;
    const old = valueEl.value;
    const values = modeEl.value === "grade" ? availableGrades() : state.classes;
    if(modeEl.value === "grade" && !values.length){
      modeEl.value = "class";
      valueEl.innerHTML = state.classes.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      if(state.classes.includes(old)) valueEl.value = old;
      return;
    }
    valueEl.innerHTML = values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if(values.includes(old)) valueEl.value = old;
  }

  function subjectsByPeriod(){
    const out = {};
    $$(".test-subject-input").forEach(el => {
      const s = el.value.trim();
      if(s) out[+el.dataset.period] = s;
    });
    return out;
  }

  function collect(){
    const date = $("#testBatchDate")?.value || currentDate();
    const day = dayNameForDate(date);
    const targets = targetClasses();
    const subjects = subjectsByPeriod();
    const items = [];
    let skippedEmpty = 0;
    if(!date) return {error:"実施日を選択してください。",items,skippedEmpty};
    if(!day) return {error:"実施日は月〜金を選択してください。",items,skippedEmpty};
    if(!targets.length) return {error:"対象の学年またはクラスを選択してください。",items,skippedEmpty};
    if(!Object.keys(subjects).length) return {error:"少なくとも1つの校時にテスト科目を入力してください。",items,skippedEmpty};
    targets.forEach(cls => {
      Object.entries(subjects).forEach(([pStr,subject]) => {
        const p = +pStr;
        if(!periodsForClass(cls).includes(p)) return;
        const lesson = getDaily(cls,date,day,p);
        if(!lesson){skippedEmpty++;return;}
        items.push({cls,date,day,p,subject,before:clone(lesson),beforeSubject:lesson.subject||"",teachers:teachersText(lesson),rooms:roomsText(lesson)});
      });
    });
    return {items,skippedEmpty,date,day,targets,subjects};
  }

  let previewItems = [];
  function invalidate(){
    previewItems=[];
    if($("#applyTestBatchBtn")) $("#applyTestBatchBtn").disabled=true;
    if($("#testBatchPreview")){ $("#testBatchPreview").classList.add("hidden"); $("#testBatchPreview").innerHTML=""; }
  }

  function preview(){
    const res=collect(),box=$("#testBatchPreview");
    if(!box)return;
    if(res.error){previewItems=[];$("#applyTestBatchBtn").disabled=true;box.classList.remove("hidden");box.innerHTML=`<div class="status warn">${esc(res.error)}</div>`;return;}
    previewItems=res.items;$("#applyTestBatchBtn").disabled=!previewItems.length;
    const label=$("#testTargetMode").value==="grade"?`${$("#testTargetValue").value}すべて`:$("#testTargetValue").value;
    const rows=previewItems.map(x=>`<tr><td>${esc(x.cls)}</td><td>${x.p}限</td><td>${esc(x.beforeSubject)}</td><td><strong>${esc(x.subject)}</strong></td><td>${esc(x.teachers||"—")}</td><td>${esc(x.rooms||"—")}</td></tr>`).join("");
    box.classList.remove("hidden");
    box.innerHTML=`<div class="status ok"><strong>${esc(label)}</strong>・${esc(res.date)}（${res.day}）／変更予定 ${previewItems.length}件${res.skippedEmpty?`・空き時間 ${res.skippedEmpty}件は対象外`:""}</div>${previewItems.length?`<div class="table-wrap"><table class="test-preview-table"><tr><th>クラス</th><th>校時</th><th>現在の科目</th><th>テスト科目</th><th>担当教員</th><th>教室</th></tr>${rows}</table></div>`:`<p class="muted">変更対象となる授業がありません。</p>`}<p class="small">担当教員・教室・欠員・代講情報は変更せず、科目名だけを書き換えます。空き時間には授業を追加しません。</p>`;
  }

  function apply(){
    if(!previewItems.length)return;
    const res=collect();if(res.error){alert(res.error);invalidate();return;}
    let changed=0;
    res.items.forEach(item=>{
      const cur=getDaily(item.cls,item.date,item.day,item.p);if(!cur)return;
      const updated=clone(cur);updated.subject=item.subject;
      setDaily(item.cls,item.date,item.day,item.p,updated);changed++;
    });
    const label=$("#testTargetMode").value==="grade"?`${$("#testTargetValue").value}すべて`:$("#testTargetValue").value;
    const periodText=Object.entries(subjectsByPeriod()).map(([p,s])=>`${p}限:${s}`).join(" / ");
    addHistory("テスト一括変更",`${res.date} ${label} ${changed}件　${periodText}`);
    save();if($("#dailyDate"))$("#dailyDate").value=res.date;invalidate();renderAll();alert(`${changed}件の科目名をテスト科目へ変更しました。担当教員・教室は変更していません。`);
  }

  function bind(){
    if(!$("#testBatchCard"))return;
    renderTargets();
    $("#testTargetMode").onchange=()=>{renderTargets();invalidate();};
    $("#testTargetValue").onchange=invalidate;
    $("#testBatchDate").onchange=invalidate;
    $("#previewTestBatchBtn").onclick=preview;
    $("#applyTestBatchBtn").onclick=apply;
    $$(".test-subject-input").forEach(el=>el.oninput=invalidate);
  }

  const oldRenderAll=renderAll;
  renderAll=function(){oldRenderAll();bind();};
  bind();
})();