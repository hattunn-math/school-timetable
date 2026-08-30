(() => {
  function installVisibleArrows1281(){
    const table=$("#dailyTable");
    if(!table) return;
    table.querySelectorAll("td.slot[data-class][data-date][data-day][data-period]").forEach(td=>{
      const cls=td.dataset.class,date=td.dataset.date,day=td.dataset.day,p=+td.dataset.period;
      const l=getDaily(cls,date,day,p);
      if(!l){ td.querySelector(".cell-arrow-controls128")?.remove(); return; }

      let wrap=td.querySelector(".cell-arrow-controls128");
      if(!wrap){
        wrap=document.createElement("div");
        wrap.className="cell-arrow-controls128";
        td.appendChild(wrap);
      }
      wrap.innerHTML="";

      const ps=periodsForClass(cls).map(Number);
      const make=(delta,label,title)=>{
        const b=document.createElement("button");
        b.type="button";
        b.className="cell-arrow128";
        b.textContent=label;
        b.title=title;
        b.dataset.delta=String(delta);
        b.addEventListener("click",e=>{
          e.preventDefault();
          e.stopPropagation();
          const mover=window.arrowMove128;
          if(typeof mover==="function") mover(td,delta);
          else alert("矢印移動機能の読み込みに失敗しています。ページを再読み込みしてください。");
        });
        wrap.appendChild(b);
      };

      if(ps.includes(p-1)) make(-1,"▲","1校時上へ移動／入れ替え");
      if(ps.includes(p+1)) make(1,"▼","1校時下へ移動／入れ替え");
      if(!wrap.childElementCount) wrap.remove();
    });
  }

  const style=document.createElement("style");
  style.textContent=`
    #dailyTable td.slot{position:relative!important;overflow:hidden!important;padding-right:31px!important}
    #dailyTable .cell-arrow-controls128{
      position:absolute!important;right:4px!important;top:50%!important;transform:translateY(-50%)!important;
      display:flex!important;flex-direction:column!important;gap:4px!important;z-index:50!important;
      opacity:1!important;visibility:visible!important;pointer-events:auto!important;
    }
    #dailyTable .cell-arrow128{
      display:block!important;width:24px!important;height:24px!important;min-width:24px!important;
      padding:0!important;margin:0!important;border:1px solid #2f6f9f!important;border-radius:5px!important;
      background:#fff!important;color:#174e78!important;font-size:11px!important;font-weight:700!important;
      line-height:22px!important;box-shadow:0 1px 3px rgba(0,0,0,.18)!important;cursor:pointer!important;
      opacity:1!important;visibility:visible!important;pointer-events:auto!important;
    }
    #dailyTable .cell-arrow128:hover{background:#eaf4fb!important}
  `;
  document.head.appendChild(style);

  const prevRenderDaily1281=renderDaily;
  renderDaily=function(){
    const r=prevRenderDaily1281();
    setTimeout(installVisibleArrows1281,0);
    return r;
  };

  const prevRenderAll1281=renderAll;
  renderAll=function(){
    const r=prevRenderAll1281();
    setTimeout(installVisibleArrows1281,0);
    return r;
  };

  // MutationObserverは使わない。ボタン自身のDOM更新を再検知して
  // 無限に作り直すとクリックが成立しなくなるため。
  setTimeout(installVisibleArrows1281,0);
})();
