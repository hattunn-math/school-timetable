(() => {
  const selectedClasses = new Set();
  let previewItems = [];

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
    return "その他";
  }

  function subjectsByPeriod(){
    const out = {};
    $$(".test-subject-input").forEach(el => {
      const value = el.value.trim();
      if(value) out[+el.dataset.period] = value;
    });
    return out;
  }

  function targetClasses(){
    return state.classes.filter(c => selectedClasses.has(c));
  }

  function invalidate(){
    previewItems = [];
    const apply = $("#applyTestBatchBtn");
    if(apply) apply.disabled = true;
    const box = $("#testBatchPreview");
    if(box){
      box.classList.add("hidden");
      box.innerHTML = "";
    }
  }

  function summarizeSelection(targets){
    if(!targets.length) return "未選択";
    if(targets.length === state.classes.length) return "全クラス";
    const grades = ["1年","2年","3年"];
    const fullGrades = grades.filter(g => {
      const all = state.classes.filter(c => gradeOf(c) === g);
      return all.length && all.every(c => selectedClasses.has(c));
    });
    const covered = new Set(fullGrades.flatMap(g => state.classes.filter(c => gradeOf(c) === g)));
    const extras = targets.filter(c => !covered.has(c));
    return [...fullGrades, ...extras].join("・");
  }

  function renderClassChecks(){
    const box = $("#testClassChecks");
    if(!box) return;
    [...selectedClasses].forEach(c => { if(!state.classes.includes(c)) selectedClasses.delete(c); });
    const groups = ["1年","2年","3年","その他"];
    box.innerHTML = groups.map(g => {
      const classes = state.classes.filter(c => gradeOf(c) === g);
      if(!classes.length) return "";
      return `<div class="test-grade-group"><div class="test-grade-title">${esc(g)}</div><div class="test-class-grid">${classes.map(c => `<label class="test-class-check"><input type="checkbox" value="${esc(c)}" ${selectedClasses.has(c)?"checked":""}> <span>${esc(c)}</span></label>`).join("")}</div></div>`;
    }).join("");
    box.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.onchange = () => {
        if(input.checked) selectedClasses.add(input.value);
        else selectedClasses.delete(input.value);
        updateSelectionSummary();
        invalidate();
      };
    });
    updateSelectionSummary();
    ["1年","2年","3年"].forEach(g => {
      const b = document.querySelector(`[data-test-grade="${g}"]`);
      if(b) b.disabled = !state.classes.some(c => gradeOf(c) === g);
    });
  }

  function updateSelectionSummary(){
    const el = $("#testSelectionSummary");
    if(!el) return;
    const targets = targetClasses();
    el.textContent = targets.length ? `選択中：${targets.length}クラス（${summarizeSelection(targets)}）` : "選択中：0クラス";
  }

  function selectAll(){
    state.classes.forEach(c => selectedClasses.add(c));
    renderClassChecks();
    invalidate();
  }

  function clearAll(){
    selectedClasses.clear();
    renderClassChecks();
    invalidate();
  }

  function selectGrade(grade){
    state.classes.filter(c => gradeOf(c) === grade).forEach(c => selectedClasses.add(c));
    renderClassChecks();
    invalidate();
  }

  function ensureChooser(){
    const card = $("#testBatchCard");
    if(!card || $("#testClassChooser")) return;
    const mode = $("#testTargetMode"), value = $("#testTargetValue");
    if(mode?.parentElement) mode.parentElement.style.display = "none";
    if(value?.parentElement) value.parentElement.style.display = "none";
    const controls = card.querySelector(".test-batch-controls");
    if(!controls) return;
    const chooser = document.createElement("div");
    chooser.id = "testClassChooser";
    chooser.className = "test-class-chooser";
    chooser.innerHTML = `
      <div class="test-class-toolbar">
        <strong>対象クラス</strong>
        <button type="button" class="sub" id="testSelectAll">すべて選択</button>
        <button type="button" class="sub" id="testClearAll">すべて解除</button>
        <span class="test-grade-buttons">
          <button type="button" class="sub" data-test-grade="1年">1年</button>
          <button type="button" class="sub" data-test-grade="2年">2年</button>
          <button type="button" class="sub" data-test-grade="3年">3年</button>
        </span>
        <span id="testSelectionSummary" class="small"></span>
      </div>
      <p class="small muted">学年ボタンは現在の選択を残したまま、その学年のクラスを追加選択します。個別にチェックを外すこともできます。</p>
      <div id="testClassChecks"></div>`;
    controls.insertAdjacentElement("afterend", chooser);
    $("#testSelectAll").onclick = selectAll;
    $("#testClearAll").onclick = clearAll;
    chooser.querySelectorAll("[data-test-grade]").forEach(b => b.onclick = () => selectGrade(b.dataset.testGrade));
    renderClassChecks();
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
    if(!targets.length) return {error:"対象クラスを1つ以上選択してください。",items,skippedEmpty};
    if(!Object.keys(subjects).length) return {error:"少なくとも1つの校時にテスト科目を入力してください。",items,skippedEmpty};
    targets.forEach(cls => {
      Object.entries(subjects).forEach(([pStr,subject]) => {
        const p = +pStr;
        if(!periodsForClass(cls).includes(p)) return;
        const lesson = getDaily(cls,date,day,p);
        if(!lesson){ skippedEmpty++; return; }
        items.push({cls,date,day,p,subject,before:clone(lesson),beforeSubject:lesson.subject||"",teachers:teachersText(lesson),rooms:roomsText(lesson)});
      });
    });
    return {items,skippedEmpty,date,day,targets,subjects};
  }

  function preview(){
    const res = collect(), box = $("#testBatchPreview");
    if(!box) return;
    if(res.error){
      previewItems = [];
      $("#applyTestBatchBtn").disabled = true;
      box.classList.remove("hidden");
      box.innerHTML = `<div class="status warn">${esc(res.error)}</div>`;
      return;
    }
    previewItems = res.items;
    $("#applyTestBatchBtn").disabled = !previewItems.length;
    const rows = previewItems.map(x => `<tr><td>${esc(x.cls)}</td><td>${x.p}限</td><td>${esc(x.beforeSubject)}</td><td><strong>${esc(x.subject)}</strong></td><td>${esc(x.teachers||"—")}</td><td>${esc(x.rooms||"—")}</td></tr>`).join("");
    box.classList.remove("hidden");
    box.innerHTML = `<div class="status ok"><strong>${esc(summarizeSelection(res.targets))}</strong>・${esc(res.date)}（${res.day}）／変更予定 ${previewItems.length}件${res.skippedEmpty?`・空き時間 ${res.skippedEmpty}件は対象外`:""}</div>${previewItems.length?`<div class="table-wrap"><table class="test-preview-table"><tr><th>クラス</th><th>校時</th><th>現在の科目</th><th>テスト科目</th><th>担当教員</th><th>教室</th></tr>${rows}</table></div>`:`<p class="muted">変更対象となる授業がありません。</p>`}<p class="small">担当教員・教室・欠員・代講情報は維持します。合同授業の一部クラスだけを対象にした場合は、対象クラスだけを合同グループから分けて科目名を変更します。空き時間には授業を追加しません。</p>`;
  }

  function apply(){
    if(!previewItems.length) return;
    const res = collect();
    if(res.error){ alert(res.error); invalidate(); return; }
    const targetSet = new Set(res.targets);
    const itemMap = new Map(res.items.map(x => [`${x.cls}|${x.date}|${x.day}|${x.p}`, x]));
    const processed = new Set();
    let changed = 0;

    res.items.forEach(item => {
      const current = getDaily(item.cls,item.date,item.day,item.p);
      if(!current) return;
      const gid = current.groupId || `${item.cls}-${item.date}-${item.day}-${item.p}`;
      const groupKey = `${item.date}|${item.day}|${item.p}|${gid}|${item.subject}`;
      if(processed.has(groupKey)) return;

      const participants = Array.isArray(current.participants) && current.participants.length ? [...new Set(current.participants)] : [item.cls];
      const selectedParts = participants.filter(c => targetSet.has(c) && itemMap.has(`${c}|${item.date}|${item.day}|${item.p}`));
      const partsToChange = selectedParts.length ? selectedParts : [item.cls];
      const unchangedParts = participants.filter(c => !partsToChange.includes(c));

      if(!unchangedParts.length){
        const updated = clone(current);
        updated.subject = item.subject;
        updated.participants = participants;
        participants.forEach(c => { setDaily(c,item.date,item.day,item.p,clone(updated)); changed++; });
      }else{
        const changedLesson = clone(current);
        changedLesson.subject = item.subject;
        changedLesson.participants = partsToChange;
        changedLesson.groupId = uniqueId();
        partsToChange.forEach(c => { setDaily(c,item.date,item.day,item.p,clone(changedLesson)); changed++; });

        const unchangedLesson = clone(current);
        unchangedLesson.participants = unchangedParts;
        unchangedParts.forEach(c => setDaily(c,item.date,item.day,item.p,clone(unchangedLesson)));
      }
      processed.add(groupKey);
    });

    const periodText = Object.entries(subjectsByPeriod()).map(([p,s]) => `${p}限:${s}`).join(" / ");
    addHistory("テスト一括変更", `${res.date} ${summarizeSelection(res.targets)} ${changed}件　${periodText}`);
    save();
    if($("#dailyDate")) $("#dailyDate").value = res.date;
    invalidate();
    renderAll();
    alert(`${changed}件の科目名をテスト科目へ変更しました。担当教員・教室は変更していません。`);
  }

  function bind(){
    ensureChooser();
    if(!$("#testBatchCard")) return;
    if($("#testTargetMode")?.parentElement) $("#testTargetMode").parentElement.style.display = "none";
    if($("#testTargetValue")?.parentElement) $("#testTargetValue").parentElement.style.display = "none";
    renderClassChecks();
    $("#testBatchDate").onchange = invalidate;
    $("#previewTestBatchBtn").onclick = preview;
    $("#applyTestBatchBtn").onclick = apply;
    $$(".test-subject-input").forEach(el => el.oninput = invalidate);
  }

  const style = document.createElement("style");
  style.textContent = `
    .test-class-chooser{margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface,#fff)}
    .test-class-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .test-grade-buttons{display:flex;flex-wrap:wrap;gap:6px}
    #testSelectionSummary{margin-left:auto;font-weight:700}
    .test-grade-group{margin-top:10px}
    .test-grade-title{font-weight:700;margin-bottom:6px}
    .test-class-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px}
    .test-class-check{display:flex;align-items:center;gap:6px;min-height:38px;padding:6px 9px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer}
    .test-class-check input{width:18px;height:18px;margin:0}
    @media(max-width:700px){#testSelectionSummary{width:100%;margin-left:0}.test-class-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);

  const previousRenderAll = renderAll;
  renderAll = function(){
    previousRenderAll();
    bind();
  };
  bind();
})();
