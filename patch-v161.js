(() => {
  // v1.6.1: 教科内の教員順序変更 + 教科フィルター
  state.teacherOrder = state.teacherOrder || {};

  function ensureV161Order(){
    DEPARTMENTS.forEach(dep => {
      const members = state.teachers.filter(t => profileOf(t).department === dep);
      const existing = Array.isArray(state.teacherOrder[dep]) ? state.teacherOrder[dep] : [];
      state.teacherOrder[dep] = [
        ...existing.filter(t => members.includes(t)),
        ...members.filter(t => !existing.includes(t))
      ];
    });
  }

  function orderRank(name){
    const dep = profileOf(name).department;
    const i = (state.teacherOrder[dep] || []).indexOf(name);
    return i < 0 ? 999 : i;
  }

  sortedTeachers = function(){
    ensureV161Order();
    return [...state.teachers].sort((a,b) => {
      const dr = departmentRank(a) - departmentRank(b);
      if(dr) return dr;
      const or = orderRank(a) - orderRank(b);
      return or || a.localeCompare(b,"ja");
    });
  };

  function moveTeacher(name, delta){
    const dep = profileOf(name).department;
    if(!dep) return;
    ensureV161Order();
    const arr = state.teacherOrder[dep] || [];
    const i = arr.indexOf(name);
    const j = i + delta;
    if(i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    state.teacherOrder[dep] = arr;
    addHistory("教員表示順", `${dep}：${name}を${delta < 0 ? "上" : "下"}へ移動`);
    save();
    renderTeachers();
    renderDaily();
  }

  teacherCardHtml = function(name){
    const p = profileOf(name);
    let table = `<table class="availability-table"><tr><th>曜日</th>${ALL_PERIODS.map(x=>`<th>${x}限</th>`).join("")}</tr>`;
    DAYS.forEach(day => {
      table += `<tr><th>${day}</th>${ALL_PERIODS.map(per=>`<td><input class="availability-check" type="checkbox" data-teacher="${esc(name)}" data-day="${day}" data-period="${per}" ${p.availability[day][per]?"checked":""}></td>`).join("")}</tr>`;
    });
    table += "</table>";
    return `<div class="teacher-card" data-teacher="${esc(name)}">
      <div class="teacher-card-head">
        <div class="teacher-name-title">${esc(name)}</div>
        <div class="teacher-order-buttons">
          <button class="teacher-order-btn move-teacher-up" type="button" data-teacher="${esc(name)}" title="同じ教科内で上へ">↑</button>
          <button class="teacher-order-btn move-teacher-down" type="button" data-teacher="${esc(name)}" title="同じ教科内で下へ">↓</button>
        </div>
        <div><label>担当教科</label><select class="mini-select department-select" data-teacher="${esc(name)}">${departmentOptions(p.department)}</select></div>
        <div><label>勤務形態</label><select class="mini-select employment-select" data-teacher="${esc(name)}"><option ${p.employment==="常勤"?"selected":""}>常勤</option><option ${p.employment==="非常勤"?"selected":""}>非常勤</option></select></div>
        <button class="danger-outline delete-teacher" type="button" data-teacher="${esc(name)}">削除</button>
      </div>
      <div class="availability-wrap">${table}</div>
      <div class="availability-actions">
        <button class="sub all-on" type="button" data-teacher="${esc(name)}">全校時ON</button>
        <button class="sub all-off" type="button" data-teacher="${esc(name)}">全校時OFF</button>
      </div>
    </div>`;
  };

  renderTeachers = function(){
    const found = new Set(state.teachers);
    Object.values(state.base).forEach(g => Object.values(g).forEach(l => (l?.teachers || []).forEach(t => found.add(t))));
    state.teachers = [...found].filter(Boolean);
    state.teachers.forEach(t => { state.teacherProfiles[t] = normalizeProfile(state.teacherProfiles[t] || {}); });
    ensureV161Order();

    const filter = document.querySelector("#teacherFilterDepartment")?.value || "";
    const names = sortedTeachers().filter(name => !filter || profileOf(name).department === filter);
    $("#teacherCards").innerHTML = names.length
      ? names.map(name => teacherCardHtml(name)).join("")
      : `<p class="muted">該当する教員はいません。</p>`;
    bindTeacherCardEvents();
  };

  bindTeacherCardEvents = function(){
    $$(".department-select").forEach(el => el.onchange = () => {
      const t = el.dataset.teacher;
      profileOf(t).department = el.value;
      ensureV161Order();
      addHistory("教員設定", `${t}：担当教科 ${el.value || "未設定"}`);
      save(); renderAll();
    });
    $$(".employment-select").forEach(el => el.onchange = () => {
      const t=el.dataset.teacher,p=profileOf(t),old=p.employment;p.employment=el.value;
      if(old!=="常勤"&&p.employment==="常勤")p.availability=defaultAvailability(true);
      addHistory("教員設定",`${t}：勤務形態 ${p.employment}`);save();renderAll();
    });
    $$(".availability-check").forEach(el => el.onchange = () => {
      const t=el.dataset.teacher,day=el.dataset.day,per=+el.dataset.period;
      profileOf(t).availability[day][per]=el.checked;save();renderDaily();
    });
    $$(".all-on").forEach(b=>b.onclick=()=>{profileOf(b.dataset.teacher).availability=defaultAvailability(true);save();renderTeachers();renderDaily()});
    $$(".all-off").forEach(b=>b.onclick=()=>{profileOf(b.dataset.teacher).availability=defaultAvailability(false);save();renderTeachers();renderDaily()});
    $$(".move-teacher-up").forEach(b=>b.onclick=()=>moveTeacher(b.dataset.teacher,-1));
    $$(".move-teacher-down").forEach(b=>b.onclick=()=>moveTeacher(b.dataset.teacher,1));
    $$(".delete-teacher").forEach(b=>b.onclick=()=>{
      const t=b.dataset.teacher;
      if(!confirm(`${t}先生を教員設定から削除しますか？\n時間割内の名前は残ります。`))return;
      state.teachers=state.teachers.filter(x=>x!==t);
      ensureV161Order();
      delete state.teacherProfiles[t];save();renderAll();
    });
  };

  const cards = document.querySelector("#teacherCards");
  if(cards && !document.querySelector("#teacherFilterDepartment")){
    const bar = document.createElement("div");
    bar.className = "teacher-filter-bar";
    bar.innerHTML = `<div><label>教科で絞り込み</label><select id="teacherFilterDepartment"><option value="">すべての教科</option>${DEPARTMENTS.map(d=>`<option value="${d}">${d}</option>`).join("")}</select></div><div class="small">↑↓ボタンで、同じ教科内の表示順を変更できます。</div>`;
    cards.parentNode.insertBefore(bar,cards);
    $("#teacherFilterDepartment").onchange = renderTeachers;
  }

  const style = document.createElement("style");
  style.textContent = `.teacher-filter-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:end;justify-content:space-between;margin-top:12px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#fafbfc}.teacher-order-buttons{display:flex;gap:5px;margin-left:4px}.teacher-order-btn{padding:6px 9px;background:#eef2f8;border:1px solid var(--line)}`;
  document.head.appendChild(style);

  ensureV161Order();
  save();
  renderAll();
})();
