(() => {
  let teacherDayDepartmentFilter = "";
  let teacherDaySortMode = "department";

  function teacherLessonCount(name, date, day){
    if(!day) return 0;
    return allPeriodsForSchool().reduce((sum, p) => sum + teacherEntriesForPeriod(name, date, day, p).length, 0);
  }

  function ensureTeacherDayFilter(){
    const table = $("#teacherDayTable");
    if(!table || $("#teacherDayDepartmentFilter")) return;
    const wrap = table.closest(".table-wrap");
    if(!wrap) return;

    const bar = document.createElement("div");
    bar.className = "teacher-day-filter-bar";
    bar.innerHTML = `
      <div class="teacher-day-filter-controls">
        <div>
          <label for="teacherDayDepartmentFilter">教科で絞り込み</label>
          <select id="teacherDayDepartmentFilter">
            <option value="">全教科</option>
            ${DEPARTMENTS.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label for="teacherDaySortMode">並び順</label>
          <select id="teacherDaySortMode">
            <option value="department">教科順</option>
            <option value="desc">授業数：多い順</option>
            <option value="asc">授業数：少ない順</option>
          </select>
        </div>
      </div>
      <div id="teacherDayFilterSummary" class="small muted"></div>`;
    wrap.parentNode.insertBefore(bar, wrap);

    const depSelect = $("#teacherDayDepartmentFilter");
    depSelect.value = teacherDayDepartmentFilter;
    depSelect.onchange = () => {
      teacherDayDepartmentFilter = depSelect.value;
      applyTeacherDayFilterAndSort();
    };

    const sortSelect = $("#teacherDaySortMode");
    sortSelect.value = teacherDaySortMode;
    sortSelect.onchange = () => {
      teacherDaySortMode = sortSelect.value;
      applyTeacherDayFilterAndSort();
    };
  }

  function applyTeacherDayFilterAndSort(){
    ensureTeacherDayFilter();
    const table = $("#teacherDayTable");
    const summary = $("#teacherDayFilterSummary");
    if(!table) return;

    const date = currentDate();
    const day = dayNameForDate(date);
    const rows = [...table.querySelectorAll("tr")].slice(1);
    let visible = 0;
    let total = 0;

    rows.forEach((tr, originalIndex) => {
      const name = tr.querySelector(".teacher-name-cell strong")?.textContent?.trim() || "";
      tr.dataset.originalIndex = String(originalIndex);
      if(!name) return;
      total++;
      const department = profileOf(name).department || "";
      const count = teacherLessonCount(name, date, day);
      tr.dataset.lessonCount = String(count);
      tr.dataset.teacherName = name;
      tr.dataset.department = department;
      const show = !teacherDayDepartmentFilter || department === teacherDayDepartmentFilter;
      tr.style.display = show ? "" : "none";
      if(show) visible++;

      const info = tr.querySelector(".teacher-name-cell .small");
      if(info){
        const base = `${department || "教科未設定"}・${profileOf(name).employment}`;
        info.textContent = `${base}・授業数 ${count}`;
      }
    });

    if(teacherDaySortMode !== "department"){
      const tbody = table.tBodies[0] || table;
      rows.sort((a,b) => {
        const ac = +(a.dataset.lessonCount || 0);
        const bc = +(b.dataset.lessonCount || 0);
        const diff = teacherDaySortMode === "desc" ? bc - ac : ac - bc;
        if(diff) return diff;
        return +(a.dataset.originalIndex || 0) - +(b.dataset.originalIndex || 0);
      }).forEach(tr => tbody.appendChild(tr));
    }

    const depSelect = $("#teacherDayDepartmentFilter");
    if(depSelect && depSelect.value !== teacherDayDepartmentFilter) depSelect.value = teacherDayDepartmentFilter;
    const sortSelect = $("#teacherDaySortMode");
    if(sortSelect && sortSelect.value !== teacherDaySortMode) sortSelect.value = teacherDaySortMode;

    if(summary){
      const depText = teacherDayDepartmentFilter ? `${teacherDayDepartmentFilter}：${visible}名` : `全教科：${total}名`;
      const sortText = teacherDaySortMode === "desc" ? "授業数の多い順" : teacherDaySortMode === "asc" ? "授業数の少ない順" : "教科順";
      summary.textContent = `${depText}を表示／${sortText}`;
    }
  }

  const previousRenderTeacherDayTable = renderTeacherDayTable;
  renderTeacherDayTable = function(date, day){
    previousRenderTeacherDayTable(date, day);
    ensureTeacherDayFilter();
    applyTeacherDayFilterAndSort();
  };

  const style = document.createElement("style");
  style.textContent = `
    .teacher-day-filter-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;justify-content:space-between;margin:10px 0 12px;padding:10px 12px;border:1px solid var(--line,var(--border));border-radius:9px;background:#fafbfc}
    .teacher-day-filter-controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap}
    .teacher-day-filter-controls>div{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .teacher-day-filter-bar label{font-weight:700}
    .teacher-day-filter-bar select{min-width:140px}
    @media(max-width:700px){.teacher-day-filter-bar{align-items:stretch}.teacher-day-filter-bar>div{width:100%}.teacher-day-filter-controls>div{width:100%;align-items:stretch;flex-direction:column}.teacher-day-filter-bar select{width:100%}}
  `;
  document.head.appendChild(style);

  ensureTeacherDayFilter();
  applyTeacherDayFilterAndSort();
})();
