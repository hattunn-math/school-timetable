(() => {
  let teacherDayDepartmentFilter = "";

  function ensureTeacherDayFilter(){
    const table = $("#teacherDayTable");
    if(!table || $("#teacherDayDepartmentFilter")) return;
    const wrap = table.closest(".table-wrap");
    if(!wrap) return;

    const bar = document.createElement("div");
    bar.className = "teacher-day-filter-bar";
    bar.innerHTML = `
      <div>
        <label for="teacherDayDepartmentFilter">教科で絞り込み</label>
        <select id="teacherDayDepartmentFilter">
          <option value="">全教科</option>
          ${DEPARTMENTS.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}
        </select>
      </div>
      <div id="teacherDayFilterSummary" class="small muted"></div>`;
    wrap.parentNode.insertBefore(bar, wrap);

    const select = $("#teacherDayDepartmentFilter");
    select.value = teacherDayDepartmentFilter;
    select.onchange = () => {
      teacherDayDepartmentFilter = select.value;
      applyTeacherDayFilter();
    };
  }

  function applyTeacherDayFilter(){
    ensureTeacherDayFilter();
    const table = $("#teacherDayTable");
    const summary = $("#teacherDayFilterSummary");
    if(!table) return;

    let visible = 0;
    let total = 0;
    [...table.querySelectorAll("tr")].forEach((tr, index) => {
      if(index === 0) return;
      const name = tr.querySelector(".teacher-name-cell strong")?.textContent?.trim() || "";
      if(!name){
        tr.style.display = "";
        return;
      }
      total++;
      const department = profileOf(name).department || "";
      const show = !teacherDayDepartmentFilter || department === teacherDayDepartmentFilter;
      tr.style.display = show ? "" : "none";
      if(show) visible++;
    });

    const select = $("#teacherDayDepartmentFilter");
    if(select && select.value !== teacherDayDepartmentFilter) select.value = teacherDayDepartmentFilter;
    if(summary){
      summary.textContent = teacherDayDepartmentFilter
        ? `${teacherDayDepartmentFilter}：${visible}名を表示` 
        : `全教科：${total}名を表示`;
    }
  }

  const previousRenderTeacherDayTable = renderTeacherDayTable;
  renderTeacherDayTable = function(date, day){
    previousRenderTeacherDayTable(date, day);
    ensureTeacherDayFilter();
    applyTeacherDayFilter();
  };

  const style = document.createElement("style");
  style.textContent = `
    .teacher-day-filter-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;justify-content:space-between;margin:10px 0 12px;padding:10px 12px;border:1px solid var(--line,var(--border));border-radius:9px;background:#fafbfc}
    .teacher-day-filter-bar>div:first-child{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .teacher-day-filter-bar label{font-weight:700}
    .teacher-day-filter-bar select{min-width:140px}
    @media(max-width:700px){.teacher-day-filter-bar{align-items:stretch}.teacher-day-filter-bar>div{width:100%}.teacher-day-filter-bar select{width:100%}}
  `;
  document.head.appendChild(style);

  ensureTeacherDayFilter();
  applyTeacherDayFilter();
})();
