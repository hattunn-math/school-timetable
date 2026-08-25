(() => {
  const TEST_BATCH_VERSION = "1.9";
  let testPreviewItems = [];

  function gradeLabelOfClass(cls){
    const m = String(cls || "").match(/^(.+?年)/);
    return m ? m[1] : "";
  }

  function uniqueGrades(){
    return [...new Set(state.classes.map(gradeLabelOfClass).filter(Boolean))];
  }

  function testTargetClasses(){
    const mode = $("#testTargetMode")?.value || "grade";
    const value = $("#testTargetValue")?.value || "";
    if(mode === "class") return state.classes.includes(value) ? [value] : [];
    return state.classes.filter(c => gradeLabelOfClass(c) === value);
  }

  function preserveTestSubjects(){
    const map = {};
    $$(".test-subject-input").forEach(el => { map[el.dataset.period] = el.value; });
    return map;
  }

  function renderTestTargetOptions(){
    const modeEl = $("#testTargetMode"), valueEl = $("#testTargetValue");
    if(!modeEl || !valueEl) return;
    const old = valueEl.value;
    const grades = uniqueGrades();
    if(modeEl.value === "grade" && !grades.length) modeEl.value = "class";
    const values = modeEl.value === "grade" ? grades : state.classes;
    valueEl.innerHTML = values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if(values.includes(old)) valueEl.value = old;
  }

  function renderTestPeriodInputs(){
    const box = $("#testPeriodSubjects");
    if(!box) return;
    const keep = preserveTestSubjects();
    const ps = allPeriodsForSchool();
    box.innerHTML = ps.map(p => `
      <div class="test-period-row">
        <label>${p}限</label>
        <input class="test-subject-input" data-period="${p}" placeholder="テスト科目（空欄なら変更しない）" value="${esc(keep[p] || "")}">
      </div>`).join("");
    $$(".test-subject-input").forEach(el => el.addEventListener("input", invalidateTestPreview));
  }

  function invalidateTestPreview(){
    testPreviewItems = [];
    const apply = $("#applyTestBatchBtn");
    if(apply) apply.disabled = true;
    const box = $("#testBatchPreview");
    if(box){
      box.classList.add("hidden");
      box.innerHTML = "";
    }
  }

  function subjectByPeriod(){
    const out = {};
    $$(".test-subject-input").forEach(el => {
      const s = el.value.trim();
      if(s) out[+el.dataset.period] = s;
    });
    return out;
  }

  function collectTestPreview(){
    const date = $("#testBatchDate")?.value || currentDate();
    const day = dayNameForDate(date);
    const targets = testTargetClasses();
    const subjects = subjectByPeriod();
    const items = [];
    let skippedEmpty = 0;

    if(!date) return {error:"実施日を選択してください。",items,skippedEmpty};
    if(!day) return {error:"実施日は月〜金を選択してください。",items,skippedEmpty};
    if(!targets.length) return {error:"対象の学年またはクラスを選択してください。",items,skippedEmpty};
    if(!Object.keys(subjects).length) return {error:"少なくとも1つの校時にテスト科目を入力してください。",items,skippedEmpty};

    targets.forEach(cls => {
      Object.entries(subjects).forEach(([pStr, subject]) => {
        const p = +pStr;
        if(!periodsForClass(cls).includes(p)) return;
        const lesson = getDaily(cls,date,day,p);
        if(!lesson){ skippedEmpty++; return; }
        items.push({
          cls,date,day,p,subject,
          before: clone(lesson),
          beforeSubject: lesson.subject || "",
          teachers: teachersText(lesson),
          rooms: roomsText(lesson),
          groupId: lesson.groupId || ""
        });
      });
    });
    return {items,skippedEmpty,date,day,targets,subjects};
  }

  function previewTestBatch(){
    const res = collectTestPreview();
    const box = $("#testBatchPreview");
    if(!box) return;
    if(res.error){
      testPreviewItems = [];
      $("#applyTestBatchBtn").disabled = true;
      box.classList.remove("hidden");
      box.innerHTML = `<div class="status warn">${esc(res.error)}</div>`;
      return;
    }
    testPreviewItems = res.items;
    $("#applyTestBatchBtn").disabled = !testPreviewItems.length;
    const targetLabel = $("#testTargetMode").value === "grade" ? `${$("#testTargetValue").value}すべて` : $("#testTargetValue").value;
    const rows = testPreviewItems.map(x => `<tr>
      <td>${esc(x.cls)}</td><td>${x.p}限</td>
      <td>${esc(x.beforeSubject)}</td><td><strong>${esc(x.subject)}</strong></td>
      <td>${esc(x.teachers || "—")}</td><td>${esc(x.rooms || "—")}</td>
    </tr>`).join("");
    box.classList.remove("hidden");
    box.innerHTML = `
      <div class="status ok"><strong>${esc(targetLabel)}</strong>・${esc(res.date)}（${res.day}）／変更予定 ${testPreviewItems.length}件${res.skippedEmpty?`・空き時間 ${res.skippedEmpty}件は対象外`:""}</div>
      ${testPreviewItems.length ? `<div class="table-wrap"><table class="test-preview-table"><tr><th>クラス</th><th>校時</th><th>現在の科目</th><th>テスト科目</th><th>担当教員</th><th>教室</th></tr>${rows}</table></div>` : `<p class="muted">変更対象となる授業がありません。</p>`}
      <p class="small">担当教員・教室・欠員・代講情報は変更せず、科目名だけを書き換えます。空き時間には授業を追加しません。</p>`;
  }

  function applyTestBatch(){
    if(!testPreviewItems.length) return;
    const fresh = collectTestPreview();
    if(fresh.error){ alert(fresh.error); invalidateTestPreview(); return; }

    const targetSet = new Set(fresh.targets);
    const itemMap = new Map(fresh.items.map(x => [`${x.cls}|${x.date}|${x.day}|${x.p}`,x]));
    const processed = new Set();
    let changed = 0;

    fresh.items.forEach(item => {
      const current = getDaily(item.cls,item.date,item.day,item.p);
      if(!current) return;
      const gid = current.groupId || `${item.cls}-${item.date}-${item.day}-${item.p}`;
      const groupKey = `${item.date}|${item.day}|${item.p}|${gid}|${item.subject}`;
      if(processed.has(groupKey)) return;

      const participants = Array.isArray(current.participants) && current.participants.length ? [...current.participants] : [item.cls];
      const selectedParts = participants.filter(c => targetSet.has(c) && itemMap.has(`${c}|${item.date}|${item.day}|${item.p}`));
      const partsToWrite = selectedParts.length ? selectedParts : [item.cls];
      const allParticipantsSelected = participants.every(c => partsToWrite.includes(c));
      const updated = clone(current);
      updated.subject = item.subject;
      updated.participants = allParticipantsSelected ? participants : partsToWrite;
      if(!allParticipantsSelected) updated.groupId = uniqueId();

      partsToWrite.forEach(c => {
        const cur = getDaily(c,item.date,item.day,item.p);
        if(!cur) return;
        const copy = clone(updated);
        setDaily(c,item.date,item.day,item.p,copy);
        changed++;
      });
      processed.add(groupKey);
    });

    const mode = $("#testTargetMode").value;
    const target = $("#testTargetValue").value;
    const label = mode === "grade" ? `${target}すべて` : target;
    const date = $("#testBatchDate").value;
    const periodText = Object.entries(subjectByPeriod()).map(([p,s]) => `${p}限:${s}`).join(" / ");
    addHistory("テスト一括変更", `${date} ${label} ${changed}件　${periodText}`);
    save();
    if($("#dailyDate")) $("#dailyDate").value = date;
    invalidateTestPreview();
    renderAll();
    alert(`${changed}件の科目名をテスト科目へ変更しました。担当教員・教室は変更していません。`);
  }

  function clearTestBatch(){
    $$(".test-subject-input").forEach(el => el.value = "");
    invalidateTestPreview();
  }

  function injectTestBatchUi(){
    if($("#testBatchCard")) return;
    const daily = $("#daily");
    if(!daily) return;
    const toolbar = daily.querySelector(".toolbar.card");
    const card = document.createElement("div");
    card.id = "testBatchCard";
    card.className = "card test-batch-card";
    card.innerHTML = `
      <div class="heading-row">
        <div><h2>テスト一括変更</h2><p class="muted">学年またはクラスを指定し、普段の担当教員・教室を残したまま科目名だけをテスト科目へ変更します。</p></div>
      </div>
      <div class="test-batch-controls">
        <div><label>実施日</label><input id="testBatchDate" type="date"></div>
        <div><label>対象単位</label><select id="testTargetMode"><option value="grade">学年</option><option value="class">クラス</option></select></div>
        <div><label>対象</label><select id="testTargetValue"></select></div>
      </div>
      <div id="testPeriodSubjects" class="test-period-grid"></div>
      <div class="actions">
        <button id="previewTestBatchBtn" class="primary" type="button">変更内容をプレビュー</button>
        <button id="applyTestBatchBtn" class="sub" type="button" disabled>この内容で反映</button>
        <button id="clearTestBatchBtn" class="sub" type="button">入力をクリア</button>
      </div>
      <div id="testBatchPreview" class="hidden"></div>`;
    toolbar.insertAdjacentElement("afterend",card);

    $("#testBatchDate").value = currentDate() || "";
    renderTestTargetOptions();
    renderTestPeriodInputs();
    $("#testTargetMode").onchange = () => { renderTestTargetOptions(); invalidateTestPreview(); };
    $("#testTargetValue").onchange = invalidateTestPreview;
    $("#testBatchDate").onchange = invalidateTestPreview;
    $("#previewTestBatchBtn").onclick = previewTestBatch;
    $("#applyTestBatchBtn").onclick = applyTestBatch;
    $("#clearTestBatchBtn").onclick = clearTestBatch;
  }

  const style = document.createElement("style");
  style.textContent = `
    .test-batch-card{border-left:4px solid #667085}
    .test-batch-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
    .test-period-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:12px}
    .test-period-row{display:grid;grid-template-columns:48px 1fr;gap:7px;align-items:center}
    .test-period-row label{margin:0;text-align:right;font-weight:700;color:var(--text)}
    .test-period-row input{width:100%;min-width:0}
    .test-preview-table{min-width:850px;width:100%}
    .test-preview-table th,.test-preview-table td{padding:7px 8px;text-align:left}
  `;
  document.head.appendChild(style);

  injectTestBatchUi();

  const prevRenderAll = renderAll;
  renderAll = function(){
    prevRenderAll();
    if($("#testBatchCard")){
      renderTestTargetOptions();
      renderTestPeriodInputs();
    }
  };

  renderAll();
})();