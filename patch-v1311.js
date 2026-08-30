(() => {
  function syncDirectSwap1311(){
    const btn=$("#directSwapBtn131");
    const sel=$("#directSwapPeriod131");
    if(!btn||!sel)return;
    const td=$("#dailyTable td.manual-selected-cell129[data-class][data-date][data-day][data-period]");
    btn.disabled=!td;
    sel.disabled=!td;
    if(!td)return;
    const from=+td.dataset.period;
    [...sel.options].forEach(o=>o.disabled=(+o.value===from));
    if(+sel.value===from){
      const alt=[...sel.options].find(o=>!o.disabled);
      if(alt)sel.value=alt.value;
    }
  }

  // v1.29 の stopImmediatePropagation より前に拾い、
  // セル選択処理が終わった直後に状態を同期する。
  document.addEventListener("click",e=>{
    const td=e.target.closest?.("#dailyTable td.slot[data-class][data-date][data-day][data-period]");
    if(!td)return;
    setTimeout(syncDirectSwap1311,0);
  },true);

  const prevDaily1311=renderDaily;
  renderDaily=function(){
    const r=prevDaily1311();
    setTimeout(syncDirectSwap1311,0);
    return r;
  };

  const prevAll1311=renderAll;
  renderAll=function(){
    const r=prevAll1311();
    setTimeout(syncDirectSwap1311,0);
    return r;
  };

  const clear=$("#clearSelected129");
  if(clear)clear.addEventListener("click",()=>setTimeout(syncDirectSwap1311,0));

  setTimeout(syncDirectSwap1311,0);
})();
