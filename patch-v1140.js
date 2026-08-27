(() => {
  const EMPLOYMENT_CATEGORIES = ["常勤","非常勤","ALT","実習助手","中学"];
  state.teacherCategories = state.teacherCategories && typeof state.teacherCategories === "object" ? state.teacherCategories : {};

  function ensureTeacherCategories(){
    Object.keys(state.teacherCategories).forEach(name => {
      if(!state.teachers.includes(name)) delete state.teacherCategories[name];
    });
    state.teachers.forEach(name => {
      if(!EMPLOYMENT_CATEGORIES.includes(state.teacherCategories[name])){
        const base = profileOf(name).employment === "非常勤" ? "非常勤" : "常勤";
        state.teacherCategories[name] = base;
      }
    });
  }

  function teacherCategoryOf(name){
    ensureTeacherCategories();
    return state.teacherCategories[name] || (profileOf(name).employment === "非常勤" ? "非常勤" : "常勤");
  }
  window.teacherCategoryOf = teacherCategoryOf;
  window.TEACHER_EMPLOYMENT_CATEGORIES = EMPLOYMENT_CATEGORIES;

  function categoryOptions(selected){
    return EMPLOYMENT_CATEGORIES.map(v => `<option value="${esc(v)}" ${v===selected?"selected":""}>${esc(v)}</option>`).join("");
  }

  function refreshAddTeacherCategorySelect(){
    const select = $("#teacherEmployment");
    if(!select) return;
    const old = EMPLOYMENT_CATEGORIES.includes(select.value) ? select.value : "常勤";
    select.innerHTML = categoryOptions(old);
    select.value = old;
    const label = select.closest("div")?.querySelector("label");
    if(label) label.textContent = "勤務区分";
  }

  teacherCardHtml = function(name){
    const p = profileOf(name);
    const category = teacherCategoryOf(name);
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
        <div><label>勤務区分</label><select class="mini-select employment-select" data-teacher="${esc(name)}">${categoryOptions(category)}</select></div>
        <button class="danger-outline delete-teacher" type="button" data-teacher="${esc(name)}">削除</button>
      </div>
      <div class="availability-wrap">${table}</div>
      <div class="availability-actions">
        <button class="sub all-on" type="button" data-teacher="${esc(name)}">全校時ON</button>
        <button class="sub all-off" type="button" data-teacher="${esc(name)}">全校時OFF</button>
      </div>
    </div>`;
  };

  const previousBindTeacherCardEvents = bindTeacherCardEvents;
  bindTeacherCardEvents = function(){
    previousBindTeacherCardEvents();
    $$(".employment-select").forEach(el => el.onchange = () => {
      const name = el.dataset.teacher;
      const category = EMPLOYMENT_CATEGORIES.includes(el.value) ? el.value : "常勤";
      const p = profileOf(name);
      const oldCategory = teacherCategoryOf(name);
      state.teacherCategories[name] = category;
      p.employment = category === "常勤" ? "常勤" : "非常勤";
      if(oldCategory !== "常勤" && category === "常勤") p.availability = defaultAvailability(true);
      addHistory("教員設定", `${name}：勤務区分 ${category}`);
      save();
      renderAll();
    });
  };

  addTeacher = function(){
    const name = $("#teacherName").value.trim();
    const department = $("#teacherDepartment").value;
    const category = $("#teacherEmployment").value;
    if(!name){ alert("教員名を入力してください。"); return; }
    if(!department){ alert("担当教科を選択してください。"); return; }
    if(state.teachers.includes(name)){ alert("同じ教員名がすでに登録されています。"); return; }
    const normalizedCategory = EMPLOYMENT_CATEGORIES.includes(category) ? category : "常勤";
    state.teachers.push(name);
    state.teacherProfiles[name] = {
      department,
      employment: normalizedCategory === "常勤" ? "常勤" : "非常勤",
      availability: defaultAvailability(normalizedCategory === "常勤")
    };
    state.teacherCategories[name] = normalizedCategory;
    $("#teacherName").value = "";
    addHistory("教員追加", `${name}（${department}・${normalizedCategory}）`);
    save();
    renderAll();
  };

  const previousRenderTeachers = renderTeachers;
  renderTeachers = function(){
    ensureTeacherCategories();
    previousRenderTeachers();
  };

  function bindAddTeacherButton(){
    refreshAddTeacherCategorySelect();
    const btn = $("#addTeacherBtn");
    if(btn) btn.onclick = addTeacher;
  }

  const previousRenderAll = renderAll;
  renderAll = function(){
    ensureTeacherCategories();
    previousRenderAll();
    bindAddTeacherButton();
  };

  ensureTeacherCategories();
  bindAddTeacherButton();
  save();
  renderTeachers();
  renderDaily();
})();
