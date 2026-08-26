(() => {
  function renameBatchUi(){
    const card = $("#testBatchCard");
    if(!card) return;

    const heading = card.querySelector("h2");
    if(heading) heading.textContent = "一括変更";

    const desc = card.querySelector(".heading-row .muted");
    if(desc) desc.textContent = "学年や複数クラスを指定し、普段の担当教員・教室を残したまま科目名だけを一括で変更します。";

    card.querySelectorAll(".test-subject-input").forEach(el => {
      el.placeholder = "変更後の科目（空欄なら変更しない）";
    });

    const preview = $("#testBatchPreview");
    if(preview && !preview.classList.contains("hidden")){
      preview.querySelectorAll("th").forEach(th => {
        if(th.textContent.trim() === "テスト科目") th.textContent = "変更後の科目";
      });
    }
  }

  function ensureCollapsible(){
    const card = $("#testBatchCard");
    if(!card || $("#batchCollapseBody")) return;

    const headingRow = card.querySelector(".heading-row");
    if(!headingRow) return;

    let headingActions = headingRow.querySelector(".batch-heading-actions");
    if(!headingActions){
      headingActions = document.createElement("div");
      headingActions.className = "batch-heading-actions";
      headingRow.appendChild(headingActions);
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "batchCollapseToggle";
    toggle.className = "sub batch-collapse-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "開く ▼";
    headingActions.appendChild(toggle);

    const body = document.createElement("div");
    body.id = "batchCollapseBody";
    body.className = "batch-collapse-body hidden";

    [...card.children].forEach(child => {
      if(child !== headingRow) body.appendChild(child);
    });
    card.appendChild(body);

    toggle.onclick = () => {
      const willOpen = body.classList.contains("hidden");
      body.classList.toggle("hidden", !willOpen);
      toggle.setAttribute("aria-expanded", String(willOpen));
      toggle.textContent = willOpen ? "閉じる ▲" : "開く ▼";
    };
  }

  const originalAddHistory = addHistory;
  addHistory = function(type, detail){
    if(type === "テスト一括変更") type = "一括変更";
    return originalAddHistory(type, detail);
  };

  const style = document.createElement("style");
  style.textContent = `
    #testBatchCard .heading-row{align-items:center}
    .batch-heading-actions{margin-left:auto;display:flex;align-items:center}
    .batch-collapse-toggle{white-space:nowrap;min-width:92px}
    .batch-collapse-body.hidden{display:none!important}
    .batch-collapse-body{padding-top:4px}
    @media(max-width:700px){
      #testBatchCard .heading-row{gap:10px}
      .batch-heading-actions{margin-left:0}
    }
  `;
  document.head.appendChild(style);

  const previousRenderAll = renderAll;
  renderAll = function(){
    previousRenderAll();
    renameBatchUi();
    ensureCollapsible();
  };

  renameBatchUi();
  ensureCollapsible();
})();
